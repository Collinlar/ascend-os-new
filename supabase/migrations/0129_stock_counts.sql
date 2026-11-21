-- ---------------------------------------------------------------------------
-- 0129  Inventory Core I4: stock counts
--
-- INVENTORY_CORE_PLAN.md, step I4 and decision 6 (approved 21 Nov 2026). A
-- count used to be one product at a time and kept only the difference. Now
-- a count covers many products in one sitting and keeps, for each, what the
-- record expected, what was counted, the variance and its value.
--
-- Who posts it:
--   * someone who may manage stock (inventory.manage: owners, managers)
--     posts their own count at once, unless it writes down more than
--     GHS 500;
--   * a count by anyone else (a cashier), and any count writing down more
--     than GHS 500, waits. Above GHS 500 the approver must be someone other
--     than the counter, even when the counter is a manager: that is where
--     stock theft hides.
--
-- The count is blind: the person counting is not shown what the record
-- expects, so a count says what is on the shelf, not what was hoped for. A
-- note is welcome and never required, since the counter cannot know there
-- is a difference to explain.
--
-- Value of a write-down: the shortfall at the item's average cost (0125),
-- or at its selling price when it has no cost yet.
--
-- Posting writes one count_correction per product that differs, of the
-- variance (counted less expected at the moment of counting), not "set it
-- to what was counted". Sales made between counting and approving stay
-- counted. Expected is worked out here when the count arrives, never sent by
-- the person counting.
--
-- stock_count, stock_count_line   the count and its lines (append-only once
--                                 decided; only the decision may change it)
-- submit_stock_count(p)           send a count; posts it or leaves it waiting
-- decide_stock_count(p)           approve or reject a waiting count
--
-- Tables and columns read: business_membership (id, business_id, status),
-- location (id, business_id), catalogue_item (id, business_id, name,
-- base_price, average_cost, track_stock), stock_movement (0002), audit_log
-- (0001), event_outbox (as in 0125), has_permission (0074).
-- ---------------------------------------------------------------------------

create table if not exists stock_count (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  client_ref text not null,
  status text not null check (status in ('waiting', 'posted', 'rejected')),
  counted_by uuid not null references business_membership(id),
  decided_by uuid references business_membership(id),
  note text,
  lines int not null default 0,
  differing int not null default 0,
  write_down_value numeric(14,2) not null default 0,
  write_up_value numeric(14,2) not null default 0,
  needs_second_person boolean not null default false,
  counted_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text,
  check (not needs_second_person or decided_by is null or decided_by <> counted_by)
);
create unique index if not exists stock_count_client_ref on stock_count (business_id, client_ref);
create index if not exists stock_count_business_at on stock_count (business_id, counted_at desc);
alter table stock_count enable row level security;
revoke all on stock_count from anon, authenticated;

create table if not exists stock_count_line (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_count(id),
  item_id uuid not null references catalogue_item(id),
  expected numeric(14,3) not null,
  counted numeric(14,3) not null check (counted >= 0),
  variance numeric(14,3) not null,
  unit_value numeric(14,4),
  reason text,
  movement_id uuid references stock_movement(id),
  unique (count_id, item_id)
);
create index if not exists stock_count_line_count on stock_count_line (count_id);
alter table stock_count_line enable row level security;
revoke all on stock_count_line from anon, authenticated;

-- What was counted is never edited. Only the decision is written later, by
-- the functions below, which set ascend.count_decision for that moment.
create or replace function stock_count_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('ascend.history_erasure', true), '') = '' then
      raise exception 'stock counts are history: they cannot be deleted';
    end if;
    return old;
  end if;
  if coalesce(current_setting('ascend.count_decision', true), '') = '' then
    raise exception 'stock counts are history: only the decision can be recorded';
  end if;
  return new;
end
$fn$;

drop trigger if exists stock_count_guard on stock_count;
create trigger stock_count_guard before update or delete on stock_count
  for each row execute function stock_count_guard();
drop trigger if exists stock_count_line_guard on stock_count_line;
create trigger stock_count_line_guard before update or delete on stock_count_line
  for each row execute function stock_count_guard();

-- ---------------------------------------------------------------------------
-- Posting (internal): the corrections for a count, once.
-- ---------------------------------------------------------------------------
create or replace function post_stock_count(p_count uuid, p_by uuid)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count stock_count%rowtype;
  v_line record;
  v_movement uuid;
  v_posted int := 0;
begin
  select * into v_count from stock_count where id = p_count for update;
  perform set_config('ascend.count_decision', 'post', true);
  for v_line in
    select l.id, l.item_id, l.variance, l.reason, ci.average_cost
      from stock_count_line l join catalogue_item ci on ci.id = l.item_id
     where l.count_id = p_count and l.variance <> 0 and l.movement_id is null
  loop
    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_count.business_id, v_count.location_id, v_line.item_id, 'count_correction', v_line.variance,
            v_line.average_cost,
            'Stock count' || coalesce(': ' || coalesce(v_line.reason, v_count.note), ''),
            'stock_count', p_count, p_by, now())
    returning id into v_movement;
    update stock_count_line set movement_id = v_movement where id = v_line.id;
    v_posted := v_posted + 1;
  end loop;
  update stock_count set status = 'posted', decided_by = p_by, decided_at = now() where id = p_count;
  perform set_config('ascend.count_decision', '', true);

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    verification, payload, business_date
  ) values (
    'inventory.count.posted', v_count.business_id, v_count.location_id, p_by,
    'business_mobile', 'pos', 'stock_count', p_count,
    'merchant_declared',
    jsonb_build_object('lines', v_count.lines, 'differing', v_count.differing,
      'write_down_value', v_count.write_down_value, 'write_up_value', v_count.write_up_value,
      'counted_by', v_count.counted_by, 'approved_by', p_by),
    current_date
  );
  return v_posted;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Sending a count
-- ---------------------------------------------------------------------------
create or replace function submit_stock_count(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_location uuid := (p->>'location_id')::uuid;
  v_counter uuid := nullif(p->>'counted_by', '')::uuid;
  v_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_existing stock_count%rowtype;
  v_count uuid;
  v_line jsonb;
  v_item catalogue_item%rowtype;
  v_counted numeric(14,3);
  v_expected numeric(14,3);
  v_variance numeric(14,3);
  v_value numeric(14,4);
  v_down numeric(14,2) := 0;
  v_up numeric(14,2) := 0;
  v_lines int := 0;
  v_diff int := 0;
  v_can_post boolean;
  v_second boolean;
  v_posted int := 0;
begin
  if v_ref is null then raise exception 'client_ref_required'; end if;
  select * into v_existing from stock_count where business_id = v_business and client_ref = v_ref;
  if found then
    return jsonb_build_object('count_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  perform 1 from business_membership where id = v_counter and business_id = v_business and status = 'active';
  if not found then raise exception 'counter_not_member'; end if;
  perform 1 from location where id = v_location and business_id = v_business;
  if not found then raise exception 'location_not_found'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  if jsonb_array_length(p->'lines') > 500 then raise exception 'too_many_lines'; end if;

  insert into stock_count (business_id, location_id, client_ref, status, counted_by, note)
  values (v_business, v_location, v_ref, 'waiting', v_counter, v_note)
  returning id into v_count;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid;
    if not found or v_item.business_id <> v_business then raise exception 'item_not_found'; end if;
    v_counted := (v_line->>'counted')::numeric;
    if v_counted is null or v_counted < 0 then raise exception 'counted_required'; end if;
    perform 1 from stock_count_line where count_id = v_count and item_id = v_item.id;
    if found then raise exception 'item_counted_twice'; end if;

    select coalesce(sum(quantity), 0) into v_expected from stock_movement
     where business_id = v_business and location_id = v_location and item_id = v_item.id
       and kind not in ('reservation', 'reservation_release');
    v_variance := v_counted - v_expected;
    v_value := coalesce(v_item.average_cost, v_item.base_price);
    if v_variance < 0 then v_down := v_down + round(-v_variance * coalesce(v_value, 0), 2); end if;
    if v_variance > 0 then v_up := v_up + round(v_variance * coalesce(v_value, 0), 2); end if;
    if v_variance <> 0 then v_diff := v_diff + 1; end if;

    insert into stock_count_line (count_id, item_id, expected, counted, variance, unit_value, reason)
    values (v_count, v_item.id, v_expected, v_counted, v_variance, v_value,
            nullif(btrim(coalesce(v_line->>'reason', '')), ''));

    -- Counting an item is the moment it becomes worth tracking.
    if not v_item.track_stock then
      update catalogue_item set track_stock = true, updated_at = now() where id = v_item.id;
    end if;
    v_lines := v_lines + 1;
  end loop;

  v_can_post := has_permission(v_counter, 'inventory.manage');
  v_second := v_down > 500;

  perform set_config('ascend.count_decision', 'totals', true);
  update stock_count
     set lines = v_lines, differing = v_diff, write_down_value = v_down, write_up_value = v_up,
         needs_second_person = v_second
   where id = v_count;
  perform set_config('ascend.count_decision', '', true);

  if v_can_post and not v_second then
    v_posted := post_stock_count(v_count, v_counter);
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_counter, 'inventory.count.submitted', 'stock_count', v_count,
          jsonb_build_object('lines', v_lines, 'differing', v_diff, 'write_down_value', v_down,
            'posted', v_can_post and not v_second, 'needs_second_person', v_second));

  return jsonb_build_object('count_id', v_count, 'duplicate', false,
    'status', case when v_can_post and not v_second then 'posted' else 'waiting' end,
    'lines', v_lines, 'differing', v_diff, 'write_down_value', v_down, 'write_up_value', v_up,
    'needs_second_person', v_second, 'corrections', v_posted);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Deciding a waiting count
-- ---------------------------------------------------------------------------
create or replace function decide_stock_count(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_decider uuid := nullif(p->>'decided_by', '')::uuid;
  v_approve boolean := coalesce((p->>'approve')::boolean, false);
  v_count stock_count%rowtype;
  v_posted int := 0;
begin
  select * into v_count from stock_count where id = (p->>'count_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'count_not_found'; end if;
  if v_count.status <> 'waiting' then
    return jsonb_build_object('count_id', v_count.id, 'status', v_count.status, 'unchanged', true);
  end if;
  perform require_permission(v_decider, v_count.business_id, array['inventory.manage']);
  if v_count.needs_second_person and v_decider = v_count.counted_by then
    raise exception 'second_person_required';
  end if;

  if v_approve then
    v_posted := post_stock_count(v_count.id, v_decider);
    perform set_config('ascend.count_decision', 'note', true);
    update stock_count set decision_note = nullif(btrim(coalesce(p->>'note', '')), '') where id = v_count.id;
    perform set_config('ascend.count_decision', '', true);
  else
    perform set_config('ascend.count_decision', 'reject', true);
    update stock_count set status = 'rejected', decided_by = v_decider, decided_at = now(),
           decision_note = nullif(btrim(coalesce(p->>'note', '')), '')
     where id = v_count.id;
    perform set_config('ascend.count_decision', '', true);
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_count.business_id, v_decider,
          case when v_approve then 'inventory.count.approved' else 'inventory.count.rejected' end,
          'stock_count', v_count.id,
          jsonb_build_object('counted_by', v_count.counted_by, 'write_down_value', v_count.write_down_value,
            'corrections', v_posted, 'note', nullif(btrim(coalesce(p->>'note', '')), '')));

  return jsonb_build_object('count_id', v_count.id, 'status', case when v_approve then 'posted' else 'rejected' end,
    'corrections', v_posted, 'unchanged', false);
end
$fn$;

revoke all on function post_stock_count(uuid, uuid) from public, anon, authenticated;
revoke all on function submit_stock_count(jsonb) from public, anon, authenticated;
revoke all on function decide_stock_count(jsonb) from public, anon, authenticated;
revoke all on function stock_count_guard() from public, anon, authenticated;
grant execute on function submit_stock_count(jsonb) to service_role;
grant execute on function decide_stock_count(jsonb) to service_role;

-- erase_history (0126) learns the two count tables, for data protection and
-- test data. Lines before counts, both before stock movements.
-- erase_history as in 0126, with two more tables.
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
    'stock_count', 'stock_count_line'
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
