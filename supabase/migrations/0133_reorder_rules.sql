-- ---------------------------------------------------------------------------
-- 0133  Advanced Inventory A3: reorder rules
--
-- INVENTORY_CORE_PLAN.md, decision 9 names reorder rules as Advanced
-- Inventory. A rule here is three things on a product:
--
--   low mark           low_stock_threshold, which already exists (0002) and
--                      already drives "Low" on Inventory and Home. It is the
--                      reorder point. Not a second threshold.
--   how many to order  reorder_quantity (new)
--   who from           preferred_supplier_id (new), one of the business's
--                      suppliers (0054)
--
-- reorder_suggestions(business) lists, for each place, every counted product
-- whose stock available there (on hand less shop holds, every movement at
-- that place summed) is at or under its low mark, and is not already
-- covered by what is still to come on open orders to that place (0132).
-- The suggested quantity is the rule's, or none when no rule says how many,
-- so the owner types it rather than being handed a guess. The price is
-- what that supplier last charged for it, else its average cost (0125).
--
-- Nothing orders itself. The Orders tab shows the suggestions grouped by
-- supplier and place, and "Draft this order" opens Order stock filled in
-- for the owner to check, change and place.
--
-- set_reorder_rule(p)   owners and managers with Advanced Inventory
--
-- Tables and columns read: catalogue_item (business_id, active,
-- track_stock, low_stock_threshold, average_cost), stock_movement,
-- location (active), stock_order and stock_order_line (0132), stock_receipt
-- and stock_receipt_line (0125), supplier, require_purchasing (0132),
-- audit_log.
-- ---------------------------------------------------------------------------

alter table catalogue_item add column if not exists reorder_quantity numeric(14,3);
alter table catalogue_item add column if not exists preferred_supplier_id uuid references supplier(id);

alter table catalogue_item drop constraint if exists catalogue_item_reorder_quantity_positive;
alter table catalogue_item add constraint catalogue_item_reorder_quantity_positive
  check (reorder_quantity is null or reorder_quantity > 0);

-- ---------------------------------------------------------------------------
-- Setting a product's rule
-- ---------------------------------------------------------------------------
create or replace function set_reorder_rule(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_item catalogue_item%rowtype;
  v_low numeric := nullif(p->>'low_at', '')::numeric;
  v_qty numeric := nullif(p->>'reorder_quantity', '')::numeric;
  v_supplier uuid := nullif(p->>'supplier_id', '')::uuid;
begin
  perform require_purchasing(v_actor, v_business);
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business for update;
  if not found then raise exception 'item_not_found'; end if;
  if v_low is not null and v_low < 0 then raise exception 'low_at_invalid'; end if;
  if v_qty is not null and v_qty <= 0 then raise exception 'reorder_quantity_invalid'; end if;
  if v_qty is not null and v_low is null then raise exception 'low_at_required'; end if;
  if v_supplier is not null then
    perform 1 from supplier where id = v_supplier and business_id = v_business and active;
    if not found then raise exception 'supplier_not_found'; end if;
  end if;

  update catalogue_item
     set low_stock_threshold = v_low,
         reorder_quantity = v_qty,
         preferred_supplier_id = v_supplier,
         track_stock = true,
         updated_at = now()
   where id = v_item.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'inventory.reorder_rule.set', 'catalogue_item', v_item.id,
          jsonb_build_object('low_at', v_low, 'reorder_quantity', v_qty, 'supplier_id', v_supplier,
            'was', jsonb_build_object('low_at', v_item.low_stock_threshold, 'reorder_quantity', v_item.reorder_quantity,
              'supplier_id', v_item.preferred_supplier_id)));

  return jsonb_build_object('item_id', v_item.id, 'low_at', v_low, 'reorder_quantity', v_qty, 'supplier_id', v_supplier);
end
$fn$;

-- ---------------------------------------------------------------------------
-- What to reorder, place by place
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
     where ci.business_id = p_business and ci.active and ci.track_stock and ci.low_stock_threshold is not null
  ),
  places as (
    select l.id from location l where l.business_id = p_business and l.active
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
  )
  select pl.id, i.id, coalesce(s.available, 0), i.low_stock_threshold, coalesce(c.qty, 0),
         i.reorder_quantity, i.preferred_supplier_id,
         coalesce(
           (select rl.unit_cost from stock_receipt r join stock_receipt_line rl on rl.receipt_id = r.id
             where r.business_id = p_business and r.supplier_id = i.preferred_supplier_id
               and rl.item_id = i.id and rl.unit_cost is not null
             order by r.received_at desc limit 1),
           round(i.average_cost, 2))
    from items i
    cross join places pl
    left join stock s on s.location_id = pl.id and s.item_id = i.id
    left join coming c on c.location_id = pl.id and c.item_id = i.id
   where coalesce(s.available, 0) + coalesce(c.qty, 0) <= i.low_stock_threshold
     -- A place that has never held the product is not asked to restock it,
     -- unless the business has only the one place.
     and (s.item_id is not null or (select count(*) from places) = 1)
$fn$;

revoke all on function set_reorder_rule(jsonb) from public, anon, authenticated;
revoke all on function reorder_suggestions(uuid) from public, anon, authenticated;
grant execute on function set_reorder_rule(jsonb) to service_role;
grant execute on function reorder_suggestions(uuid) to service_role;
