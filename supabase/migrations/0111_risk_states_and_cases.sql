-- ---------------------------------------------------------------------------
-- 0111  Risk and Trust, step R1: risk states and risk cases
--
-- RISK_AND_TRUST_PLAN.md, approved by Collins on 18 Nov 2026 with every
-- recommendation. Spec 09 sections 2, 5, 6 and 11.
--
-- Risk is an operational control, never a public score (spec section 2).
-- Nothing here is read by the Sustainability Score, trust level, shared
-- reports or Discover.
--
-- business_risk     one row per business with a risk state other than the
--                   default: normal, monitor, review, restricted, suspended
--                   or terminated, and the case that set it. No row means
--                   normal.
-- risk_case         every material intervention (spec 6): the business, the
--                   domain, what triggered it, an evidence snapshot taken
--                   when it opened, its owner, the state it asks for, and its
--                   resolution.
-- risk_case_event   what happened on each case, append-only: opened, notes,
--                   state requested, confirmed, declined, changed, resolved.
--                   Who and when, always. erase_history covers it, for test
--                   data only.
--
-- Decision 1: risk state stands apart from business.status. Suspended and
-- terminated also switch the business off through set_business_status
-- (0081), the one switch the app already honours; terminated is suspended
-- with the reason saying so, because "closed" is the owner's own choice.
-- Moving a business back below suspended switches it on again, but only if
-- risk was what switched it off.
--
-- Decision 2: platform admins only, always through a case. Monitor, review
-- and restricted take effect when one admin sets them. Suspended and
-- terminated wait for a second admin to confirm; the admin who asked can
-- never confirm their own request.
--
-- Functions (each checks for a current, unrevoked admin):
--   open_risk_case({business_id, domain, trigger, evidence, admin_person_id})
--   add_risk_case_note({case_id, note, admin_person_id})
--   set_risk_state({case_id, state, reason, admin_person_id})
--   confirm_risk_state({case_id, admin_person_id})
--   decline_risk_state({case_id, reason, admin_person_id})
--   resolve_risk_case({case_id, resolution, admin_person_id})
--   risk_state(business)   the state, normal when there is no row
--
-- Tables and columns read: platform_admin (person_id, role, revoked_at),
-- business (status, status_reason).
-- ---------------------------------------------------------------------------

create table if not exists risk_case (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  domain text not null check (domain in (
    'identity_fraud', 'account_takeover', 'payment_fraud', 'refund_abuse', 'fake_merchant',
    'prohibited_goods', 'counterfeit_goods', 'field_agent_misconduct', 'commission_fraud',
    'messaging_abuse', 'device_compromise', 'insider_risk', 'api_abuse', 'ai_action_abuse',
    'settlement_manipulation', 'cash_discipline', 'customer_complaint', 'other')),
  trigger text not null,
  evidence jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'awaiting_confirmation', 'resolved')),
  owner_person_id uuid references person(id),
  opened_by uuid not null references person(id),
  opened_at timestamptz not null default now(),
  requested_state text check (requested_state in ('suspended', 'terminated')),
  requested_by uuid references person(id),
  requested_reason text,
  resolution text,
  resolved_by uuid references person(id),
  resolved_at timestamptz
);
create index if not exists risk_case_business on risk_case (business_id, opened_at);
create index if not exists risk_case_open on risk_case (status) where status <> 'resolved';
alter table risk_case enable row level security;
revoke all on risk_case from anon, authenticated;

create table if not exists business_risk (
  business_id uuid primary key references business(id),
  state text not null check (state in ('normal', 'monitor', 'review', 'restricted', 'suspended', 'terminated')),
  case_id uuid references risk_case(id),
  changed_by uuid references person(id),
  changed_at timestamptz not null default now(),
  switched_off_business boolean not null default false
);
alter table business_risk enable row level security;
revoke all on business_risk from anon, authenticated;

create table if not exists risk_case_event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references risk_case(id),
  business_id uuid not null references business(id),
  action text not null check (action in ('opened', 'note', 'state_changed', 'state_requested',
                                         'state_confirmed', 'state_declined', 'resolved')),
  from_state text,
  to_state text,
  detail text,
  by_person_id uuid not null references person(id),
  at timestamptz not null default now()
);
create index if not exists risk_case_event_case on risk_case_event (case_id, at);
alter table risk_case_event enable row level security;
revoke all on risk_case_event from anon, authenticated;
drop trigger if exists risk_case_event_append_only on risk_case_event;
create trigger risk_case_event_append_only before update or delete on risk_case_event
  for each row execute function refuse_history_change();
drop trigger if exists risk_case_event_no_truncate on risk_case_event;
create trigger risk_case_event_no_truncate before truncate on risk_case_event
  for each statement execute function refuse_history_change();

-- erase_history (0103), unchanged except that risk_case_event joins the
-- protected history tables it can erase from (test data only).
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
    'financial_period_change', 'risk_case_event'
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

create or replace function risk_admin_check(p_person uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_person is null or not exists (select 1 from platform_admin
                                      where person_id = p_person and role = 'admin' and revoked_at is null) then
    raise exception 'admin_only: only a BVM platform admin can act on risk';
  end if;
end
$fn$;

create or replace function risk_state(p_business uuid)
returns text language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((select state from business_risk where business_id = p_business), 'normal')
$fn$;

create or replace function open_risk_case(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_trigger text := nullif(btrim(coalesce(p->>'trigger', '')), '');
  v_case uuid;
begin
  perform risk_admin_check(v_admin);
  if not exists (select 1 from business where id = v_business) then raise exception 'business_not_found'; end if;
  if v_trigger is null or length(v_trigger) < 10 then
    raise exception 'trigger_needed: say what started this case, in at least 10 characters';
  end if;
  insert into risk_case (business_id, domain, trigger, evidence, owner_person_id, opened_by)
  values (v_business, coalesce(nullif(p->>'domain', ''), 'other'), v_trigger, coalesce(p->'evidence', '{}'),
          coalesce(nullif(p->>'owner_person_id', '')::uuid, v_admin), v_admin)
  returning id into v_case;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (v_case, v_business, 'opened', risk_state(v_business), v_trigger, v_admin);
  return jsonb_build_object('case_id', v_case, 'state', risk_state(v_business));
end
$fn$;

create or replace function add_risk_case_note(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  c risk_case%rowtype;
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid;
  if not found then raise exception 'case_not_found'; end if;
  if v_note is null then raise exception 'note_needed'; end if;
  insert into risk_case_event (case_id, business_id, action, detail, by_person_id)
  values (c.id, c.business_id, 'note', v_note, v_admin);
  return jsonb_build_object('case_id', c.id, 'noted', true);
end
$fn$;

-- Applies a state. Internal: callers have checked the admin and the case.
create or replace function risk_apply_state(p_case risk_case, p_state text, p_admin uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from text := risk_state(p_case.business_id);
  v_switched boolean := coalesce((select switched_off_business from business_risk where business_id = p_case.business_id), false);
  v_status text;
begin
  select status into v_status from business where id = p_case.business_id;
  if p_state in ('suspended', 'terminated') then
    if v_status = 'active' then
      perform set_business_status(jsonb_build_object(
        'business_id', p_case.business_id, 'status', 'suspended', 'actor_person_id', p_admin,
        'reason', case p_state when 'terminated' then 'Terminated by Ascend: ' else 'Suspended by Ascend: ' end || p_reason));
      v_switched := true;
    end if;
  elsif v_from in ('suspended', 'terminated') and v_switched and v_status = 'suspended' then
    -- Risk switched it off, so risk switches it back on.
    perform set_business_status(jsonb_build_object(
      'business_id', p_case.business_id, 'status', 'active', 'actor_person_id', p_admin,
      'reason', 'Risk case moved to ' || p_state || ': ' || p_reason));
    v_switched := false;
  end if;
  insert into business_risk (business_id, state, case_id, changed_by, changed_at, switched_off_business)
  values (p_case.business_id, p_state, p_case.id, p_admin, now(), v_switched)
  on conflict (business_id) do update
     set state = excluded.state, case_id = excluded.case_id, changed_by = excluded.changed_by,
         changed_at = now(), switched_off_business = excluded.switched_off_business;
  insert into risk_case_event (case_id, business_id, action, from_state, to_state, detail, by_person_id)
  values (p_case.id, p_case.business_id,
          case when p_state in ('suspended', 'terminated') then 'state_confirmed' else 'state_changed' end,
          v_from, p_state, p_reason, p_admin);
end
$fn$;

create or replace function set_risk_state(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_state text := p->>'state';
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status = 'resolved' then raise exception 'case_resolved: open a new case to change the state again'; end if;
  if v_state not in ('normal', 'monitor', 'review', 'restricted', 'suspended', 'terminated') then
    raise exception 'state_unknown: %', coalesce(v_state, '(none)');
  end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  if c.status = 'awaiting_confirmation' then
    raise exception 'awaiting_confirmation: a % request is waiting for a second admin', c.requested_state;
  end if;

  if v_state in ('suspended', 'terminated') then
    -- Maker-checker: a second admin must confirm.
    update risk_case set status = 'awaiting_confirmation', requested_state = v_state,
                         requested_by = v_admin, requested_reason = v_reason
     where id = c.id;
    insert into risk_case_event (case_id, business_id, action, from_state, to_state, detail, by_person_id)
    values (c.id, c.business_id, 'state_requested', risk_state(c.business_id), v_state, v_reason, v_admin);
    return jsonb_build_object('case_id', c.id, 'requested', v_state, 'awaiting_confirmation', true);
  end if;

  perform risk_apply_state(c, v_state, v_admin, v_reason);
  return jsonb_build_object('case_id', c.id, 'state', v_state);
end
$fn$;

create or replace function confirm_risk_state(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status <> 'awaiting_confirmation' then raise exception 'nothing_to_confirm'; end if;
  if c.requested_by = v_admin then
    raise exception 'second_admin_needed: the admin who asked cannot confirm their own request';
  end if;
  perform risk_apply_state(c, c.requested_state, v_admin,
                           c.requested_reason || ' (asked by one admin, confirmed by another)');
  update risk_case set status = 'open', requested_state = null, requested_by = null, requested_reason = null
   where id = c.id;
  return jsonb_build_object('case_id', c.id, 'state', risk_state(c.business_id));
end
$fn$;

create or replace function decline_risk_state(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status <> 'awaiting_confirmation' then raise exception 'nothing_to_decline'; end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  insert into risk_case_event (case_id, business_id, action, from_state, to_state, detail, by_person_id)
  values (c.id, c.business_id, 'state_declined', risk_state(c.business_id), c.requested_state, v_reason, v_admin);
  update risk_case set status = 'open', requested_state = null, requested_by = null, requested_reason = null
   where id = c.id;
  return jsonb_build_object('case_id', c.id, 'declined', true, 'state', risk_state(c.business_id));
end
$fn$;

create or replace function resolve_risk_case(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_resolution text := nullif(btrim(coalesce(p->>'resolution', '')), '');
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status = 'resolved' then return jsonb_build_object('case_id', c.id, 'already', 'resolved'); end if;
  if c.status = 'awaiting_confirmation' then
    raise exception 'awaiting_confirmation: confirm or decline the % request first', c.requested_state;
  end if;
  if v_resolution is null or length(v_resolution) < 10 then
    raise exception 'resolution_needed: say how it ended, in at least 10 characters';
  end if;
  update risk_case set status = 'resolved', resolution = v_resolution, resolved_by = v_admin, resolved_at = now()
   where id = c.id;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (c.id, c.business_id, 'resolved', risk_state(c.business_id), v_resolution, v_admin);
  return jsonb_build_object('case_id', c.id, 'resolved', true, 'state', risk_state(c.business_id));
end
$fn$;

revoke all on function risk_admin_check(uuid) from public, anon, authenticated;
revoke all on function risk_state(uuid) from public, anon, authenticated;
revoke all on function open_risk_case(jsonb) from public, anon, authenticated;
revoke all on function add_risk_case_note(jsonb) from public, anon, authenticated;
revoke all on function risk_apply_state(risk_case, text, uuid, text) from public, anon, authenticated;
revoke all on function set_risk_state(jsonb) from public, anon, authenticated;
revoke all on function confirm_risk_state(jsonb) from public, anon, authenticated;
revoke all on function decline_risk_state(jsonb) from public, anon, authenticated;
revoke all on function resolve_risk_case(jsonb) from public, anon, authenticated;
grant execute on function risk_state(uuid) to service_role;
grant execute on function open_risk_case(jsonb) to service_role;
grant execute on function add_risk_case_note(jsonb) to service_role;
grant execute on function set_risk_state(jsonb) to service_role;
grant execute on function confirm_risk_state(jsonb) to service_role;
grant execute on function decline_risk_state(jsonb) to service_role;
grant execute on function resolve_risk_case(jsonb) to service_role;
