-- ---------------------------------------------------------------------------
-- 0137  Advanced Inventory A5: expiry dates and batches
--
-- INVENTORY_CORE_PLAN.md section 8, approved 25 Nov 2026 (decisions 1 to 6).
--
-- A product is switched to "has expiry dates" (catalogue_item.tracks_expiry,
-- off by default). Only those products change. For them, stock at each
-- place is held in batches: a product, a place, an expiry date (or none,
-- the "unknown date" pool), the batch number on the box, and a cost.
--
-- What is in a batch is never typed. It is the sum of its batch movements,
-- and every stock movement of an expiring product is allocated to batches
-- when it is written, by a trigger, so a till's sale arriving offline is
-- allocated the moment it lands and the till itself does not change:
--   receiving            the batch the receipt line names (receive_stock)
--   a transfer arriving  the same batches that left the other place
--   any other decrease   the batch that expires first (first expiry, first
--                        out): sales, damage, transfers out, short counts
--   a return, a count    the batch that expires last at that place
--   that came up over
--   anything else in     the unknown-date pool
--   more out than the    the rest from the unknown-date pool, which may go
--   batches hold         below zero, as stock can
-- A failure to allocate never stops the movement: it is written to the
-- audit log and the sale stands (decision 4, the till keeps selling).
--
-- Switching a product on puts what is already on the shelf at each place
-- in the unknown-date pool, so batches add up to the shelf from the start.
--
-- stock_batch, stock_batch_movement   append-only, erasable like history
-- set_expiry_tracking(p)              switch a product on or off
-- write_off_expired(p)                write off what is left of one batch
-- expiry_report(business, days)       batches expired or expiring within
--                                     the window, with what is left
-- expiry_summary(business)            the figures for Inventory and Home
--
-- Capability inventory.expiry in Advanced Inventory. Owners and managers
-- (inventory.manage) switch products and write off.
--
-- Tables and columns read: catalogue_item (track_stock, average_cost,
-- base_price), stock_movement, stock_balance (0002), location,
-- stock_receipt and stock_receipt_line (0125), require_permission (0081),
-- business_capabilities (0044), audit_log, refuse_history_change (0072).
-- ---------------------------------------------------------------------------

insert into capability (key, name, owning_domain, class, description) values
  ('inventory.expiry', 'Expiry dates and batches', 'inventory', 'advanced', 'Know what expires when, place by place, and write it off')
on conflict (key) do update
  set name = excluded.name, owning_domain = excluded.owning_domain,
      class = excluded.class, description = excluded.description;
insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('advanced_inventory', 'inventory.expiry', false)
on conflict (product_set_key, capability_key) do update set embedded = excluded.embedded;

alter table catalogue_item add column if not exists tracks_expiry boolean not null default false;

create table if not exists stock_batch (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  item_id uuid not null references catalogue_item(id),
  batch_code text,
  expires_on date,
  unit_cost numeric(14,4),
  receipt_line_id uuid references stock_receipt_line(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_batch_place_item on stock_batch (location_id, item_id);
create index if not exists stock_batch_business_expiry on stock_batch (business_id, expires_on);
alter table stock_batch enable row level security;
revoke all on stock_batch from anon, authenticated;

create table if not exists stock_batch_movement (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references stock_batch(id),
  movement_id uuid references stock_movement(id),
  quantity numeric(14,3) not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists stock_batch_movement_batch on stock_batch_movement (batch_id);
create index if not exists stock_batch_movement_movement on stock_batch_movement (movement_id);
alter table stock_batch_movement enable row level security;
revoke all on stock_batch_movement from anon, authenticated;

drop trigger if exists stock_batch_append_only on stock_batch;
create trigger stock_batch_append_only before update or delete on stock_batch
  for each row execute function refuse_history_change();
drop trigger if exists stock_batch_movement_append_only on stock_batch_movement;
create trigger stock_batch_movement_append_only before update or delete on stock_batch_movement
  for each row execute function refuse_history_change();

-- ---------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------

-- A batch at a place with this number and date, made if there is none. The
-- unknown-date pool is the batch with neither.
create or replace function stock_batch_for(p_business uuid, p_location uuid, p_item uuid,
                                           p_code text, p_expires date, p_cost numeric)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare v_id uuid;
begin
  select id into v_id from stock_batch
   where location_id = p_location and item_id = p_item
     and batch_code is not distinct from p_code and expires_on is not distinct from p_expires
   order by created_at limit 1;
  if v_id is null then
    insert into stock_batch (business_id, location_id, item_id, batch_code, expires_on, unit_cost)
    values (p_business, p_location, p_item, p_code, p_expires, p_cost)
    returning id into v_id;
  end if;
  return v_id;
end
$fn$;

create or replace function stock_batch_left(p_batch uuid)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(quantity), 0) from stock_batch_movement where batch_id = p_batch;
$fn$;

-- Every movement of an expiring product, allocated as it is written.
create or replace function stock_batch_allocate()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tracks boolean;
  v_b record;
  v_left numeric;
  v_take numeric;
  v_target uuid;
  v_done numeric := 0;
begin
  if new.kind in ('reservation', 'reservation_release') then return null; end if;
  -- receive_stock and write_off_expired allocate their own movements.
  if coalesce(current_setting('ascend.batch_manual', true), '') = 'on' then return null; end if;
  select tracks_expiry into v_tracks from catalogue_item where id = new.item_id;
  if not coalesce(v_tracks, false) or new.quantity = 0 then return null; end if;

  begin
    if new.kind = 'transfer_in' and new.source_entity_type = 'stock_transfer' then
      -- The same batches that left: what this transfer took out of them.
      for v_b in
        select sb.batch_code, sb.expires_on, max(sb.unit_cost) as unit_cost, sum(-bm.quantity) as qty
          from stock_batch_movement bm
          join stock_batch sb on sb.id = bm.batch_id
          join stock_movement m on m.id = bm.movement_id
         where m.source_entity_type = 'stock_transfer' and m.source_entity_id = new.source_entity_id
           and m.item_id = new.item_id and m.kind = 'transfer_out'
         group by sb.batch_code, sb.expires_on
         order by sb.expires_on nulls last
      loop
        exit when v_done >= new.quantity;
        v_take := least(v_b.qty, new.quantity - v_done);
        continue when v_take <= 0;
        v_target := stock_batch_for(new.business_id, new.location_id, new.item_id, v_b.batch_code, v_b.expires_on, v_b.unit_cost);
        insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_target, new.id, v_take);
        v_done := v_done + v_take;
      end loop;
      if new.quantity - v_done > 0 then
        v_target := stock_batch_for(new.business_id, new.location_id, new.item_id, null, null, null);
        insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_target, new.id, new.quantity - v_done);
      end if;

    elsif new.quantity < 0 then
      -- First expiry, first out; the unknown-date pool last.
      v_left := -new.quantity;
      for v_b in
        select sb.id, stock_batch_left(sb.id) as left_qty
          from stock_batch sb
         where sb.location_id = new.location_id and sb.item_id = new.item_id
         order by sb.expires_on nulls last, sb.created_at
      loop
        exit when v_left <= 0;
        continue when v_b.left_qty <= 0;
        v_take := least(v_b.left_qty, v_left);
        insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_b.id, new.id, -v_take);
        v_left := v_left - v_take;
      end loop;
      if v_left > 0 then
        v_target := stock_batch_for(new.business_id, new.location_id, new.item_id, null, null, null);
        insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_target, new.id, -v_left);
      end if;

    else
      -- A return or a count that came up over goes back to the batch that
      -- expires last; anything else that is not a receipt has no date.
      v_target := null;
      if new.kind in ('customer_return', 'count_correction') then
        select sb.id into v_target from stock_batch sb
         where sb.location_id = new.location_id and sb.item_id = new.item_id and sb.expires_on is not null
         order by sb.expires_on desc, sb.created_at desc limit 1;
      end if;
      if v_target is null then
        v_target := stock_batch_for(new.business_id, new.location_id, new.item_id, null, null, null);
      end if;
      insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_target, new.id, new.quantity);
    end if;
  exception when others then
    insert into audit_log (business_id, action, entity_type, entity_id, detail)
    values (new.business_id, 'inventory.batch.allocation_failed', 'stock_movement', new.id,
            jsonb_build_object('error', sqlerrm, 'item_id', new.item_id, 'kind', new.kind));
  end;
  return null;
end
$fn$;

drop trigger if exists stock_batch_allocate on stock_movement;
create trigger stock_batch_allocate after insert on stock_movement
  for each row execute function stock_batch_allocate();

-- ---------------------------------------------------------------------------
-- Switching a product on or off
-- ---------------------------------------------------------------------------
create or replace function set_expiry_tracking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_on boolean := coalesce((p->>'on')::boolean, false);
  v_item catalogue_item%rowtype;
  v_place record;
  v_gap numeric;
  v_pool uuid;
  v_settled int := 0;
begin
  perform require_permission(v_actor, v_business, array['inventory.manage']);
  perform 1 from business_capabilities(v_business) where capability_key = 'inventory.expiry';
  if not found then raise exception 'not_entitled'; end if;
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business for update;
  if not found then raise exception 'item_not_found'; end if;

  update catalogue_item set tracks_expiry = v_on, track_stock = track_stock or v_on, updated_at = now() where id = v_item.id;

  -- Turning on: whatever the batches do not account for at each place (all
  -- of it, the first time) goes to the unknown-date pool, so the batches
  -- add up to the shelf.
  if v_on then
    for v_place in
      select l.id,
             coalesce((select sum(quantity) from stock_movement m
                        where m.location_id = l.id and m.item_id = v_item.id
                          and m.kind not in ('reservation', 'reservation_release')), 0) as on_hand,
             coalesce((select sum(bm.quantity) from stock_batch_movement bm join stock_batch sb on sb.id = bm.batch_id
                        where sb.location_id = l.id and sb.item_id = v_item.id), 0) as in_batches
        from location l where l.business_id = v_business
    loop
      v_gap := v_place.on_hand - v_place.in_batches;
      if v_gap <> 0 then
        v_pool := stock_batch_for(v_business, v_place.id, v_item.id, null, null, null);
        insert into stock_batch_movement (batch_id, quantity, note)
        values (v_pool, v_gap, 'On the shelf when expiry dates were switched on');
        v_settled := v_settled + 1;
      end if;
    end loop;
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, case when v_on then 'inventory.expiry.on' else 'inventory.expiry.off' end,
          'catalogue_item', v_item.id, jsonb_build_object('places_settled', v_settled));

  return jsonb_build_object('item_id', v_item.id, 'on', v_on, 'places_settled', v_settled);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Writing off what is left of one batch
-- ---------------------------------------------------------------------------
create or replace function write_off_expired(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_batch stock_batch%rowtype;
  v_left numeric;
  v_item catalogue_item%rowtype;
  v_cost numeric;
  v_movement uuid;
begin
  perform require_permission(v_actor, v_business, array['inventory.manage']);
  perform 1 from business_capabilities(v_business) where capability_key = 'inventory.expiry';
  if not found then raise exception 'not_entitled'; end if;
  select * into v_batch from stock_batch where id = (p->>'batch_id')::uuid and business_id = v_business;
  if not found then raise exception 'batch_not_found'; end if;
  perform 1 from stock_batch where id = v_batch.id for update;
  v_left := stock_batch_left(v_batch.id);
  if v_left <= 0 then
    return jsonb_build_object('batch_id', v_batch.id, 'written_off', 0, 'unchanged', true);
  end if;
  select * into v_item from catalogue_item where id = v_batch.item_id;
  v_cost := coalesce(v_batch.unit_cost, v_item.average_cost);

  perform set_config('ascend.batch_manual', 'on', true);
  insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                              source_entity_type, source_entity_id, actor_membership_id, occurred_at)
  values (v_business, v_batch.location_id, v_batch.item_id, 'damage_loss', -v_left, v_cost,
          'Expired' || case when v_batch.expires_on is not null then ' ' || to_char(v_batch.expires_on, 'DD Mon YYYY') else '' end
            || coalesce(', batch ' || v_batch.batch_code, '')
            || coalesce(': ' || nullif(btrim(coalesce(p->>'note', '')), ''), ''),
          'stock_batch', v_batch.id, v_actor, now())
  returning id into v_movement;
  insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_batch.id, v_movement, -v_left);
  perform set_config('ascend.batch_manual', '', true);

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'inventory.expired.written_off', 'stock_batch', v_batch.id,
          jsonb_build_object('quantity', v_left, 'value', round(v_left * coalesce(v_cost, v_item.base_price, 0), 2),
            'expires_on', v_batch.expires_on, 'batch_code', v_batch.batch_code));

  return jsonb_build_object('batch_id', v_batch.id, 'written_off', v_left,
    'value', round(v_left * coalesce(v_cost, v_item.base_price, 0), 2), 'unchanged', false);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
create or replace function expiry_report(p_business uuid, p_days int default 30)
returns table (
  batch_id uuid, location_id uuid, item_id uuid, batch_code text, expires_on date,
  days_left int, quantity numeric, unit_value numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select sb.id, sb.location_id, sb.item_id, sb.batch_code, sb.expires_on,
         (sb.expires_on - current_date)::int,
         stock_batch_left(sb.id),
         coalesce(sb.unit_cost, ci.average_cost, ci.base_price, 0)
    from stock_batch sb join catalogue_item ci on ci.id = sb.item_id
   where sb.business_id = p_business and sb.expires_on is not null
     and sb.expires_on <= current_date + p_days
     and stock_batch_left(sb.id) > 0
   order by sb.expires_on, sb.created_at;
$fn$;

create or replace function expiry_summary(p_business uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with r as (select * from expiry_report(p_business, 30))
  select jsonb_build_object(
    'expired_batches', (select count(*) from r where days_left < 0),
    'expired_quantity', (select coalesce(sum(quantity), 0) from r where days_left < 0),
    'expired_value', (select coalesce(round(sum(quantity * unit_value), 2), 0) from r where days_left < 0),
    'soon_batches', (select count(*) from r where days_left >= 0),
    'soon_value', (select coalesce(round(sum(quantity * unit_value), 2), 0) from r where days_left >= 0),
    'unknown_quantity', (select coalesce(sum(stock_batch_left(sb.id)), 0) from stock_batch sb
                          join catalogue_item ci on ci.id = sb.item_id
                         where sb.business_id = p_business and sb.expires_on is null and ci.tracks_expiry));
$fn$;

revoke all on function stock_batch_for(uuid, uuid, uuid, text, date, numeric) from public, anon, authenticated;
revoke all on function stock_batch_left(uuid) from public, anon, authenticated;
revoke all on function stock_batch_allocate() from public, anon, authenticated;
revoke all on function set_expiry_tracking(jsonb) from public, anon, authenticated;
revoke all on function write_off_expired(jsonb) from public, anon, authenticated;
revoke all on function expiry_report(uuid, int) from public, anon, authenticated;
revoke all on function expiry_summary(uuid) from public, anon, authenticated;
grant execute on function set_expiry_tracking(jsonb) to service_role;
grant execute on function write_off_expired(jsonb) to service_role;
grant execute on function expiry_report(uuid, int) to service_role;
grant execute on function expiry_summary(uuid) to service_role;

-- receive_stock as in 0132, with five counted substitutions: an optional
-- expires_on and batch_code per line, and the batch written from the line.
create or replace function receive_stock(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_location uuid := (p->>'location_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_client_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_supplier text := nullif(btrim(coalesce(p->>'supplier_name', '')), '');
  v_paid boolean := coalesce((p->>'paid')::boolean, false);
  v_method text := nullif(p->>'payment_method', '');
  v_existing stock_receipt%rowtype;
  v_receipt uuid;
  v_supplier_id uuid;
  v_currency text;
  v_line jsonb;
  v_item catalogue_item%rowtype;
  v_qty numeric(14,3);
  v_cost numeric(14,2);
  v_on_hand numeric(14,3);
  v_movement uuid;
  v_total numeric(14,2) := 0;
  v_costed int := 0;
  v_lines int := 0;
  v_event uuid;
  v_order uuid := nullif(p->>'purchase_order_id', '')::uuid;
  v_so stock_order%rowtype;
  v_order_status text;
  v_batch uuid;
  v_line_id uuid;
begin
  if v_client_ref is null then raise exception 'client_ref_required'; end if;

  -- The same receipt sent twice (a tap on a bad connection) is one receipt.
  select * into v_existing from stock_receipt where business_id = v_business and client_ref = v_client_ref;
  if found then
    return jsonb_build_object('receipt_id', v_existing.id, 'duplicate', true,
      'total_cost', v_existing.total_cost, 'paid', v_existing.paid);
  end if;

  perform 1 from location where id = v_location and business_id = v_business;
  if not found then raise exception 'location_not_found'; end if;
  if v_actor is not null then
    perform 1 from business_membership where id = v_actor and business_id = v_business and status = 'active';
    if not found then raise exception 'actor_not_member'; end if;
  end if;

  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'lines_required';
  end if;
  if jsonb_array_length(p->'lines') > 200 then raise exception 'too_many_lines'; end if;
  if v_paid and v_method is null then raise exception 'payment_method_required'; end if;
  if v_method is not null and v_method not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'payment_method_invalid';
  end if;

  if v_supplier is not null then
    select id into v_supplier_id from supplier
     where business_id = v_business and active and lower(btrim(name)) = lower(v_supplier)
     limit 1;
  end if;
  -- Against an order (0132): the order's own supplier, at the place it was
  -- to be delivered to, and only while it is still open.
  if v_order is not null then
    select * into v_so from stock_order where document_id = v_order and business_id = v_business for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_so.status <> 'open' then raise exception 'order_not_open'; end if;
    if v_so.location_id <> v_location then raise exception 'order_other_place'; end if;
    v_supplier_id := v_so.supplier_id;
    select coalesce(v_supplier, name) into v_supplier from supplier where id = v_so.supplier_id;
  end if;

  select c.currency_code into v_currency
    from business b join country_config c on c.code = b.country_code
   where b.id = v_business;

  -- First pass: check every line and add up the cost, so the receipt is
  -- written once, whole, and never edited afterwards.
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid;
    if not found or v_item.business_id <> v_business then raise exception 'item_not_found'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_required'; end if;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;
    if v_cost is not null and v_cost < 0 then raise exception 'cost_invalid'; end if;
    -- 0137: an expiry date, when sent, must be a date.
    begin
      perform nullif(v_line->>'expires_on', '')::date;
    exception when others then
      raise exception 'expiry_invalid';
    end;
    if v_cost is not null then
      v_total := v_total + round(v_qty * v_cost, 2);
      v_costed := v_costed + 1;
    end if;
  end loop;
  if v_paid and v_total <= 0 then raise exception 'cost_required_when_paid'; end if;

  insert into stock_receipt (business_id, location_id, client_ref, supplier_name, supplier_id, reference, note,
                             total_cost, costed_lines, paid, payment_method, currency_code, actor_membership_id,
                             purchase_order_id)
  values (v_business, v_location, v_client_ref, v_supplier, v_supplier_id,
          nullif(btrim(coalesce(p->>'reference', '')), ''), nullif(btrim(coalesce(p->>'note', '')), ''),
          case when v_costed > 0 then v_total end, v_costed, v_paid, case when v_paid then v_method end,
          coalesce(v_currency, 'GHS'), v_actor, v_order)
  returning id into v_receipt;

  -- Second pass: the stock lands, and the average cost moves.
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid for update;
    v_qty := (v_line->>'quantity')::numeric;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;

    -- Moving average across every place, before this delivery lands. Stock
    -- already below zero (sold offline before it was received) counts as
    -- none, so the new cost is not dragged by a figure that never existed.
    if v_cost is not null then
      select coalesce(sum(quantity), 0) into v_on_hand from stock_movement
       where business_id = v_business and item_id = v_item.id
         and kind not in ('reservation', 'reservation_release');
      if v_item.average_cost is null or v_on_hand <= 0 then
        update catalogue_item set average_cost = v_cost, updated_at = now() where id = v_item.id;
      else
        update catalogue_item
           set average_cost = round((v_on_hand * v_item.average_cost + v_qty * v_cost) / (v_on_hand + v_qty), 4),
               updated_at = now()
         where id = v_item.id;
      end if;
    end if;

    -- 0137: an expiring product's batch comes from this line, not the trigger.
    if v_item.tracks_expiry then perform set_config('ascend.batch_manual', 'on', true); end if;
    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_business, v_location, v_item.id, 'restock', v_qty, v_cost,
            case when v_supplier is not null then 'From ' || v_supplier end,
            'stock_receipt', v_receipt, v_actor, now())
    returning id into v_movement;

    insert into stock_receipt_line (receipt_id, item_id, quantity, unit_cost, movement_id)
    values (v_receipt, v_item.id, v_qty, v_cost, v_movement)
    returning id into v_line_id;

    -- 0137: the batch this line names (its date and the number on the box),
    -- or the unknown-date pool when no date was given.
    if v_item.tracks_expiry then
      v_batch := stock_batch_for(v_business, v_location, v_item.id,
                                 nullif(btrim(coalesce(v_line->>'batch_code', '')), ''),
                                 nullif(v_line->>'expires_on', '')::date,
                                 coalesce(v_cost, v_item.average_cost));
      insert into stock_batch_movement (batch_id, movement_id, quantity) values (v_batch, v_movement, v_qty);
      perform set_config('ascend.batch_manual', '', true);
    end if;

    -- What arrived counts against the order. Something not on the order
    -- (the supplier sent extra) is received all the same.
    if v_order is not null then
      perform set_config('ascend.order_step', 'receive', true);
      update stock_order_line set received = received + v_qty where document_id = v_order and item_id = v_item.id;
      perform set_config('ascend.order_step', '', true);
    end if;

    -- Receiving is the moment an item becomes worth counting (as in 0035).
    if not v_item.track_stock then
      update catalogue_item set track_stock = true, updated_at = now() where id = v_item.id;
    end if;
    v_lines := v_lines + 1;
  end loop;

  if v_order is not null then
    perform 1 from stock_order_line where document_id = v_order and received < ordered;
    v_order_status := case when found then 'open' else 'received' end;
    perform set_config('ascend.order_step', 'receive', true);
    update stock_order set status = v_order_status,
           received_at = case when v_order_status = 'received' then now() end
     where document_id = v_order;
    perform set_config('ascend.order_step', '', true);
  end if;

  if v_paid then
    insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                                 currency_code, category, location_id, counterparty, method, verification,
                                 occurred_at, detail)
    values (v_business, 'inventory', 'stock_receipt', v_receipt, 'expense', 'cash', 'out', v_total,
            coalesce(v_currency, 'GHS'), 'stock_purchases', v_location, v_supplier, v_method, 'merchant_declared',
            now(), jsonb_strip_nulls(jsonb_build_object(
              'reference', nullif(btrim(coalesce(p->>'reference', '')), ''),
              'lines', v_lines, 'costed_lines', v_costed, 'recorded_by', v_actor)))
    on conflict (source_type, source_id, kind) do nothing
    returning id into v_event;
  end if;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    verification, payload, business_date
  ) values (
    'inventory.stock.received', v_business, v_location, v_actor,
    'business_mobile', 'pos', 'stock_receipt', v_receipt,
    'merchant_declared',
    jsonb_strip_nulls(jsonb_build_object('lines', v_lines, 'total_cost', case when v_costed > 0 then v_total end,
      'paid', v_paid, 'supplier', v_supplier)),
    current_date
  );

  return jsonb_build_object('receipt_id', v_receipt, 'duplicate', false, 'lines', v_lines,
    'total_cost', case when v_costed > 0 then v_total end, 'paid', v_paid, 'money_out_event', v_event,
    'order_status', v_order_status);
end
$fn$;

revoke all on function receive_stock(jsonb) from public, anon, authenticated;
grant execute on function receive_stock(jsonb) to service_role;

-- erase_history (0132) learns the two batch tables. Batch movements before
-- batches, both before stock movements.
-- erase_history as in 0132, with two counted substitutions.
create or replace function erase_history(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_table text := p->>'table';
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_by text := nullif(btrim(coalesce(p->>'requested_by', '')), '');
  v_ids text[];
  v_count int;
  v_scope text;
begin
  if v_table is null or v_table not in (
    'stock_movement', 'ledger_entry', 'balance_entry', 'evidence_record',
    'score_result', 'audit_log', 'report_access_log',
    'transaction_line', 'commerce_adjustment', 'financial_event',
    'financial_period_change', 'risk_case_event',
    'stock_receipt', 'stock_receipt_line',
    'stock_count', 'stock_count_line',
    'stock_transfer', 'stock_transfer_line',
    'stock_order', 'stock_order_line',
    'stock_batch', 'stock_batch_movement'
  ) then
    raise exception 'erase_history: not a protected history table: %', coalesce(v_table, '(none)');
  end if;
  if v_business is null then
    raise exception 'erase_history: business_id is required';
  end if;
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'erase_history: say why, in at least 10 characters';
  end if;
  if v_by is null then
    raise exception 'erase_history: requested_by is required';
  end if;

  if jsonb_typeof(p->'ids') = 'array' then
    select array_agg(x) into v_ids from jsonb_array_elements_text(p->'ids') x;
  end if;

  -- Lasts until this transaction ends, and only this function sets it.
  perform set_config('ascend.history_erasure', v_reason, true);

  -- report_access_log has no business_id; it belongs to a business through
  -- the share that was viewed.
  if v_table = 'report_access_log' then
    v_scope := 'share_id in (select id from public.report_share where business_id = $1)';
  -- A receipt line belongs to a business through its receipt (0125).
  elsif v_table = 'stock_receipt_line' then
    v_scope := 'receipt_id in (select id from public.stock_receipt where business_id = $1)';
  -- A count line belongs to a business through its count (0129).
  elsif v_table = 'stock_count_line' then
    v_scope := 'count_id in (select id from public.stock_count where business_id = $1)';
  -- A transfer line belongs to a business through its transfer (0131).
  elsif v_table = 'stock_transfer_line' then
    v_scope := 'transfer_id in (select id from public.stock_transfer where business_id = $1)';
  -- A batch movement belongs to a business through its batch (0137).
  elsif v_table = 'stock_batch_movement' then
    v_scope := 'batch_id in (select id from public.stock_batch where business_id = $1)';
  -- An order line belongs to a business through its order (0132).
  elsif v_table = 'stock_order_line' then
    v_scope := 'document_id in (select document_id from public.stock_order where business_id = $1)';
  else
    v_scope := 'business_id = $1';
  end if;

  if v_ids is null then
    execute format('delete from public.%I where %s', v_table, v_scope)
      using v_business;
  else
    execute format('delete from public.%I where %s and id::text = any($2)', v_table, v_scope)
      using v_business, v_ids;
  end if;
  get diagnostics v_count = row_count;

  perform set_config('ascend.history_erasure', '', true);

  insert into audit_log (business_id, action, entity_type, detail)
  values (
    null, 'history.erased', v_table,
    jsonb_build_object(
      'business_id', v_business,
      'table', v_table,
      'rows', v_count,
      'ids', coalesce(to_jsonb(v_ids), 'null'::jsonb),
      'reason', v_reason,
      'requested_by', v_by
    )
  );

  return jsonb_build_object('table', v_table, 'erased', v_count);
end;
$$;

revoke all on function erase_history(jsonb) from public, anon, authenticated;
grant execute on function erase_history(jsonb) to service_role;
