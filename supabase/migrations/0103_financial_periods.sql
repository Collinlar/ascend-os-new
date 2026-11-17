-- ---------------------------------------------------------------------------
-- 0103  Financial Foundation, step F4: periods and change control
--
-- FINANCIAL_FOUNDATION_PLAN.md 2.6, approved 17 Nov 2026 (decision 3: late
-- activity keeps its real date and is reported in the first open period,
-- marked as belonging to the earlier one). Spec 07 section 12.
--
-- financial_period          one row per business per month that has been
--                           closed at least once: status open or closed. A
--                           month with no row is open.
-- financial_period_change   every close and reopen, append-only: who, when,
--                           why, and at a close, the month's totals as they
--                           stood, so a closed month's figures can always be
--                           reproduced.
--
-- financial_event.reported_period   the month a fact is reported in, set
--   when it is recorded: its own month, or, when that month is closed, the
--   first open month after it, with detail.belongs_to_period saying where it
--   really belongs. Facts recorded before 0103 have none; no month was
--   closed then, so their own month stands (financial_event_period()).
--   Nothing already recorded is edited.
--
-- close_financial_period({business_id, period, actor_membership_id, note})
--   Owner only (business.settings). Only a month that has ended. Returns
--   warnings, never refuses for them: till shifts still open from that
--   month (their cash arrives later and is reported in the next open month,
--   like any late sale) and shifts that did not count out.
-- reopen_financial_period({business_id, period, actor_membership_id, reason})
--   Owner only, with a reason of at least 10 characters. Facts recorded
--   while it was closed stay where they were reported; the change log says
--   so.
-- financial_period_totals(business, period)   the month's facts by kind,
--   as reported (what a close records).
-- financial_periods(business)   every month with activity or a row, its
--   status and when it was last closed.
--
-- Tables and columns read: financial_event, pos_shift (business_id,
-- opened_at, closed_at, cash_difference), business.
-- ---------------------------------------------------------------------------

create table if not exists financial_period (
  business_id uuid not null references business(id),
  period date not null check (period = date_trunc('month', period)::date),
  status text not null check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references business_membership(id),
  updated_at timestamptz not null default now(),
  primary key (business_id, period)
);
alter table financial_period enable row level security;
revoke all on financial_period from anon, authenticated;

create table if not exists financial_period_change (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  period date not null,
  action text not null check (action in ('closed', 'reopened')),
  actor_membership_id uuid references business_membership(id),
  note text,
  totals jsonb,
  warnings jsonb not null default '[]',
  at timestamptz not null default now()
);
create index if not exists financial_period_change_business on financial_period_change (business_id, period, at);
alter table financial_period_change enable row level security;
revoke all on financial_period_change from anon, authenticated;
drop trigger if exists financial_period_change_append_only on financial_period_change;
create trigger financial_period_change_append_only before update or delete on financial_period_change
  for each row execute function refuse_history_change();
drop trigger if exists financial_period_change_no_truncate on financial_period_change;
create trigger financial_period_change_no_truncate before truncate on financial_period_change
  for each statement execute function refuse_history_change();
-- financial_event had no truncate guard (0100); it gets the same as the others.
drop trigger if exists financial_event_no_truncate on financial_event;
create trigger financial_event_no_truncate before truncate on financial_event
  for each statement execute function refuse_history_change();

-- erase_history (0100), unchanged except that financial_period_change joins
-- the protected history tables it can erase from.
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
    'financial_period_change'
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

alter table financial_event add column if not exists reported_period date;

create or replace function financial_event_period(p_reported date, p_occurred timestamptz)
returns date language sql immutable as $$
  select coalesce(p_reported, date_trunc('month', p_occurred)::date)
$$;

-- The month a fact is reported in, set as it is recorded.
create or replace function financial_event_set_period()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_own date := date_trunc('month', new.occurred_at)::date;
  v_period date := v_own;
begin
  while exists (select 1 from financial_period p
                 where p.business_id = new.business_id and p.period = v_period and p.status = 'closed') loop
    v_period := (v_period + interval '1 month')::date;
  end loop;
  new.reported_period := v_period;
  if v_period <> v_own then
    new.detail := coalesce(new.detail, '{}') || jsonb_build_object(
      'belongs_to_period', v_own,
      'reported_late', true);
  end if;
  return new;
end
$fn$;

drop trigger if exists financial_event_period_on_insert on financial_event;
create trigger financial_event_period_on_insert before insert on financial_event
  for each row execute function financial_event_set_period();

create or replace function financial_period_totals(p_business uuid, p_period date)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'period', p_period,
    'by_kind', coalesce((select jsonb_object_agg(kind, jsonb_build_object('count', n, 'amount', total))
                           from (select kind, count(*) as n, sum(amount) as total from financial_event
                                  where business_id = p_business
                                    and financial_event_period(reported_period, occurred_at) = p_period
                                  group by kind) k), '{}'),
    'reported_late', (select count(*) from financial_event
                       where business_id = p_business and reported_period = p_period
                         and detail ? 'belongs_to_period'),
    'facts', (select count(*) from financial_event
               where business_id = p_business and financial_event_period(reported_period, occurred_at) = p_period))
$fn$;

create or replace function close_financial_period(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_period date := date_trunc('month', (p->>'period')::date)::date;
  v_warnings jsonb := '[]';
  v_open int; v_off int;
  v_totals jsonb;
begin
  perform require_permission(v_actor, v_business, array['business.settings']);
  if v_period is null then raise exception 'period_needed: say which month to close'; end if;
  if v_period >= date_trunc('month', current_date)::date then
    raise exception 'period_not_ended: a month can only be closed once it has ended';
  end if;
  if exists (select 1 from financial_period where business_id = v_business and period = v_period and status = 'closed') then
    return jsonb_build_object('period', v_period, 'already_closed', true);
  end if;

  select count(*) filter (where s.closed_at is null),
         count(*) filter (where s.closed_at is not null and coalesce(s.cash_difference, 0) <> 0)
    into v_open, v_off
    from pos_shift s
   where s.business_id = v_business
     and s.opened_at < (v_period + interval '1 month') and coalesce(s.closed_at, now()) >= v_period;
  if v_open > 0 then
    v_warnings := v_warnings || jsonb_build_object('warning', 'shifts_open', 'count', v_open,
      'say', 'Some till shifts from this month are still open. Cash from them will be reported in the next open month.');
  end if;
  if v_off > 0 then
    v_warnings := v_warnings || jsonb_build_object('warning', 'shifts_not_balanced', 'count', v_off,
      'say', 'Some shifts this month did not count out to what was expected.');
  end if;

  v_totals := financial_period_totals(v_business, v_period);
  insert into financial_period (business_id, period, status, closed_at, closed_by, updated_at)
  values (v_business, v_period, 'closed', now(), v_actor, now())
  on conflict (business_id, period) do update
     set status = 'closed', closed_at = now(), closed_by = v_actor, updated_at = now();
  insert into financial_period_change (business_id, period, action, actor_membership_id, note, totals, warnings)
  values (v_business, v_period, 'closed', v_actor, nullif(btrim(coalesce(p->>'note', '')), ''), v_totals, v_warnings);
  insert into audit_log (business_id, actor_membership_id, action, entity_type, detail)
  values (v_business, v_actor, 'financial_period.closed', 'financial_period',
          jsonb_build_object('period', v_period, 'warnings', v_warnings));

  return jsonb_build_object('period', v_period, 'closed', true, 'totals', v_totals, 'warnings', v_warnings);
end
$fn$;

create or replace function reopen_financial_period(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_period date := date_trunc('month', (p->>'period')::date)::date;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
begin
  perform require_permission(v_actor, v_business, array['business.settings']);
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'reason_needed: say why the month is being reopened, in at least 10 characters';
  end if;
  if not exists (select 1 from financial_period where business_id = v_business and period = v_period and status = 'closed') then
    return jsonb_build_object('period', v_period, 'already_open', true);
  end if;
  update financial_period set status = 'open', updated_at = now()
   where business_id = v_business and period = v_period;
  insert into financial_period_change (business_id, period, action, actor_membership_id, note, totals)
  values (v_business, v_period, 'reopened', v_actor,
          v_reason || ' (facts recorded while it was closed stay in the month they were reported in)',
          financial_period_totals(v_business, v_period));
  insert into audit_log (business_id, actor_membership_id, action, entity_type, detail)
  values (v_business, v_actor, 'financial_period.reopened', 'financial_period',
          jsonb_build_object('period', v_period, 'reason', v_reason));
  return jsonb_build_object('period', v_period, 'reopened', true);
end
$fn$;

create or replace function financial_periods(p_business uuid)
returns table (period date, status text, facts bigint, last_closed_at timestamptz, reported_late bigint)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with months as (
    select distinct financial_event_period(reported_period, occurred_at) as period
      from financial_event where business_id = p_business
    union
    select period from financial_period where business_id = p_business
  )
  select m.period,
         coalesce(fp.status, 'open'),
         (select count(*) from financial_event e where e.business_id = p_business
             and financial_event_period(e.reported_period, e.occurred_at) = m.period),
         fp.closed_at,
         (select count(*) from financial_event e where e.business_id = p_business
             and e.reported_period = m.period and e.detail ? 'belongs_to_period')
    from months m
    left join financial_period fp on fp.business_id = p_business and fp.period = m.period
   order by m.period
$fn$;

revoke all on function financial_period_totals(uuid, date) from public, anon, authenticated;
revoke all on function close_financial_period(jsonb) from public, anon, authenticated;
revoke all on function reopen_financial_period(jsonb) from public, anon, authenticated;
revoke all on function financial_periods(uuid) from public, anon, authenticated;
grant execute on function financial_period_totals(uuid, date) to service_role;
grant execute on function close_financial_period(jsonb) to service_role;
grant execute on function reopen_financial_period(jsonb) to service_role;
grant execute on function financial_periods(uuid) to service_role;
