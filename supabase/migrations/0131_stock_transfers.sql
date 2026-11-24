-- ---------------------------------------------------------------------------
-- 0131  Advanced Inventory A1: moving stock between places
--
-- INVENTORY_CORE_PLAN.md, decisions 9 and 11 (approved 21 Nov 2026):
-- Advanced Inventory is a product set of its own, built after I1 to I5 and
-- starting with transfers, since a business on live now has two places.
--
-- Advanced Inventory
--   product_set advanced_inventory, granting inventory.transfers (class
--   advanced). Priced in the price book at GHS 120 for 30 days, the figure
--   in the v3 design. Like everything in the price book it is switched on
--   by Ascend for now ("Talk to us to switch one on" on the Billing page),
--   as a support grant, until paying in the app arrives with Paystack.
--
-- A transfer, in two steps
--   1. Sent. Someone who may manage stock (inventory.manage) sends goods
--      from one place to another. Each line leaves the first place at once
--      (transfer_out), at the item's average cost. The goods are on the way.
--   2. Received. Anyone on the team at the other place says how many of
--      each arrived, without being shown how many were sent (blind, like a
--      stock count), so the receiver counts what is in the box. Each line
--      arrives in full (transfer_in), and whatever did not arrive is written
--      off there in the same moment (damage_loss, "Lost on the way from
--      <place>"), so it shows in the write-off signal (0130) and nowhere
--      does stock quietly vanish.
--   A transfer that has not arrived can be called back by someone who may
--   manage stock: its goods return to the first place (transfer_in there).
--   Carrying it yourself: "arrived" on sending receives it in full at once.
--
-- Sending more than the record shows at the first place is allowed: the
-- goods are in someone's hands, and the record may be behind (decision 4,
-- the till keeps selling). The screen warns; the place goes below zero and
-- the Inventory page asks for a count there.
--
-- stock_transfer, stock_transfer_line   the transfer and its lines (only
--                                       the receiving or calling back is
--                                       written later)
-- send_stock_transfer(p)                send goods, optionally arrived
-- receive_stock_transfer(p)             say what arrived
-- cancel_stock_transfer(p)              call back goods still on the way
--
-- Tables and columns read: business_membership (id, business_id, status),
-- location (id, business_id, name, active), catalogue_item (id,
-- business_id, name, base_price, average_cost, track_stock), stock_movement
-- (0002), audit_log (0001), business_capabilities (0044), has_permission
-- (0074), require_permission (0081), product_set, capability,
-- product_set_capability (0005, 0044), price_book_entry (0065).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The product set
-- ---------------------------------------------------------------------------
insert into product_set (key, name, description) values
  ('advanced_inventory', 'Advanced Inventory', 'Move stock between your places, and more control over stock as it grows.')
on conflict (key) do update set name = excluded.name, description = excluded.description;

insert into capability (key, name, owning_domain, class, description) values
  ('inventory.transfers', 'Move stock between places', 'inventory', 'advanced', 'Send stock from one place and receive it at another')
on conflict (key) do update
  set name = excluded.name, owning_domain = excluded.owning_domain,
      class = excluded.class, description = excluded.description;

insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('advanced_inventory', 'inventory.transfers', false)
on conflict (product_set_key, capability_key) do update set embedded = excluded.embedded;

insert into price_book_entry (country_code, sku, name, kind, amount, currency_code, duration_days, capacity)
values ('GH', 'advanced_inventory_30d', 'Advanced Inventory, 30 days', 'duration_pass', 120, 'GHS', 30, null)
on conflict (country_code, sku) do update
  set name = excluded.name, amount = excluded.amount, kind = excluded.kind,
      duration_days = excluded.duration_days, capacity = excluded.capacity;

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
create table if not exists stock_transfer (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  client_ref text not null,
  from_location_id uuid not null references location(id),
  to_location_id uuid not null references location(id),
  status text not null check (status in ('sent', 'received', 'cancelled')),
  sent_by uuid not null references business_membership(id),
  received_by uuid references business_membership(id),
  cancelled_by uuid references business_membership(id),
  note text,
  receive_note text,
  lines int not null default 0,
  missing_lines int not null default 0,
  missing_value numeric(14,2) not null default 0,
  sent_at timestamptz not null default now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  check (from_location_id <> to_location_id)
);
create unique index if not exists stock_transfer_client_ref on stock_transfer (business_id, client_ref);
create index if not exists stock_transfer_business_at on stock_transfer (business_id, sent_at desc);
create index if not exists stock_transfer_on_the_way on stock_transfer (business_id, to_location_id) where status = 'sent';
alter table stock_transfer enable row level security;
revoke all on stock_transfer from anon, authenticated;

create table if not exists stock_transfer_line (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references stock_transfer(id),
  item_id uuid not null references catalogue_item(id),
  sent numeric(14,3) not null check (sent > 0),
  received numeric(14,3) check (received >= 0 and received <= sent),
  unit_cost numeric(14,4),
  out_movement_id uuid references stock_movement(id),
  in_movement_id uuid references stock_movement(id),
  loss_movement_id uuid references stock_movement(id),
  unique (transfer_id, item_id)
);
create index if not exists stock_transfer_line_transfer on stock_transfer_line (transfer_id);
alter table stock_transfer_line enable row level security;
revoke all on stock_transfer_line from anon, authenticated;

-- What was sent is never edited. Only receiving or calling back is written
-- later, by the functions below, which set ascend.transfer_step for it.
create or replace function stock_transfer_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('ascend.history_erasure', true), '') = '' then
      raise exception 'stock transfers are history: they cannot be deleted';
    end if;
    return old;
  end if;
  if coalesce(current_setting('ascend.transfer_step', true), '') = '' then
    raise exception 'stock transfers are history: only receiving or calling back can be recorded';
  end if;
  return new;
end
$fn$;

drop trigger if exists stock_transfer_guard on stock_transfer;
create trigger stock_transfer_guard before update or delete on stock_transfer
  for each row execute function stock_transfer_guard();
drop trigger if exists stock_transfer_line_guard on stock_transfer_line;
create trigger stock_transfer_line_guard before update or delete on stock_transfer_line
  for each row execute function stock_transfer_guard();

-- ---------------------------------------------------------------------------
-- Receiving (internal): what arrived, once.
-- p_received maps item_id to the quantity that arrived; null means in full.
-- ---------------------------------------------------------------------------
create or replace function post_stock_transfer_arrival(p_transfer uuid, p_by uuid, p_received jsonb, p_note text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_t stock_transfer%rowtype;
  v_from text;
  v_line record;
  v_got numeric(14,3);
  v_in uuid;
  v_loss uuid;
  v_missing int := 0;
  v_value numeric(14,2) := 0;
begin
  select * into v_t from stock_transfer where id = p_transfer for update;
  select name into v_from from location where id = v_t.from_location_id;
  perform set_config('ascend.transfer_step', 'receive', true);

  for v_line in
    select l.id, l.item_id, l.sent, l.unit_cost, ci.base_price
      from stock_transfer_line l join catalogue_item ci on ci.id = l.item_id
     where l.transfer_id = p_transfer
  loop
    if p_received is null then
      v_got := v_line.sent;
    else
      v_got := (p_received->>(v_line.item_id::text))::numeric;
      if v_got is null then raise exception 'received_required'; end if;
      if v_got < 0 then raise exception 'received_required'; end if;
      if v_got > v_line.sent then raise exception 'received_more_than_sent'; end if;
    end if;

    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_t.business_id, v_t.to_location_id, v_line.item_id, 'transfer_in', v_line.sent, v_line.unit_cost,
            'Moved from ' || v_from, 'stock_transfer', p_transfer, p_by, now())
    returning id into v_in;

    v_loss := null;
    if v_got < v_line.sent then
      insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                  source_entity_type, source_entity_id, actor_membership_id, occurred_at)
      values (v_t.business_id, v_t.to_location_id, v_line.item_id, 'damage_loss', v_got - v_line.sent, v_line.unit_cost,
              'Lost on the way from ' || v_from || coalesce(': ' || p_note, ''),
              'stock_transfer', p_transfer, p_by, now())
      returning id into v_loss;
      v_missing := v_missing + 1;
      v_value := v_value + round((v_line.sent - v_got) * coalesce(v_line.unit_cost, v_line.base_price, 0), 2);
    end if;

    update stock_transfer_line set received = v_got, in_movement_id = v_in, loss_movement_id = v_loss where id = v_line.id;
  end loop;

  update stock_transfer
     set status = 'received', received_by = p_by, received_at = now(), receive_note = p_note,
         missing_lines = v_missing, missing_value = v_value
   where id = p_transfer;
  perform set_config('ascend.transfer_step', '', true);

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_t.business_id, p_by, 'inventory.transfer.received', 'stock_transfer', p_transfer,
          jsonb_build_object('lines', v_t.lines, 'missing_lines', v_missing, 'missing_value', v_value,
            'sent_by', v_t.sent_by, 'note', p_note));

  return jsonb_build_object('transfer_id', p_transfer, 'status', 'received',
    'missing_lines', v_missing, 'missing_value', v_value);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------
create or replace function send_stock_transfer(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_from uuid := (p->>'from_location_id')::uuid;
  v_to uuid := (p->>'to_location_id')::uuid;
  v_by uuid := nullif(p->>'sent_by', '')::uuid;
  v_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_arrived boolean := coalesce((p->>'arrived')::boolean, false);
  v_existing stock_transfer%rowtype;
  v_transfer uuid;
  v_to_name text;
  v_line jsonb;
  v_item catalogue_item%rowtype;
  v_qty numeric(14,3);
  v_out uuid;
  v_lines int := 0;
  v_arrival jsonb;
begin
  if v_ref is null then raise exception 'client_ref_required'; end if;
  select * into v_existing from stock_transfer where business_id = v_business and client_ref = v_ref;
  if found then
    return jsonb_build_object('transfer_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  perform require_permission(v_by, v_business, array['inventory.manage']);
  perform 1 from business_capabilities(v_business) where capability_key = 'inventory.transfers';
  if not found then raise exception 'not_entitled'; end if;

  if v_from is null or v_to is null then raise exception 'location_not_found'; end if;
  if v_from = v_to then raise exception 'same_place'; end if;
  perform 1 from location where id = v_from and business_id = v_business;
  if not found then raise exception 'location_not_found'; end if;
  select name into v_to_name from location where id = v_to and business_id = v_business and active;
  if not found then raise exception 'location_not_found'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  if jsonb_array_length(p->'lines') > 500 then raise exception 'too_many_lines'; end if;

  insert into stock_transfer (business_id, client_ref, from_location_id, to_location_id, status, sent_by, note)
  values (v_business, v_ref, v_from, v_to, 'sent', v_by, v_note)
  returning id into v_transfer;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid for update;
    if not found or v_item.business_id <> v_business then raise exception 'item_not_found'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_required'; end if;
    perform 1 from stock_transfer_line where transfer_id = v_transfer and item_id = v_item.id;
    if found then raise exception 'item_sent_twice'; end if;

    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_business, v_from, v_item.id, 'transfer_out', -v_qty, v_item.average_cost,
            'Moved to ' || v_to_name || coalesce(': ' || v_note, ''),
            'stock_transfer', v_transfer, v_by, now())
    returning id into v_out;

    insert into stock_transfer_line (transfer_id, item_id, sent, unit_cost, out_movement_id)
    values (v_transfer, v_item.id, v_qty, v_item.average_cost, v_out);

    -- Moving an item is the moment it becomes worth tracking.
    if not v_item.track_stock then
      update catalogue_item set track_stock = true, updated_at = now() where id = v_item.id;
    end if;
    v_lines := v_lines + 1;
  end loop;

  perform set_config('ascend.transfer_step', 'totals', true);
  update stock_transfer set lines = v_lines where id = v_transfer;
  perform set_config('ascend.transfer_step', '', true);

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_by, 'inventory.transfer.sent', 'stock_transfer', v_transfer,
          jsonb_build_object('from', v_from, 'to', v_to, 'lines', v_lines, 'arrived', v_arrived));

  if v_arrived then
    v_arrival := post_stock_transfer_arrival(v_transfer, v_by, null, null);
    return jsonb_build_object('transfer_id', v_transfer, 'status', 'received', 'lines', v_lines, 'duplicate', false);
  end if;
  return jsonb_build_object('transfer_id', v_transfer, 'status', 'sent', 'lines', v_lines, 'duplicate', false);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Receiving: anyone on the team says what arrived
-- ---------------------------------------------------------------------------
create or replace function receive_stock_transfer(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_by uuid := nullif(p->>'received_by', '')::uuid;
  v_t stock_transfer%rowtype;
  v_map jsonb := '{}'::jsonb;
  v_line jsonb;
begin
  select * into v_t from stock_transfer
   where id = (p->>'transfer_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'transfer_not_found'; end if;
  if v_t.status <> 'sent' then
    return jsonb_build_object('transfer_id', v_t.id, 'status', v_t.status, 'unchanged', true);
  end if;
  perform 1 from business_membership where id = v_by and business_id = v_t.business_id and status = 'active';
  if not found then raise exception 'receiver_not_member'; end if;

  if jsonb_typeof(p->'lines') <> 'array' then raise exception 'received_required'; end if;
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    if nullif(v_line->>'received', '') is null then raise exception 'received_required'; end if;
    v_map := v_map || jsonb_build_object(v_line->>'item_id', (v_line->>'received')::numeric);
  end loop;

  return post_stock_transfer_arrival(v_t.id, v_by, v_map, nullif(btrim(coalesce(p->>'note', '')), ''))
         || jsonb_build_object('unchanged', false);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Calling back goods still on the way
-- ---------------------------------------------------------------------------
create or replace function cancel_stock_transfer(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_by uuid := nullif(p->>'cancelled_by', '')::uuid;
  v_t stock_transfer%rowtype;
  v_to text;
  v_line record;
begin
  select * into v_t from stock_transfer
   where id = (p->>'transfer_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'transfer_not_found'; end if;
  if v_t.status <> 'sent' then
    return jsonb_build_object('transfer_id', v_t.id, 'status', v_t.status, 'unchanged', true);
  end if;
  perform require_permission(v_by, v_t.business_id, array['inventory.manage']);
  select name into v_to from location where id = v_t.to_location_id;

  for v_line in select l.item_id, l.sent, l.unit_cost from stock_transfer_line l where l.transfer_id = v_t.id loop
    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_t.business_id, v_t.from_location_id, v_line.item_id, 'transfer_in', v_line.sent, v_line.unit_cost,
            'Called back, never reached ' || v_to, 'stock_transfer', v_t.id, v_by, now());
  end loop;

  perform set_config('ascend.transfer_step', 'cancel', true);
  update stock_transfer set status = 'cancelled', cancelled_by = v_by, cancelled_at = now(),
         receive_note = nullif(btrim(coalesce(p->>'note', '')), '')
   where id = v_t.id;
  perform set_config('ascend.transfer_step', '', true);

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_t.business_id, v_by, 'inventory.transfer.cancelled', 'stock_transfer', v_t.id,
          jsonb_build_object('lines', v_t.lines, 'sent_by', v_t.sent_by, 'note', nullif(btrim(coalesce(p->>'note', '')), '')));

  return jsonb_build_object('transfer_id', v_t.id, 'status', 'cancelled', 'unchanged', false);
end
$fn$;

revoke all on function post_stock_transfer_arrival(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function send_stock_transfer(jsonb) from public, anon, authenticated;
revoke all on function receive_stock_transfer(jsonb) from public, anon, authenticated;
revoke all on function cancel_stock_transfer(jsonb) from public, anon, authenticated;
revoke all on function stock_transfer_guard() from public, anon, authenticated;
grant execute on function send_stock_transfer(jsonb) to service_role;
grant execute on function receive_stock_transfer(jsonb) to service_role;
grant execute on function cancel_stock_transfer(jsonb) to service_role;

-- erase_history (0129) learns the two transfer tables, for data protection
-- and test data. Lines before transfers, both before stock movements.
-- erase_history as in 0129, with two more tables.
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
    'stock_transfer', 'stock_transfer_line'
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
