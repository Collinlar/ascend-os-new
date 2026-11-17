-- ---------------------------------------------------------------------------
-- 0106  Financial Foundation, step F6: the old books retired
--
-- FINANCIAL_FOUNDATION_PLAN.md 2.8, decision 2, approved 17 Nov 2026; the
-- before and after list was read first. Readers move, then writers stop,
-- never the other way round.
--
-- 1. Shared reports to institutions (read_partner_report, 0023) take their
--    monthly revenue from financial_event instead of ledger_entry. Revenue
--    is revenue earned; what was taken back is split into refunds (money
--    given back, till reversals, returns) and credits (credit notes, where
--    no money moved), which the old ledger called refunds. The keys month,
--    revenue and refunds stay, so the report page keeps working; credits is
--    new. No report has been shared on live, so no lender sees a change.
-- 2. The MOT collections check (run_mot, 0024) counts overdue invoices from
--    receivables_aging (0102) instead of the old receivable table, which
--    still lists a fully credited CLASmart invoice as GHS 400 owed.
-- 3. business_revenue (0017), read by nothing, is rebuilt on financial_event
--    with the same columns, so it does not go stale.
-- 4. The products stop writing ledger_entry and receivable. Fourteen
--    product functions insert into them; rather than rewrite each, a
--    trigger on each table quietly drops new rows. No caller uses a
--    returned id from either insert. Updates to existing receivable rows
--    still run and change nothing anyone reads. Both tables stay, readable,
--    as history.
--
-- Each function is generated from its latest definition, edits counted.
--
-- Tables and columns read: financial_event, receivables_aging(),
-- ledger_entry, receivable.
-- ---------------------------------------------------------------------------

create or replace function read_partner_report(p_token_hash text, p_accessor text)
returns jsonb
language plpgsql security definer
as $$
declare
  v_share report_share%rowtype;
  v_business business%rowtype;
  v_fields text[];
  v_report jsonb := '{}'::jsonb;
  v_score score_result%rowtype;
  v_from date;
  v_to date;
  v_revenue jsonb;
  v_docs jsonb;
  v_activity jsonb;
begin
  select * into v_share from report_share where token_hash = p_token_hash;

  if not found
     or v_share.status <> 'active'
     or v_share.revoked_at is not null
     or (v_share.expires_at is not null and v_share.expires_at < now()) then
    return null;
  end if;

  select * into v_business from business where id = v_share.business_id;
  select array(select jsonb_array_elements_text(v_share.authorized_fields)) into v_fields;

  v_from := coalesce(v_share.period_from, current_date - interval '365 days');
  v_to := coalesce(v_share.period_to, current_date);

  -- Access is logged before data is returned, so a read cannot happen
  -- without a record of it (INS-010, RDY-015).
  insert into report_access_log (share_id, accessor) values (v_share.id, p_accessor);

  if 'business_identity' = any(v_fields) then
    v_report := v_report || jsonb_build_object(
      'business_identity', jsonb_build_object(
        'name', v_business.name,
        'country', v_business.country_code,
        'archetype', v_business.archetype,
        'identity_verification', v_business.identity_verification,
        'legal_registration_status', v_business.legal_registration_status
      )
    );
  end if;

  if 'sustainability_score' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'sustainability_score'
    order by computed_at desc limit 1;

    if found then
      v_report := v_report || jsonb_build_object(
        'sustainability_score', jsonb_build_object(
          'value', v_score.value,
          'computed_at', v_score.computed_at,
          'breakdown', v_score.dimension_breakdown
        )
      );
    end if;
  end if;

  if 'evidence_confidence' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'evidence_confidence'
    order by computed_at desc limit 1;
    if found then
      v_report := v_report || jsonb_build_object('evidence_confidence', v_score.value);
    end if;
  end if;

  if 'trust_level' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'trust_level'
    order by computed_at desc limit 1;
    if found then
      v_report := v_report || jsonb_build_object('trust_level', v_score.value);
    end if;
  end if;

  -- Summaries only. Individual transactions, customers and staff never
  -- leave the business, at any scope (INS-006).
  if 'revenue_summary' = any(v_fields) then
    -- From the financial facts (0106): revenue earned, and what was taken
    -- back kept apart: refunds (money given back, reversals, returns) and
    -- credits (credit notes, no money moved). Negative, as before.
    select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) into v_revenue
    from (
      select to_char(financial_event_period(reported_period, occurred_at), 'YYYY-MM') as month,
             coalesce(sum(amount) filter (where kind = 'revenue_earned'), 0) as revenue,
             -coalesce(sum(amount) filter (where kind in ('revenue_refunded', 'sale_reversed', 'goods_returned')), 0) as refunds,
             -coalesce(sum(amount) filter (where kind = 'credit_given'), 0) as credits
      from financial_event
      where business_id = v_share.business_id
        and occurred_at::date between v_from and v_to
        and basis = 'earned'
      group by 1 order by 1
    ) m;
    v_report := v_report || jsonb_build_object('revenue_summary', v_revenue);
  end if;

  if 'document_summary' = any(v_fields) then
    select jsonb_build_object(
      'issued', count(*) filter (where number is not null),
      'paid', count(*) filter (where status = 'paid'),
      'overdue', count(*) filter (where status = 'overdue')
    ) into v_docs
    from document
    where business_id = v_share.business_id
      and created_at::date between v_from and v_to;
    v_report := v_report || jsonb_build_object('document_summary', v_docs);
  end if;

  if 'activity_summary' = any(v_fields) then
    select jsonb_build_object(
      'pos_sales', (select count(*) from sale
        where business_id = v_share.business_id
          and business_date between v_from and v_to and status = 'completed'),
      'shop_orders_fulfilled', (select count(*) from shop_order
        where business_id = v_share.business_id
          and status = 'fulfilled' and placed_at::date between v_from and v_to),
      'services_completed', (select count(*) from service_booking
        where business_id = v_share.business_id
          and status = 'completed' and scheduled_start::date between v_from and v_to)
    ) into v_activity;
    v_report := v_report || jsonb_build_object('activity_summary', v_activity);
  end if;

  -- Limitations travel with the data, so they cannot be dropped by a
  -- partner's own rendering (INS-009, SCR-014, INS-008).
  return jsonb_build_object(
    'report', v_report,
    'scope', jsonb_build_object(
      'authorized_fields', v_share.authorized_fields,
      'period_from', v_from,
      'period_to', v_to,
      'granted_at', v_share.granted_at,
      'expires_at', v_share.expires_at,
      'purpose', v_share.purpose
    ),
    'limitations', jsonb_build_array(
      'Ascend evidence is one input into your own independent decision. It is not an offer, an approval, or a recommendation to lend.',
      'This report covers only the fields and period the business authorised. Absence of a field means it was not shared, not that the activity did not occur.',
      'Evidence confidence describes how much of the record comes from verified sources rather than the business''s own declaration. Read it alongside any score.',
      'Programme monitoring and credit decision-making are different purposes. This report supports the purpose stated in its scope.'
    )
  );
end;
$$;

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
  -- From the commerce core (0106): invoices past their due date with
  -- something still owed. A credited or refunded invoice owes nothing.
  select count(*), coalesce(sum(outstanding), 0)
  into v_overdue_count, v_overdue_total
  from receivables_aging(p_business)
  where origin_type = 'document'
    and bucket in ('1_30', '31_60', '61_90', 'over_90');

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

create or replace view business_revenue as
select e.business_id,
       e.occurred_at::date as business_date,
       sum(e.amount) filter (where e.kind = 'revenue_earned') as revenue,
       -sum(e.amount) filter (where e.kind in ('revenue_refunded', 'sale_reversed', 'goods_returned', 'credit_given')) as refunds,
       -sum(e.amount) filter (where e.kind in ('expense', 'till_expense')) as expenses,
       coalesce(sum(e.amount) filter (where e.kind = 'revenue_earned'), 0)
         - coalesce(sum(e.amount) filter (where e.kind in ('revenue_refunded', 'sale_reversed', 'goods_returned', 'credit_given')), 0) as net_revenue
  from financial_event e
 group by e.business_id, e.occurred_at::date;
revoke all on business_revenue from anon, authenticated;

-- The old books: nothing new is written to them.
create or replace function old_books_retired()
returns trigger language plpgsql as $fn$
begin
  -- Retired by 0106: financial_event and the commerce core hold these facts.
  return null;
end
$fn$;

drop trigger if exists ledger_entry_retired on ledger_entry;
create trigger ledger_entry_retired before insert on ledger_entry
  for each row execute function old_books_retired();
drop trigger if exists receivable_retired on receivable;
create trigger receivable_retired before insert on receivable
  for each row execute function old_books_retired();
