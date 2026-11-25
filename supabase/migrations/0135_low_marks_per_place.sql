-- ---------------------------------------------------------------------------
-- 0135  Advanced Inventory A4: a low mark for each place
--
-- 0133 made a product's low mark (low_stock_threshold) its reorder point, one
-- figure for every place. A business with a main shop and a stall does not
-- run them alike: twenty bags is low at the shop and a full shelf at the
-- stall. A place may now have its own mark for a product, which wins there;
-- everywhere else the product's own mark still applies.
--
-- place_low_mark            one row per place and product that has its own
--                           mark. Settings, not history: changed in place,
--                           every change in the audit log.
-- set_place_low_marks(p)    set or clear a product's marks place by place,
--                           owners and managers with Advanced Inventory
-- reorder_suggestions       as in 0133, rewritten: the mark at a place is its
--                           own, else the product's; a product with no mark
--                           of its own can still be due at a place that has
--                           one; and a place with its own mark is asked to
--                           restock even if it has never held the product,
--                           because someone said it should.
--
-- Tables and columns read: catalogue_item, location, stock_movement,
-- stock_order and stock_order_line (0132), stock_receipt and
-- stock_receipt_line (0125), require_purchasing (0132), audit_log.
-- ---------------------------------------------------------------------------

create table if not exists place_low_mark (
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  item_id uuid not null references catalogue_item(id),
  low_at numeric(14,3) not null check (low_at >= 0),
  updated_by uuid references business_membership(id),
  updated_at timestamptz not null default now(),
  primary key (location_id, item_id)
);
create index if not exists place_low_mark_business on place_low_mark (business_id);
alter table place_low_mark enable row level security;
revoke all on place_low_mark from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Setting a product's marks, place by place. A place sent with no figure
-- goes back to the product's own mark.
-- ---------------------------------------------------------------------------
create or replace function set_place_low_marks(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_item uuid := (p->>'item_id')::uuid;
  v_mark jsonb;
  v_place uuid;
  v_low numeric;
  v_was jsonb;
  v_set int := 0;
  v_cleared int := 0;
begin
  perform require_purchasing(v_actor, v_business);
  perform 1 from catalogue_item where id = v_item and business_id = v_business;
  if not found then raise exception 'item_not_found'; end if;
  if jsonb_typeof(p->'marks') <> 'array' then raise exception 'marks_required'; end if;

  select coalesce(jsonb_object_agg(location_id, low_at), '{}') into v_was
    from place_low_mark where item_id = v_item;

  for v_mark in select * from jsonb_array_elements(p->'marks') loop
    v_place := (v_mark->>'location_id')::uuid;
    perform 1 from location where id = v_place and business_id = v_business;
    if not found then raise exception 'location_not_found'; end if;
    v_low := nullif(v_mark->>'low_at', '')::numeric;
    if v_low is not null and v_low < 0 then raise exception 'low_at_invalid'; end if;
    if v_low is null then
      delete from place_low_mark where location_id = v_place and item_id = v_item;
      if found then v_cleared := v_cleared + 1; end if;
    else
      insert into place_low_mark (business_id, location_id, item_id, low_at, updated_by, updated_at)
      values (v_business, v_place, v_item, v_low, v_actor, now())
      on conflict (location_id, item_id) do update
        set low_at = excluded.low_at, updated_by = excluded.updated_by, updated_at = now();
      v_set := v_set + 1;
    end if;
  end loop;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'inventory.place_low_marks.set', 'catalogue_item', v_item,
          jsonb_build_object('marks', p->'marks', 'was', v_was));

  return jsonb_build_object('item_id', v_item, 'set', v_set, 'cleared', v_cleared);
end
$fn$;

-- ---------------------------------------------------------------------------
-- What to reorder, place by place (0133, rewritten)
-- ---------------------------------------------------------------------------
create or replace function reorder_suggestions(p_business uuid)
returns table (
  location_id uuid,
  item_id uuid,
  available numeric,
  low_at numeric,
  on_order numeric,
  reorder_quantity numeric,
  supplier_id uuid,
  unit_cost numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with items as (
    select ci.id, ci.low_stock_threshold, ci.reorder_quantity, ci.preferred_supplier_id, ci.average_cost
      from catalogue_item ci
     where ci.business_id = p_business and ci.active and ci.track_stock
  ),
  places as (
    select l.id from location l where l.business_id = p_business and l.active
  ),
  marks as (
    select pm.location_id, pm.item_id, pm.low_at from place_low_mark pm where pm.business_id = p_business
  ),
  stock as (
    select m.location_id, m.item_id, sum(m.quantity) as available
      from stock_movement m
     where m.business_id = p_business
     group by m.location_id, m.item_id
  ),
  coming as (
    select o.location_id, l.item_id, sum(greatest(l.ordered - l.received, 0)) as qty
      from stock_order o join stock_order_line l on l.document_id = o.document_id
     where o.business_id = p_business and o.status = 'open'
     group by o.location_id, l.item_id
  ),
  due as (
    select pl.id as location_id, i.id as item_id, coalesce(s.available, 0) as available,
           coalesce(mk.low_at, i.low_stock_threshold) as low_at, coalesce(c.qty, 0) as on_order,
           i.reorder_quantity, i.preferred_supplier_id, i.average_cost,
           s.item_id is not null as held_here, mk.item_id is not null as own_mark
      from items i
      cross join places pl
      left join marks mk on mk.location_id = pl.id and mk.item_id = i.id
      left join stock s on s.location_id = pl.id and s.item_id = i.id
      left join coming c on c.location_id = pl.id and c.item_id = i.id
  )
  select d.location_id, d.item_id, d.available, d.low_at, d.on_order, d.reorder_quantity, d.preferred_supplier_id,
         coalesce(
           (select rl.unit_cost from stock_receipt r join stock_receipt_line rl on rl.receipt_id = r.id
             where r.business_id = p_business and r.supplier_id = d.preferred_supplier_id
               and rl.item_id = d.item_id and rl.unit_cost is not null
             order by r.received_at desc limit 1),
           round(d.average_cost, 2))
    from due d
   where d.low_at is not null
     and d.available + d.on_order <= d.low_at
     -- A place that never held the product is not asked to restock it,
     -- unless it has its own mark or the business has only the one place.
     and (d.held_here or d.own_mark or (select count(*) from places) = 1)
$fn$;

revoke all on function set_place_low_marks(jsonb) from public, anon, authenticated;
revoke all on function reorder_suggestions(uuid) from public, anon, authenticated;
grant execute on function set_place_low_marks(jsonb) to service_role;
grant execute on function reorder_suggestions(uuid) to service_role;
