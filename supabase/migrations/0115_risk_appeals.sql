-- ---------------------------------------------------------------------------
-- 0115  Risk and Trust, step R5: what the business sees, and appeals
--
-- RISK_AND_TRUST_PLAN.md, decision 5 approved 18 Nov 2026. A business that is
-- restricted, suspended or terminated is told so: what is limited, since
-- when, in plain words why, and how to appeal. Monitor and review are never
-- shown: telling someone they are being watched for fraud tells a fraudster
-- to stop leaving evidence. Spec 09 section 12, spec 14.
--
-- "Why" is never the admin's own case notes. Those are written for the
-- record and can name a customer or a signal. The business reads a plain
-- line for the risk area, or a message an admin wrote for the business on
-- purpose (set_case_business_message).
--
--   risk_case.business_message  what the business is told, written by an admin
--   risk_appeal                 one row per appeal: the owner's words, and
--                               BVM's decision and its reason
--   business_risk_notice        what the business sees (nothing below restricted)
--   set_case_business_message   an admin writes the line the business reads
--   submit_risk_appeal          the owner appeals; one open appeal at a time
--   decide_risk_appeal          an admin accepts (the state moves to monitor
--                               or normal, lifting every restriction) or
--                               declines, with a reason the business reads.
--                               An appeal against a suspension or termination
--                               is decided by an admin who did not make it.
--   open_risk_appeals           appeals waiting, for the desk (R6)
--
-- Tables and columns read: business_risk (state, case_id, changed_by,
-- changed_at), risk_case (domain, status), risk_case_event (case_id, action,
-- to_state, by_person_id, at), business_restriction
-- (control, set_at, lifted_at), business_membership (person_id, business_id,
-- role_id, status), role (key), business (name).
-- ---------------------------------------------------------------------------

alter table risk_case add column if not exists business_message text
  check (business_message is null or length(business_message) between 10 and 500);

create table if not exists risk_appeal (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  case_id uuid not null references risk_case(id),
  state_appealed text not null check (state_appealed in ('restricted', 'suspended', 'terminated')),
  appeal_text text not null check (length(appeal_text) between 20 and 2000),
  submitted_by uuid not null references person(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  decided_by uuid references person(id),
  decided_at timestamptz,
  decision_note text
);
create unique index if not exists risk_appeal_one_open on risk_appeal (business_id) where status = 'open';
create index if not exists risk_appeal_case on risk_appeal (case_id, submitted_at);
alter table risk_appeal enable row level security;
revoke all on risk_appeal from anon, authenticated;

alter table risk_case_event drop constraint if exists risk_case_event_action_check;
alter table risk_case_event add constraint risk_case_event_action_check check (action in (
  'opened', 'note', 'state_changed', 'state_requested', 'state_confirmed', 'state_declined', 'resolved',
  'restriction_set', 'restriction_lifted', 'business_message_set', 'appeal_received', 'appeal_decided'));

-- The line a business reads when no admin has written one.
create or replace function risk_domain_message(p_domain text)
returns text language sql immutable
set search_path = public, pg_temp
as $fn$
  select case p_domain
    when 'refund_abuse' then 'Ascend is looking into refunds and reversals on this business.'
    when 'payment_fraud' then 'Ascend is looking into payments taken through this business.'
    when 'cash_discipline' then 'Ascend is looking into the cash records from this business''s till.'
    when 'fake_merchant' then 'Ascend is checking that this business''s details are genuine.'
    when 'messaging_abuse' then 'Ascend is looking into messages this business has sent to customers.'
    when 'customer_complaint' then 'Ascend is looking into complaints from this business''s customers.'
    when 'prohibited_goods' then 'Ascend is looking into what this business sells.'
    when 'counterfeit_goods' then 'Ascend is looking into what this business sells.'
    else 'Ascend is reviewing activity on this business.' end
$fn$;

create or replace function set_case_business_message(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_message text := nullif(btrim(coalesce(p->>'message', '')), '');
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_message is not null and length(v_message) < 10 then
    raise exception 'message_too_short: say it in at least 10 characters, or leave it empty for the standard line';
  end if;
  update risk_case set business_message = v_message where id = c.id;
  insert into risk_case_event (case_id, business_id, action, detail, by_person_id)
  values (c.id, c.business_id, 'business_message_set', coalesce(v_message, '(back to the standard line)'), v_admin);
  return jsonb_build_object('case_id', c.id, 'business_message', v_message);
end
$fn$;

-- What a business sees. Below restricted it is told nothing at all.
create or replace function business_risk_notice(p_business uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  r business_risk%rowtype;
  c risk_case%rowtype;
  v_appeal jsonb;
begin
  select * into r from business_risk where business_id = p_business;
  if not found or r.state not in ('restricted', 'suspended', 'terminated') then
    return jsonb_build_object('visible', false);
  end if;
  select * into c from risk_case where id = r.case_id;

  select jsonb_build_object('status', a.status, 'submitted_at', a.submitted_at,
                            'decided_at', a.decided_at, 'decision_note', a.decision_note)
    into v_appeal
    from risk_appeal a
   where a.business_id = p_business and a.case_id = r.case_id
   order by a.submitted_at desc limit 1;

  return jsonb_build_object(
    'visible', true,
    'state', r.state,
    'since', r.changed_at,
    'message', coalesce(c.business_message, risk_domain_message(c.domain)),
    'restrictions', coalesce((select jsonb_agg(jsonb_build_object('control', x.control, 'since', x.set_at) order by x.set_at)
                                from business_restriction x
                               where x.business_id = p_business and x.lifted_at is null), '[]'::jsonb),
    'appeal', v_appeal,
    'can_appeal', coalesce(v_appeal->>'status', '') <> 'open');
end
$fn$;

create or replace function submit_risk_appeal(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_person uuid := nullif(p->>'person_id', '')::uuid;
  v_text text := nullif(btrim(coalesce(p->>'appeal_text', '')), '');
  r business_risk%rowtype;
  v_id uuid;
begin
  if not exists (select 1 from business_membership m join role ro on ro.id = m.role_id
                  where m.business_id = v_business and m.person_id = v_person
                    and ro.key = 'owner' and m.status = 'active') then
    raise exception 'owner_only: only the owner of the business can appeal';
  end if;
  select * into r from business_risk where business_id = v_business for update;
  if not found or r.state not in ('restricted', 'suspended', 'terminated') then
    raise exception 'nothing_to_appeal';
  end if;
  if v_text is null or length(v_text) < 20 then
    raise exception 'appeal_too_short: explain in at least 20 characters';
  end if;
  if length(v_text) > 2000 then raise exception 'appeal_too_long'; end if;
  if exists (select 1 from risk_appeal where business_id = v_business and status = 'open') then
    raise exception 'appeal_already_open';
  end if;

  insert into risk_appeal (business_id, case_id, state_appealed, appeal_text, submitted_by)
  values (v_business, r.case_id, r.state, v_text, v_person)
  returning id into v_id;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (r.case_id, v_business, 'appeal_received', r.state, v_text, v_person);
  return jsonb_build_object('appeal_id', v_id, 'status', 'open');
end
$fn$;

create or replace function decide_risk_appeal(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_outcome text := p->>'outcome';
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_state text := coalesce(nullif(p->>'new_state', ''), 'monitor');
  a risk_appeal%rowtype;
  r business_risk%rowtype;
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into a from risk_appeal where id = (p->>'appeal_id')::uuid for update;
  if not found then raise exception 'appeal_not_found'; end if;
  if a.status <> 'open' then return jsonb_build_object('appeal_id', a.id, 'already', a.status); end if;
  if v_outcome not in ('accepted', 'declined') then raise exception 'outcome_unknown: accepted or declined'; end if;
  if v_note is null or length(v_note) < 10 then
    raise exception 'note_needed: the business reads this, say it in at least 10 characters';
  end if;
  select * into r from business_risk where business_id = a.business_id;
  select * into c from risk_case where id = a.case_id;

  -- Someone other than the admin who made a suspension or termination hears the appeal against it.
  -- Who asked and who confirmed are read from the case history: a confirmation clears the request.
  if a.state_appealed in ('suspended', 'terminated') and (v_admin = r.changed_by or exists (
       select 1 from risk_case_event e
        where e.case_id = a.case_id and e.to_state = a.state_appealed and e.by_person_id = v_admin
          and e.action in ('state_requested', 'state_confirmed')
          and e.at >= coalesce((select max(x.at) from risk_case_event x
                                 where x.case_id = a.case_id and x.action = 'state_requested'
                                   and x.to_state = a.state_appealed), '-infinity'))) then
    raise exception 'another_admin: an appeal against a % is decided by an admin who did not make it', a.state_appealed;
  end if;

  if v_outcome = 'accepted' then
    if v_state not in ('normal', 'monitor') then raise exception 'state_after_appeal: normal or monitor'; end if;
    if r.state is distinct from a.state_appealed then
      raise exception 'state_moved: the business is now %, decide the appeal from the case', coalesce(r.state, 'normal');
    end if;
    perform set_risk_state(jsonb_build_object('case_id', a.case_id, 'state', v_state,
                                              'reason', 'Appeal accepted: ' || v_note, 'admin_person_id', v_admin));
  end if;

  update risk_appeal set status = v_outcome, decided_by = v_admin, decided_at = now(), decision_note = v_note
   where id = a.id;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (a.case_id, a.business_id, 'appeal_decided', case when v_outcome = 'accepted' then v_state else r.state end,
          initcap(v_outcome) || ': ' || v_note, v_admin);
  return jsonb_build_object('appeal_id', a.id, 'status', v_outcome, 'state', risk_state(a.business_id));
end
$fn$;

create or replace function open_risk_appeals()
returns table (appeal_id uuid, business_id uuid, business_name text, case_id uuid, state_appealed text,
               appeal_text text, submitted_at timestamptz, made_by uuid)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select a.id, a.business_id, b.name, a.case_id, a.state_appealed, a.appeal_text, a.submitted_at,
         (select r.changed_by from business_risk r where r.business_id = a.business_id)
    from risk_appeal a join business b on b.id = a.business_id
   where a.status = 'open'
   order by a.submitted_at
$fn$;

revoke all on function risk_domain_message(text) from public, anon, authenticated;
revoke all on function set_case_business_message(jsonb) from public, anon, authenticated;
revoke all on function business_risk_notice(uuid) from public, anon, authenticated;
revoke all on function submit_risk_appeal(jsonb) from public, anon, authenticated;
revoke all on function decide_risk_appeal(jsonb) from public, anon, authenticated;
revoke all on function open_risk_appeals() from public, anon, authenticated;
grant execute on function risk_domain_message(text) to service_role;
grant execute on function set_case_business_message(jsonb) to service_role;
grant execute on function business_risk_notice(uuid) to service_role;
grant execute on function submit_risk_appeal(jsonb) to service_role;
grant execute on function decide_risk_appeal(jsonb) to service_role;
grant execute on function open_risk_appeals() to service_role;
