-- AscendSME Connected Platform. Migration 0024: MOT.
--
-- MOT is a periodic structured review of operating condition, not another
-- score (RDY-002, SCR-001). The Sustainability Score answers "how strong is
-- this business's record". The MOT answers a different question: "what is
-- wrong right now, and what should be done about it".
--
-- So it produces findings and required actions, each tied to a real
-- condition in the business's own records, and a date it is next due. A
-- business can pass its MOT with a modest score, and a business with a good
-- score can fail one because something has gone wrong this month.

create type mot_verdict as enum ('pass', 'attention', 'action_required', 'not_applicable');

create table mot_review (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  model_version text not null,
  overall mot_verdict not null,
  checks jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  period_from date not null,
  period_to date not null,
  reviewed_at timestamptz not null default now(),
  next_due_at date not null
);
create index mot_business_idx on mot_review(business_id, reviewed_at desc);

alter table mot_review enable row level security;
revoke update, delete on mot_review from public;

-- Every check reads the same shape, so the UI never has to special-case one.
create or replace function check_row(
  p_key text, p_verdict text, p_finding text, p_action text
)
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'key', p_key,
    'verdict', p_verdict,
    'finding', p_finding,
    'action', p_action
  );
$$;

-- ---------------------------------------------------------------------------
-- run_mot: the inspection.
--
-- Every check reads a real condition and, where something is wrong, names
-- the specific action that fixes it (SCR-004). Checks that do not apply to
-- how this business operates return not_applicable rather than failing it
-- for something it does not do (SCR-006).
-- ---------------------------------------------------------------------------
create or replace function run_mot(p_business uuid, p_days int default 90)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business business%rowtype;
  v_from date := current_date - p_days;
  v_to date := current_date;
  v_checks jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_overall mot_verdict := 'pass';
  v_review uuid;

  v_trading_days int;
  v_sales_count int;
  v_unreconciled int;
  v_unexplained int;
  v_overdue_count int;
  v_overdue_total numeric;
  v_stale_devices int;
  v_unsent int;
  v_pending_orders int;
  v_open_approvals int;
  v_documents int;
  v_uses_pos boolean;
  v_uses_documents boolean;
begin
  select * into v_business from business where id = p_business;
  if not found then
    raise exception 'business_not_found';
  end if;

  -- Which checks apply depends on what the business actually uses.
  select exists (select 1 from sale where business_id = p_business) into v_uses_pos;
  select exists (select 1 from document where business_id = p_business) into v_uses_documents;

  -- 1. Trading consistency. Long silences are the earliest signal that a
  --    business has stopped operating, or stopped recording.
  select count(distinct business_date), count(*)
  into v_trading_days, v_sales_count
  from sale
  where business_id = p_business and business_date between v_from and v_to
    and status = 'completed';

  if not v_uses_pos then
    v_checks := v_checks || check_row(
      'trading_consistency', 'not_applicable',
      'This business does not sell through a till.', null);
  elsif v_sales_count = 0 then
    v_checks := v_checks || check_row(
      'trading_consistency', 'action_required',
      'No sales recorded in the last ' || p_days || ' days.',
      'Record your sales as they happen, even the cash ones. An empty record cannot show a lender anything.');
    v_overall := 'action_required';
  elsif v_trading_days < (p_days / 7) then
    v_checks := v_checks || check_row(
      'trading_consistency', 'attention',
      'Sales recorded on only ' || v_trading_days || ' days out of ' || p_days || '.',
      'If you traded on other days, record those sales too. Gaps read as inactivity.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  else
    v_checks := v_checks || check_row(
      'trading_consistency', 'pass',
      'Trading recorded across ' || v_trading_days || ' days.', null);
  end if;

  -- 2. Cash reconciliation. An unclosed shift means nobody counted the
  --    drawer; an unexplained difference means nobody accounted for it.
  select
    count(*) filter (where status = 'open' and opened_at < now() - interval '2 days'),
    count(*) filter (where status = 'closed' and abs(coalesce(cash_difference, 0)) > 5
                       and coalesce(difference_note, '') = '')
  into v_unreconciled, v_unexplained
  from pos_shift
  where business_id = p_business and opened_at::date between v_from and v_to;

  if not v_uses_pos then
    v_checks := v_checks || check_row(
      'cash_reconciliation', 'not_applicable',
      'This business does not run tills.', null);
  elsif v_unreconciled > 0 then
    v_checks := v_checks || check_row(
      'cash_reconciliation', 'action_required',
      v_unreconciled || ' shift' || case when v_unreconciled = 1 then '' else 's' end
        || ' left open for more than two days.',
      'Close them and count the drawer. An open shift means the day was never reconciled.');
    v_overall := 'action_required';
  elsif v_unexplained > 0 then
    v_checks := v_checks || check_row(
      'cash_reconciliation', 'attention',
      v_unexplained || ' shift close' || case when v_unexplained = 1 then '' else 's' end
        || ' with a cash difference and no explanation.',
      'Ask the cashier what happened and record it. Unexplained differences are what auditors look for first.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  else
    v_checks := v_checks || check_row(
      'cash_reconciliation', 'pass', 'Shifts are being closed and counted.', null);
  end if;

  -- 3. Collections. Money invoiced but never chased is money lost, and it
  --    shows in the record as revenue that never became cash.
  select count(*), coalesce(sum(amount_due - amount_paid), 0)
  into v_overdue_count, v_overdue_total
  from receivable
  where business_id = p_business and settled_at is null
    and due_date is not null and due_date < current_date;

  if not v_uses_documents then
    v_checks := v_checks || check_row(
      'collections', 'not_applicable',
      'This business does not issue invoices.', null);
  elsif v_overdue_count = 0 then
    v_checks := v_checks || check_row(
      'collections', 'pass', 'Nothing is overdue.', null);
  elsif v_overdue_count > 5 or v_overdue_total > 5000 then
    v_checks := v_checks || check_row(
      'collections', 'action_required',
      v_overdue_count || ' invoices overdue, GHS ' || round(v_overdue_total, 2) || ' outstanding.',
      'Chase these this week. Start with the oldest and the largest.');
    v_overall := 'action_required';
  else
    v_checks := v_checks || check_row(
      'collections', 'attention',
      v_overdue_count || ' invoice' || case when v_overdue_count = 1 then '' else 's' end
        || ' overdue, GHS ' || round(v_overdue_total, 2) || ' outstanding.',
      'Send a reminder. Most late payments are forgotten, not refused.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  end if;

  -- 4. Device health. Sales stranded on a till are not in the record at
  --    all, and the owner usually does not know.
  select
    count(*) filter (where last_sync_at is null or last_sync_at < now() - interval '3 days'),
    coalesce(sum(pending_transaction_count), 0)
  into v_stale_devices, v_unsent
  from device_registration
  where business_id = p_business and status = 'active';

  if not v_uses_pos then
    v_checks := v_checks || check_row(
      'device_health', 'not_applicable', 'No tills registered.', null);
  elsif v_unsent > 0 or v_stale_devices > 0 then
    v_checks := v_checks || check_row(
      'device_health', 'action_required',
      case when v_unsent > 0
        then v_unsent || ' sales still sitting on a till, not sent.'
        else v_stale_devices || ' till has not checked in for over three days.' end,
      'Get the till onto network and let it sync. Until it does, those sales are in nobody''s record but that device''s.');
    v_overall := 'action_required';
  else
    v_checks := v_checks || check_row(
      'device_health', 'pass', 'All tills are checking in and synced.', null);
  end if;

  -- 5. Documentation. A business that never issues a document has no
  --    paper trail to show anyone.
  select count(*) into v_documents
  from document
  where business_id = p_business and number is not null
    and created_at::date between v_from and v_to;

  if v_documents = 0 and v_sales_count > 0 then
    v_checks := v_checks || check_row(
      'documentation', 'attention',
      'Sales recorded, but no invoices or receipts issued.',
      'Issue receipts for your sales. It is the paper trail a bank asks for first.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  elsif v_documents = 0 then
    v_checks := v_checks || check_row(
      'documentation', 'attention',
      'No documents issued in this period.',
      'Issue your next quote or invoice through Ascend so it carries a number and cannot be disputed.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  else
    v_checks := v_checks || check_row(
      'documentation', 'pass',
      v_documents || ' document' || case when v_documents = 1 then '' else 's' end || ' issued.', null);
  end if;

  -- 6. Nothing stuck. Work waiting on a person is the most common way a
  --    small business quietly loses a customer.
  select
    (select count(*) from shop_order
      where business_id = p_business and status = 'pending'
        and placed_at < now() - interval '24 hours'),
    (select count(*) from approval_request
      where business_id = p_business and status = 'requested'
        and created_at < now() - interval '3 days')
  into v_pending_orders, v_open_approvals;

  if v_pending_orders > 0 or v_open_approvals > 0 then
    v_checks := v_checks || check_row(
      'nothing_stuck', 'action_required',
      case when v_pending_orders > 0
        then v_pending_orders || ' order' || case when v_pending_orders = 1 then '' else 's' end
             || ' waiting over a day for you to confirm.'
        else v_open_approvals || ' request' || case when v_open_approvals = 1 then '' else 's' end
             || ' waiting over three days for a decision.' end,
      'Clear these today. A customer who waits a day usually does not wait two.');
    v_overall := 'action_required';
  else
    v_checks := v_checks || check_row(
      'nothing_stuck', 'pass', 'Nothing is waiting on a decision.', null);
  end if;

  -- 7. Identity. Not a failure if unverified: many real businesses are not
  --    registered, and the platform does not require it (VIS-002, MKT-005).
  if v_business.identity_verification = 'verified' then
    v_checks := v_checks || check_row(
      'identity', 'pass', 'Business identity is verified.', null);
  else
    v_checks := v_checks || check_row(
      'identity', 'attention',
      'Business identity is not verified yet.',
      'Verifying lifts how much a lender trusts everything else in your record. It does not change your score by itself.');
    if v_overall = 'pass' then v_overall := 'attention'; end if;
  end if;

  -- Actions are the subset a person can act on, ordered by urgency.
  select coalesce(jsonb_agg(c order by
    case c->>'verdict' when 'action_required' then 0 else 1 end), '[]'::jsonb)
  into v_actions
  from jsonb_array_elements(v_checks) c
  where c->>'action' is not null and c->>'action' <> 'null';

  insert into mot_review (
    business_id, model_version, overall, checks, actions,
    period_from, period_to, next_due_at
  ) values (
    p_business, '2026.08-1', v_overall, v_checks, v_actions,
    v_from, v_to, current_date + 90
  )
  returning id into v_review;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, payload, business_date
  ) values (
    'readiness.mot.completed', p_business, 'system', 'readiness',
    'mot_review', v_review,
    jsonb_build_object('overall', v_overall, 'action_count', jsonb_array_length(v_actions)),
    current_date
  );

  return jsonb_build_object(
    'review_id', v_review,
    'overall', v_overall,
    'checks', v_checks,
    'actions', v_actions,
    'next_due_at', current_date + 90
  );
end;
$$;
