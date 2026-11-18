-- ---------------------------------------------------------------------------
-- 0114  Risk and Trust, step R4: customer reports
--
-- RISK_AND_TRUST_PLAN.md, decision 6 approved 18 Nov 2026. A customer can
-- report a problem with a business from the invoice or receipt page, the
-- shop and the booking page. No sign-in; the customer's number is optional.
-- At most 3 reports a day from one phone (device key) or one number. A
-- report is a signal for a person to read, never a verdict: it changes
-- nothing about the business by itself. Spec 09 sections 9 and 13.
--
--   customer_report            one row per report: where it came from, the
--                              reason, the customer's words, their number if
--                              they gave it, and what BVM did with it
--   submit_customer_report     the public route's only way in; refuses the
--                              4th report in 24 hours from one device or number
--   review_customer_report     a BVM admin dismisses a report, opens a case
--                              from it, or adds it to the business's open case
--   open_customer_reports      the reports waiting for a person, for the desk
--   risk_signals               (0113) gains customer_reports
--   complete_data_deletion     (0110) also clears the number from reports
--
-- Reasons and the risk area each points to:
--   not_delivered     paid, and nothing came            customer_complaint
--   wrong_amount      charged more than agreed          customer_complaint
--   refund_refused    a refund promised and not paid    customer_complaint
--   fake_business     not a real business, or a scam    fake_merchant
--   unwanted_messages messages they did not ask for     messaging_abuse
--   other                                               customer_complaint
--
-- Tables and columns read: business (id, name), document (id, business_id),
-- platform_admin (via risk_admin_check), risk_case (id, business_id, status),
-- risk_case_event, data_deletion_request (phone).
-- ---------------------------------------------------------------------------

create table if not exists customer_report (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  source text not null check (source in ('invoice', 'shop', 'booking')),
  document_id uuid references document(id),
  reason text not null check (reason in
    ('not_delivered', 'wrong_amount', 'refund_refused', 'fake_business', 'unwanted_messages', 'other')),
  detail text check (detail is null or length(detail) <= 600),
  reporter_phone_e164 text,
  reporter_key text not null,
  status text not null default 'open' check (status in ('open', 'dismissed', 'case_opened', 'added_to_case')),
  case_id uuid references risk_case(id),
  reviewed_by uuid references person(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists customer_report_business_idx on customer_report (business_id, created_at desc);
create index if not exists customer_report_key_idx on customer_report (reporter_key, created_at desc);
create index if not exists customer_report_phone_idx on customer_report (reporter_phone_e164, created_at desc)
  where reporter_phone_e164 is not null;
create index if not exists customer_report_open_idx on customer_report (created_at) where status = 'open';
alter table customer_report enable row level security;
revoke all on customer_report from anon, authenticated;

create or replace function customer_report_domain(p_reason text)
returns text language sql immutable
set search_path = public, pg_temp
as $fn$
  select case p_reason
    when 'fake_business' then 'fake_merchant'
    when 'unwanted_messages' then 'messaging_abuse'
    else 'customer_complaint' end
$fn$;

create or replace function customer_report_label(p_reason text)
returns text language sql immutable
set search_path = public, pg_temp
as $fn$
  select case p_reason
    when 'not_delivered' then 'paid and nothing came'
    when 'wrong_amount' then 'charged more than agreed'
    when 'refund_refused' then 'refund not paid'
    when 'fake_business' then 'not a real business'
    when 'unwanted_messages' then 'unwanted messages'
    else 'something else' end
$fn$;

create or replace function submit_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_document uuid := nullif(p->>'document_id', '')::uuid;
  v_key text := nullif(btrim(coalesce(p->>'reporter_key', '')), '');
  v_phone text := nullif(btrim(coalesce(p->>'reporter_phone', '')), '');
  v_detail text := nullif(btrim(coalesce(p->>'detail', '')), '');
  v_recent int;
  v_id uuid;
begin
  if v_business is null or not exists (select 1 from business where id = v_business) then
    raise exception 'business_not_found';
  end if;
  if v_document is not null and not exists (select 1 from document where id = v_document and business_id = v_business) then
    raise exception 'document_not_for_business';
  end if;
  if v_key is null or length(v_key) < 16 then raise exception 'reporter_key_needed'; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone_not_e164'; end if;
  if v_detail is not null then v_detail := left(v_detail, 600); end if;

  -- One person, three reports a day, however many businesses or numbers.
  perform pg_advisory_xact_lock(hashtext('customer_report:' || v_key));
  select count(*) into v_recent from customer_report
   where created_at >= now() - interval '24 hours'
     and (reporter_key = v_key or (v_phone is not null and reporter_phone_e164 = v_phone));
  if v_recent >= 3 then
    return jsonb_build_object('status', 'limited');
  end if;

  insert into customer_report (business_id, source, document_id, reason, detail, reporter_phone_e164, reporter_key)
  values (v_business, p->>'source', v_document, p->>'reason', v_detail, v_phone, v_key)
  returning id into v_id;
  return jsonb_build_object('status', 'received', 'report_id', v_id);
end
$fn$;

create or replace function review_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_outcome text := p->>'outcome';
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  r customer_report%rowtype;
  v_case uuid;
  v_evidence jsonb;
begin
  perform risk_admin_check(v_admin);
  select * into r from customer_report where id = (p->>'report_id')::uuid for update;
  if not found then raise exception 'report_not_found'; end if;
  if r.status <> 'open' then
    return jsonb_build_object('report_id', r.id, 'already', r.status, 'case_id', r.case_id);
  end if;
  if v_note is null or length(v_note) < 10 then
    raise exception 'note_needed: say what you found, in at least 10 characters';
  end if;

  v_evidence := jsonb_build_object('customer_report', jsonb_build_object(
    'report_id', r.id, 'reason', r.reason, 'source', r.source, 'detail', r.detail,
    'reported_at', r.created_at, 'number_given', r.reporter_phone_e164 is not null));

  if v_outcome = 'dismiss' then
    update customer_report set status = 'dismissed', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'dismissed');

  elsif v_outcome = 'open_case' then
    v_case := (open_risk_case(jsonb_build_object(
      'business_id', r.business_id,
      'domain', coalesce(nullif(p->>'domain', ''), customer_report_domain(r.reason)),
      'trigger', 'Customer report, ' || customer_report_label(r.reason) || ': ' || v_note,
      'evidence', v_evidence,
      'admin_person_id', v_admin))->>'case_id')::uuid;
    update customer_report set status = 'case_opened', case_id = v_case, reviewed_by = v_admin,
           reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'case_opened', 'case_id', v_case);

  elsif v_outcome = 'add_to_case' then
    select id into v_case from risk_case
     where id = nullif(p->>'case_id', '')::uuid and business_id = r.business_id and status <> 'resolved';
    if v_case is null then raise exception 'case_not_open_for_business'; end if;
    insert into risk_case_event (case_id, business_id, action, detail, by_person_id)
    values (v_case, r.business_id, 'note',
            'Customer report added, ' || customer_report_label(r.reason) || ': ' || v_note, v_admin);
    update customer_report set status = 'added_to_case', case_id = v_case, reviewed_by = v_admin,
           reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'added_to_case', 'case_id', v_case);
  end if;
  raise exception 'outcome_unknown: dismiss, open_case or add_to_case';
end
$fn$;

-- What the desk shows: the customer's number only as its last digits.
create or replace function open_customer_reports()
returns table (report_id uuid, business_id uuid, business_name text, source text, reason text,
               reason_label text, detail text, number_ends text, reported_at timestamptz,
               open_case_id uuid, reports_on_business bigint)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select r.id, r.business_id, b.name, r.source, r.reason, customer_report_label(r.reason), r.detail,
         case when r.reporter_phone_e164 is null then null else right(r.reporter_phone_e164, 3) end,
         r.created_at,
         (select c.id from risk_case c where c.business_id = r.business_id and c.status <> 'resolved'
           order by c.opened_at desc limit 1),
         (select count(*) from customer_report x where x.business_id = r.business_id and x.status = 'open')
    from customer_report r join business b on b.id = r.business_id
   where r.status = 'open'
   order by r.created_at
$fn$;

-- risk_signals (0113), with customer reports.
create or replace function risk_signals()
returns table (business_id uuid, business_name text, risk_state text, signal text, domain text,
               severity text, detail text, figures jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  money as (
    select e.business_id,
           coalesce(sum(e.amount) filter (where e.kind = 'money_received'), 0) as received,
           coalesce(sum(e.amount) filter (where e.kind = 'refund_paid'), 0) as refunded,
           count(*) filter (where e.kind = 'refund_paid') as refunds
      from financial_event e
     where e.occurred_at >= now() - interval '30 days'
     group by e.business_id
  ),
  till as (
    select t.business_id,
           count(*) filter (where t.origin_type = 'sale') as sales,
           count(*) filter (where t.origin_type = 'sale' and t.status = 'reversed') as reversed
      from commercial_transaction t
     where t.occurred_at >= now() - interval '30 days'
     group by t.business_id
  ),
  gaps as (
    select o.business_id, count(*) as n,
           count(*) filter (where o.event_type = 'pos.sales.unaccounted') as unaccounted,
           count(*) filter (where o.event_type = 'pos.sequence.regressed') as regressed
      from event_outbox o
     where o.event_type in ('pos.sales.unaccounted', 'pos.sequence.regressed')
       and o.occurred_at >= now() - interval '30 days'
     group by o.business_id
  ),
  shifts as (
    select s.business_id, count(*) as n, sum(abs(s.cash_difference)) as total
      from pos_shift s
     where s.closed_at >= now() - interval '30 days'
       and coalesce(s.cash_difference, 0) <> 0
       and nullif(btrim(coalesce(s.difference_note, '')), '') is null
     group by s.business_id
  ),
  daily as (
    select t.business_id,
           count(*) filter (where t.occurred_at >= date_trunc('day', now())) as today,
           count(*) filter (where t.occurred_at >= date_trunc('day', now()) - interval '28 days'
                             and t.occurred_at < date_trunc('day', now())) / 28.0 as avg28
      from commercial_transaction t
     where t.occurred_at >= date_trunc('day', now()) - interval '28 days'
       and t.status not in ('draft', 'cancelled')
     group by t.business_id
  ),
  sizes as (
    select t.business_id,
           (percentile_cont(0.5) within group (order by t.total))::numeric as median,
           count(*) as history,
           max(t.total) filter (where t.occurred_at >= now() - interval '7 days') as biggest
      from commercial_transaction t
     where t.occurred_at >= now() - interval '90 days'
       and t.status not in ('draft', 'cancelled') and t.total > 0
     group by t.business_id
  ),
  young as (
    select b.id as business_id, b.created_at,
           (select coalesce(sum(e.amount), 0) from financial_event e
             where e.business_id = b.id and e.kind = 'revenue_earned') as earned,
           (select count(*) from commercial_transaction t
             where t.business_id = b.id and t.status not in ('draft', 'cancelled')) as sales
      from business b
     where b.created_at >= now() - interval '30 days'
  ),
  owners as (
    select m.business_id, min(m.person_id::text) as owner
      from business_membership m join role r on r.id = m.role_id
     where r.key = 'owner'
     group by m.business_id
  ),
  names as (
    select b.id as business_id, lower(regexp_replace(b.name, '[^A-Za-z0-9]', '', 'g')) as norm, o.owner
      from business b left join owners o on o.business_id = b.id
  ),
  dupes as (
    select n1.business_id, count(*) as others
      from names n1 join names n2
        on n2.norm = n1.norm and n2.business_id <> n1.business_id
       and n2.owner is distinct from n1.owner
     where n1.norm <> ''
     group by n1.business_id
  ),
  reports as (
    select c.business_id, count(*) as n,
           count(distinct c.reporter_key) as people,
           mode() within group (order by customer_report_domain(c.reason)) as domain,
           string_agg(distinct customer_report_label(c.reason), ', ') as reasons
      from customer_report c
     where c.status = 'open' and c.created_at >= now() - interval '30 days'
     group by c.business_id
  ),
  raw as (
    select m.business_id, 'refund_rate' as signal, 'refund_abuse' as domain,
           case when m.refunded / m.received >= 0.25 then 'high' else 'medium' end as severity,
           m.refunds || ' refunds, GHS ' || round(m.refunded, 2) || ' of GHS ' || round(m.received, 2)
             || ' received in 30 days (' || round(100 * m.refunded / m.received) || '%)' as detail,
           jsonb_build_object('refunds', m.refunds, 'refunded', m.refunded, 'received', m.received) as figures
      from money m
     where m.received > 0 and m.refunds >= 3 and m.refunded / m.received >= 0.10
    union all
    select t.business_id, 'reversal_rate', 'refund_abuse',
           case when t.reversed::numeric / t.sales >= 0.25 then 'high' else 'medium' end,
           t.reversed || ' of ' || t.sales || ' till sales reversed in 30 days ('
             || round(100.0 * t.reversed / t.sales) || '%)',
           jsonb_build_object('reversed', t.reversed, 'sales', t.sales)
      from till t
     where t.sales > 0 and t.reversed >= 3 and t.reversed::numeric / t.sales >= 0.10
    union all
    select g.business_id, 'till_gaps', 'cash_discipline',
           case when g.n >= 3 then 'high' else 'medium' end,
           g.n || ' till warning' || case when g.n = 1 then '' else 's' end || ' in 30 days ('
             || g.unaccounted || ' reporting sales not accounted for, ' || g.regressed || ' reporting receipts out of order)',
           jsonb_build_object('unaccounted', g.unaccounted, 'regressed', g.regressed)
      from gaps g
    union all
    select s.business_id, 'shift_differences', 'cash_discipline',
           case when s.total > 500 then 'high' else 'medium' end,
           s.n || ' shifts in 30 days that did not count out, with no explanation, GHS ' || round(s.total, 2) || ' in all',
           jsonb_build_object('shifts', s.n, 'total_difference', s.total)
      from shifts s
     where s.n >= 2
    union all
    select d.business_id, 'volume_spike', 'payment_fraud', 'medium',
           d.today || ' sales today against a daily average of ' || round(d.avg28, 1) || ' over the 28 days before',
           jsonb_build_object('today', d.today, 'daily_average', round(d.avg28, 2))
      from daily d
     where d.today >= 20 and d.today > 3 * d.avg28
    union all
    select z.business_id, 'large_sale', 'payment_fraud',
           case when z.biggest >= 10 * z.median then 'high' else 'medium' end,
           'A sale of GHS ' || round(z.biggest, 2) || ' this week, ' || round(z.biggest / z.median, 1)
             || ' times the usual GHS ' || round(z.median::numeric, 2),
           jsonb_build_object('biggest', z.biggest, 'median', round(z.median::numeric, 2), 'history', z.history)
      from sizes z
     where z.history >= 20 and z.median > 0 and z.biggest > 500 and z.biggest >= 5 * z.median
    union all
    select y.business_id, 'new_and_heavy', 'fake_merchant', 'medium',
           case when current_date = y.created_at::date then 'Opened today'
                when current_date - y.created_at::date = 1 then 'Opened yesterday'
                else 'Opened ' || (current_date - y.created_at::date) || ' days ago' end
             || ', with GHS ' || round(y.earned, 2) || ' earned and ' || y.sales
             || case when y.sales = 1 then ' sale' else ' sales' end || ' already',
           jsonb_build_object('age_days', current_date - y.created_at::date, 'earned', y.earned, 'sales', y.sales)
      from young y
     where y.earned >= 20000 or y.sales >= 200
    union all
    select d.business_id, 'likely_duplicate', 'fake_merchant', 'low',
           d.others || ' other business' || case when d.others = 1 then '' else 'es' end
             || ' with the same name and a different owner',
           jsonb_build_object('others', d.others)
      from dupes d
    union all
    select f.business_id, 'messaging_' || f.flag, 'messaging_abuse',
           case when f.flag = 'complaints' then 'high' else 'medium' end,
           f.detail, jsonb_build_object('flag', f.flag)
      from messaging_flags() f
    union all
    -- Customer reports (0114): one person is low, two are medium, three or more are high.
    select c.business_id, 'customer_reports', c.domain,
           case when c.people >= 3 then 'high' when c.people = 2 then 'medium' else 'low' end,
           c.n || ' open customer report' || case when c.n = 1 then '' else 's' end || ' in 30 days from '
             || c.people || case when c.people = 1 then ' person' else ' people' end || ' (' || c.reasons || ')',
           jsonb_build_object('reports', c.n, 'people', c.people)
      from reports c
  )
  select r.business_id, b.name, risk_state(r.business_id), r.signal, r.domain, r.severity, r.detail, r.figures
    from raw r join business b on b.id = r.business_id
   order by case r.severity when 'high' then 0 when 'medium' then 1 else 2 end, b.name, r.signal
$fn$;

-- complete_data_deletion (0110), also clearing the number from customer reports.
create or replace function complete_data_deletion(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req data_deletion_request%rowtype;
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_customers int; v_sessions int; v_messages int; v_orders int; v_bookings int; v_reports int;
begin
  if v_admin is null or not exists (select 1 from platform_admin where person_id = v_admin and role = 'admin' and revoked_at is null) then
    raise exception 'admin_only: only a BVM platform admin can complete a deletion';
  end if;
  select * into v_req from data_deletion_request where id = (p->>'request_id')::uuid;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'received' then
    return jsonb_build_object('request_id', v_req.id, 'already', v_req.status);
  end if;

  -- Orders and bookings stay with the business (its books); counted for BVM.
  select count(*) into v_orders from shop_order o join customer c on c.id = o.customer_id where c.phone_e164 = v_req.phone;
  select count(*) into v_bookings from service_booking b join customer c on c.id = b.customer_id where c.phone_e164 = v_req.phone;

  update customer
     set phone_e164 = null, email = null, notes = null,
         marketing_consent = false, marketing_opt_out_at = coalesce(marketing_opt_out_at, now()), updated_at = now()
   where phone_e164 = v_req.phone;
  get diagnostics v_customers = row_count;
  delete from whatsapp_session where customer_phone = v_req.phone;
  get diagnostics v_sessions = row_count;
  update message set recipient = 'removed at their request' where recipient = v_req.phone;
  get diagnostics v_messages = row_count;
  -- A report they made about a business keeps its words, not their number (0114).
  update customer_report set reporter_phone_e164 = null where reporter_phone_e164 = v_req.phone;
  get diagnostics v_reports = row_count;

  update data_deletion_request
     set status = 'completed', completed_at = now(), completed_by = v_admin,
         outcome = jsonb_build_object(
           'customer_records_cleared', v_customers, 'whatsapp_windows_removed', v_sessions,
           'message_records_cleared', v_messages, 'customer_reports_cleared', v_reports,
           'kept_in_business_records', jsonb_build_object('shop_orders', v_orders, 'bookings', v_bookings),
           'note', nullif(btrim(coalesce(p->>'note', '')), ''))
   where id = v_req.id;
  insert into audit_log (action, entity_type, entity_id, detail)
  values ('data_deletion.completed', 'data_deletion_request', v_req.id,
          jsonb_build_object('completed_by', v_admin, 'customer_records_cleared', v_customers));
  return (select outcome || jsonb_build_object('request_id', id, 'status', status) from data_deletion_request where id = v_req.id);
end
$fn$;


revoke all on function customer_report_domain(text) from public, anon, authenticated;
revoke all on function customer_report_label(text) from public, anon, authenticated;
revoke all on function submit_customer_report(jsonb) from public, anon, authenticated;
revoke all on function review_customer_report(jsonb) from public, anon, authenticated;
revoke all on function open_customer_reports() from public, anon, authenticated;
revoke all on function risk_signals() from public, anon, authenticated;
revoke all on function complete_data_deletion(jsonb) from public, anon, authenticated;
grant execute on function customer_report_domain(text) to service_role;
grant execute on function customer_report_label(text) to service_role;
grant execute on function submit_customer_report(jsonb) to service_role;
grant execute on function review_customer_report(jsonb) to service_role;
grant execute on function open_customer_reports() to service_role;
grant execute on function risk_signals() to service_role;
grant execute on function complete_data_deletion(jsonb) to service_role;
