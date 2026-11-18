-- ---------------------------------------------------------------------------
-- 0117  "Money received today" takes off cash handed back at the till
--
-- Collins, 18 November 2026. A till reversal hands the customer's money back,
-- but commerce_dashboard_figures (0105) only took off refund adjustments, so
-- Home kept counting reversed cash as received. The Financial Foundation
-- already records that cash as refund_paid; this applies the same rule
-- (the reversal, capped at what the original sale was paid with, never for a
-- sale on credit or Ascend Balance) to the dashboard's figure.
--
-- Only received_today changes. Regenerated from 0105.
--
-- Tables and columns read (as 0105, plus): sale (id, reversal_of),
-- commerce_adjustment (kind, source_type, source_id, amount, occurred_at),
-- payment (source_entity_type, source_entity_id, status, reversal_of, method,
-- amount).
-- ---------------------------------------------------------------------------

create or replace function commerce_dashboard_figures(p_business uuid, p_day date)
returns table (
  sales_today numeric,
  sale_count int,
  received_today numeric,
  verified_received numeric,
  owed numeric,
  owed_customers int,
  overdue_count int,
  overdue_amount numeric,
  oldest_owed_days int
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with earned as (
    select t.id, t.total
      from commercial_transaction t
     where t.business_id = p_business
       and t.earned_at >= p_day::timestamptz and t.earned_at < (p_day + 1)::timestamptz
       and t.status not in ('draft', 'cancelled', 'reversed')
  ),
  given_back as (
    -- Refunds and credits given that day, on any transaction.
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
     where j.business_id = p_business
       and j.kind in ('refund', 'credit', 'return')
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
  ),
  reversed_today as (
    -- A sale earned earlier and reversed that day comes off that day. One
    -- earned and reversed the same day is simply not counted above.
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
      join commercial_transaction t on t.id = j.transaction_id
     where j.business_id = p_business
       and j.kind = 'reversal'
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
       and t.earned_at < p_day::timestamptz
  ),
  received as (
    select coalesce(sum(a.amount), 0) as amount,
           coalesce(sum(a.amount) filter (where p.verification = 'provider_confirmed'), 0) as verified
      from payment_allocation a
      join payment p on p.id = a.payment_id
     where a.business_id = p_business
       and p.status = 'confirmed'
       and p.occurred_at >= p_day::timestamptz and p.occurred_at < (p_day + 1)::timestamptz
  ),
  refunded_today as (
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
     where j.business_id = p_business
       and j.kind in ('refund', 'overpayment_refund')
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
  ),
  handed_back_today as (
    -- Cash handed back when a till sale is reversed (0117). No payment row
    -- records it, so it is worked out exactly as financial_events_sync does
    -- for refund_paid: from what the original sale was paid with, never
    -- more than the reversal, never for a sale on credit or Ascend Balance.
    select coalesce(sum(least(j.amount, paid.amount)), 0) as amount
      from commerce_adjustment j
      join sale s on s.id = j.source_id
      cross join lateral (
        select coalesce(sum(p.amount), 0) as amount
          from payment p
         where p.source_entity_type = 'sale' and p.source_entity_id = s.reversal_of
           and p.status = 'confirmed' and p.reversal_of is null
           and p.method not in ('credit', 'balance')
      ) paid
     where j.business_id = p_business
       and j.kind = 'reversal' and j.source_type = 'sale'
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
  ),
  open_owed as (
    select t.customer_id, b.outstanding, o.due_date
      from obligation_balance b
      join payment_obligation o on o.id = b.obligation_id
      join commercial_transaction t on t.id = b.transaction_id
     where b.business_id = p_business
       and b.status not in ('cancelled', 'written_off')
       and b.outstanding > 0
       and commerce_is_committed(t.origin_type, t.product_status, t.status)
  )
  select
    round((select coalesce(sum(total), 0) from earned)
          - (select amount from given_back)
          - (select amount from reversed_today), 2),
    (select count(*)::int from earned),
    round((select amount from received) - (select amount from refunded_today)
          - (select amount from handed_back_today), 2),
    round((select verified from received), 2),
    round((select coalesce(sum(outstanding), 0) from open_owed), 2),
    (select count(distinct customer_id)::int from open_owed where customer_id is not null),
    (select count(*)::int from open_owed where due_date < p_day),
    round((select coalesce(sum(outstanding), 0) from open_owed where due_date < p_day), 2),
    (select max(p_day - due_date)::int from open_owed where due_date < p_day)
$fn$;

revoke all on function commerce_dashboard_figures(uuid, date) from public, anon, authenticated;
grant execute on function commerce_dashboard_figures(uuid, date) to service_role;
