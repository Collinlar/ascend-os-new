-- ---------------------------------------------------------------------------
-- 0102  Financial Foundation, step F3: receivables aging and cash position
--
-- FINANCIAL_FOUNDATION_PLAN.md 2.3 to 2.5, approved 17 Nov 2026 (decision
-- 6: no profit figure; five separate figures, never added together). Spec 07
-- sections 6 and 8. Adds readers only; nothing shown changes.
--
-- receivables_aging(business)
--   One row per payment obligation still owed, from the commerce core
--   (obligation_balance, 0085), on the same rule as the dashboard and the
--   customer list (commerce_is_committed, 0087): original amount, paid,
--   credited, outstanding, due date, days overdue, aging bucket and status.
--   Buckets: not_yet_due, 1_30, 31_60, 61_90, over_90, and no_due_date for
--   something owed with no date set (a till sale on credit, say). As at
--   today.
--
-- cash_position(business, from, to)
--   Five figures, kept apart (spec section 8):
--     recorded        money the business recorded itself: cash in, other
--                     declared payments (MoMo or card entered at the till,
--                     not confirmed by a provider), cash refunds, till
--                     paid-outs; for the period, from financial_event
--     verified        payments a provider confirmed, less verified refunds
--                     and provider fees; for the period
--     pending         verified payments not yet paid out to the merchant;
--                     as at now (payment_settlement, 0092)
--     receivables     outstanding, overdue, and by bucket; as at now
--     payables        not tracked yet (procurement is future, spec section
--                     7), and said so rather than shown as 0
--   and beside them, Office expenses for the period by category, which are
--   money out whose method Ascend does not record, so they are not taken
--   from any one figure. Notes say what the figures cannot show: expenses
--   with no method, shifts not yet closed or not counting out, payables
--   not tracked. No profit, and no grand total.
--
-- Tables and views read: obligation_balance, payment_obligation,
-- commercial_transaction, commerce_document_link, document (number),
-- customer (display_name), financial_event, payment_settlement, pos_shift
-- (business_id, opened_at, closed_at, status, cash_difference).
-- ---------------------------------------------------------------------------

create or replace function receivables_aging(p_business uuid)
returns table (
  obligation_id uuid, transaction_id uuid, origin_type text, document_number text,
  customer_id uuid, customer_name text, location_id uuid, currency_code text,
  amount_due numeric, amount_paid numeric, amount_credited numeric, outstanding numeric,
  due_date date, days_overdue int, bucket text, status text, earned_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select b.obligation_id, t.id, t.origin_type,
         (select d.number from commerce_document_link l join document d on d.id = l.document_id
           where l.transaction_id = t.id limit 1),
         t.customer_id, c.display_name, t.location_id, b.currency_code,
         b.amount_due, b.amount_paid, b.amount_credited, b.outstanding,
         o.due_date,
         case when o.due_date is null then null else greatest(0, current_date - o.due_date) end::int,
         case
           when o.due_date is null then 'no_due_date'
           when current_date <= o.due_date then 'not_yet_due'
           when current_date - o.due_date <= 30 then '1_30'
           when current_date - o.due_date <= 60 then '31_60'
           when current_date - o.due_date <= 90 then '61_90'
           else 'over_90'
         end,
         b.status, t.earned_at
    from obligation_balance b
    join payment_obligation o on o.id = b.obligation_id
    join commercial_transaction t on t.id = b.transaction_id
    left join customer c on c.id = t.customer_id
   where t.business_id = p_business
     and b.status not in ('cancelled', 'written_off')
     and commerce_is_committed(t.origin_type, t.product_status, t.status)
     and b.outstanding > 0.005
   order by o.due_date nulls last, t.earned_at
$fn$;

create or replace function cash_position(p_business uuid, p_from date default date_trunc('month', current_date)::date,
                                         p_to date default current_date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  r_rec jsonb; r_ver jsonb; r_pend jsonb; r_recv jsonb; r_exp jsonb;
  v_notes jsonb := '[]';
  v_open_shifts int; v_off_shifts int; v_exp_total numeric;
begin
  if not exists (select 1 from business where id = p_business) then return null; end if;

  -- 1. Recorded by the business.
  select jsonb_build_object(
           'cash_in', coalesce(sum(amount) filter (where kind = 'money_received' and method = 'cash'), 0),
           'other_declared_in', coalesce(sum(amount) filter (where kind = 'money_received' and method <> 'cash'
                                                              and verification <> 'payment_verified'), 0),
           'cash_refunds', coalesce(sum(amount) filter (where kind = 'refund_paid' and method = 'cash'), 0),
           'till_paid_outs', coalesce(sum(amount) filter (where kind = 'till_expense'), 0),
           'net_cash', coalesce(sum(amount) filter (where kind = 'money_received' and method = 'cash'), 0)
                     - coalesce(sum(amount) filter (where kind = 'refund_paid' and method = 'cash'), 0)
                     - coalesce(sum(amount) filter (where kind = 'till_expense'), 0))
    into r_rec
    from financial_event
   where business_id = p_business and occurred_at >= v_from and occurred_at < v_to;

  -- 2. Verified by a provider.
  select jsonb_build_object(
           'received', coalesce(sum(amount) filter (where kind = 'money_received' and verification = 'payment_verified'), 0),
           'refunded', coalesce(sum(amount) filter (where kind = 'refund_paid' and verification = 'payment_verified'), 0),
           'fees', coalesce(sum(amount) filter (where kind = 'provider_fee'), 0),
           'reversed', coalesce(sum(amount) filter (where kind = 'payment_reversed'), 0),
           'net', coalesce(sum(amount) filter (where kind = 'money_received' and verification = 'payment_verified'), 0)
                - coalesce(sum(amount) filter (where kind = 'refund_paid' and verification = 'payment_verified'), 0)
                - coalesce(sum(amount) filter (where kind = 'provider_fee'), 0)
                - coalesce(sum(amount) filter (where kind = 'payment_reversed'), 0))
    into r_ver
    from financial_event
   where business_id = p_business and occurred_at >= v_from and occurred_at < v_to;

  -- 3. Waiting to be paid out, as at now.
  select jsonb_build_object('amount', coalesce(sum(amount), 0), 'payments', count(*), 'as_at', now())
    into r_pend
    from payment_settlement where business_id = p_business and state = 'awaiting';

  -- 4. Owed to the business, as at now.
  with aged as (select bucket, outstanding from receivables_aging(p_business)),
  buckets as (select bucket, sum(outstanding) as total from aged group by bucket)
  select jsonb_build_object(
           'outstanding', (select coalesce(sum(outstanding), 0) from aged),
           'count', (select count(*) from aged),
           'overdue', (select coalesce(sum(outstanding), 0) from aged where bucket in ('1_30', '31_60', '61_90', 'over_90')),
           'by_bucket', (select coalesce(jsonb_object_agg(bucket, total), '{}') from buckets),
           'as_at', now())
    into r_recv;

  -- Expenses: money out with no recorded method.
  select coalesce(sum(total), 0),
         jsonb_build_object('total', coalesce(sum(total), 0),
                            'by_category', coalesce(jsonb_object_agg(category, total), '{}'))
    into v_exp_total, r_exp
    from (select category, sum(amount) as total from financial_event
           where business_id = p_business and kind = 'expense'
             and occurred_at >= v_from and occurred_at < v_to
           group by category) e;

  -- What the figures cannot show.
  if v_exp_total > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'expenses_method_not_recorded',
      'say', 'Office expenses are counted beside these figures, because how they were paid is not recorded.');
  end if;
  select count(*) filter (where s.closed_at is null),
         count(*) filter (where s.closed_at is not null and coalesce(s.cash_difference, 0) <> 0)
    into v_open_shifts, v_off_shifts
    from pos_shift s
   where s.business_id = p_business and s.opened_at < v_to and coalesce(s.closed_at, now()) >= v_from;
  if v_open_shifts > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'shifts_open', 'count', v_open_shifts,
      'say', 'Some till shifts are still open, so their cash is not counted yet.');
  end if;
  if v_off_shifts > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'shifts_not_balanced', 'count', v_off_shifts,
      'say', 'Some closed shifts did not count out to what was expected.');
  end if;
  v_notes := v_notes || jsonb_build_object('note', 'payables_not_tracked',
    'say', 'What the business owes its suppliers is not tracked in Ascend yet.');

  return jsonb_build_object(
    'business_id', p_business,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'currency_code', 'GHS',
    'recorded', r_rec,
    'verified', r_ver,
    'pending_settlement', r_pend,
    'receivables', r_recv,
    'payables', jsonb_build_object('tracked', false),
    'expenses', r_exp,
    'notes', v_notes);
end
$fn$;

revoke all on function receivables_aging(uuid) from public, anon, authenticated;
revoke all on function cash_position(uuid, date, date) from public, anon, authenticated;
grant execute on function receivables_aging(uuid) to service_role;
grant execute on function cash_position(uuid, date, date) to service_role;
