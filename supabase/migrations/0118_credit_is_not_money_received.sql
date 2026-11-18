-- ---------------------------------------------------------------------------
-- 0118  A sale on credit is not money received
--
-- Collins, 18 November 2026. When a till sale was paid partly "on credit",
-- financial_events_sync (0105) recorded the credit part as money_received,
-- although no money changed hands. Cash position, the accountant export and
-- the partner report then counted it as cash in. The dashboard already left
-- it out (credit is never allocated to the sale's obligation).
--
-- money_received now leaves out payments with method 'credit'; the money
-- arrives later as a payment of its own and is recorded then. The
-- reconciliation check applies the same rule, so it does not report the
-- difference as missing.
--
-- No correction of history is needed: on 18 November live had no credit
-- payments, so no such event was ever written.
--
-- Regenerated from 0105: financial_events_sync, financial_event_reconciliation.
-- Tables and columns read: as 0105 (payment.method).
-- ---------------------------------------------------------------------------

create or replace function financial_events_sync(p_business uuid default null, p_source_type text default null, p_source_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n int; v_total int := 0;
begin
  -- Revenue earned.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, category, location_id, customer_id, verification, occurred_at, detail)
  select t.business_id, t.originating_product, 'commercial_transaction', t.id, t.id, 'revenue_earned', 'earned', 'in',
         t.total, t.currency_code,
         case t.origin_type when 'sale' then 'sales.till' when 'shop_order' then 'sales.shop'
                            when 'service_booking' then 'sales.services' else 'sales.invoices' end,
         t.location_id, t.customer_id,
         case when t.origin_type in ('shop_order', 'service_booking') then 'customer_confirmed' else 'merchant_declared' end,
         t.earned_at,
         jsonb_build_object('origin_type', t.origin_type, 'origin_id', t.origin_id)
    from commercial_transaction t
   where t.earned_at is not null and t.total > 0
     and (p_business is null or t.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'commercial_transaction' and t.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- What was taken back from earned revenue.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, category, location_id, customer_id, verification, reversal_of,
                               occurred_at, detail)
  select j.business_id, t.originating_product, 'commerce_adjustment', j.id, j.transaction_id,
         case j.kind when 'refund' then 'revenue_refunded' when 'credit' then 'credit_given'
                     when 'reversal' then 'sale_reversed' else 'goods_returned' end,
         'earned', 'out', j.amount, t.currency_code,
         case t.origin_type when 'sale' then 'sales.till' when 'shop_order' then 'sales.shop'
                            when 'service_booking' then 'sales.services' else 'sales.invoices' end,
         t.location_id, t.customer_id,
         case when j.kind = 'refund' and exists (select 1 from payment p where p.id = j.refunded_payment_id
                                                   and p.verification = 'provider_confirmed')
              then 'payment_verified' else 'merchant_declared' end,
         (select e.id from financial_event e where e.source_type = 'commercial_transaction'
             and e.source_id = j.transaction_id and e.kind = 'revenue_earned'),
         j.occurred_at,
         jsonb_build_object('adjustment_kind', j.kind, 'adjustment_source', j.source_type, 'adjustment_source_id', j.source_id)
    from commerce_adjustment j
    join commercial_transaction t on t.id = j.transaction_id
   where j.kind <> 'overpayment_refund'
     and (p_business is null or j.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'commerce_adjustment' and j.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Money received: a payment that was confirmed (it may since have been
  -- reversed, refunded or disputed; it was still received), and is not
  -- itself a refund row. Kept once received, whatever happens later.
  -- A sale "on credit" is a promise to pay, not money, so it is left out
  -- (0118); the money arrives later as a payment of its own.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, location_id, customer_id, counterparty, method, verification,
                               occurred_at, detail)
  select p.business_id,
         case when p.provider is not null and p.verification = 'provider_confirmed' then 'payments'
              else case p.source_entity_type when 'sale' then 'pos' when 'shop_order' then 'shop'
                                             when 'service_booking' then 'services' when 'document' then 'documents'
                                             else 'payments' end end,
         'payment', p.id,
         coalesce((select o.transaction_id from payment_allocation a join payment_obligation o on o.id = a.obligation_id
                    where a.payment_id = p.id limit 1),
                  commerce_transaction_for(p.source_entity_type, p.source_entity_id)),
         'money_received', 'cash', 'in', p.amount, p.currency_code, p.location_id, p.customer_id, p.provider,
         p.method::text,
         case when p.verification = 'provider_confirmed' then 'payment_verified'
              else p.verification::text end,
         p.occurred_at,
         jsonb_build_object('paid_for', p.source_entity_type, 'paid_for_id', p.source_entity_id)
    from payment p
   where p.reversal_of is null
     and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
     and p.method <> 'credit'
     and (p_business is null or p.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'payment' and p.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- A payment once received, later reversed by the provider.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, location_id, customer_id, counterparty, method, verification,
                               reversal_of, occurred_at)
  select e.business_id, e.source, 'payment', p.id, e.transaction_id, 'payment_reversed', 'cash', 'out',
         e.amount, e.currency_code, e.location_id, e.customer_id, e.counterparty, e.method,
         case when p.verification = 'provider_confirmed' then 'payment_verified' else p.verification::text end,
         e.id, now()
    from payment p
    join financial_event e on e.source_type = 'payment' and e.source_id = p.id and e.kind = 'money_received'
   where p.status = 'reversed'
     and (p_business is null or p.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'payment' and p.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Refunds paid: refund payment rows.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, location_id, customer_id, counterparty, method, verification,
                               reversal_of, occurred_at, detail)
  select r.business_id, coalesce(e.source, 'payments'), 'payment', r.id,
         coalesce(e.transaction_id, commerce_transaction_for(r.source_entity_type, r.source_entity_id)),
         'refund_paid', 'cash', 'out', r.amount, r.currency_code, r.location_id, r.customer_id, r.provider,
         r.method::text,
         case when r.verification = 'provider_confirmed' then 'payment_verified' else r.verification::text end,
         e.id, r.occurred_at,
         jsonb_build_object('refund_of_payment', r.reversal_of)
    from payment r
    left join financial_event e on e.source_type = 'payment' and e.source_id = r.reversal_of and e.kind = 'money_received'
   where r.reversal_of is not null and r.status = 'refunded'
     and (p_business is null or r.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'payment' and r.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Refunds paid: money handed back when a till sale is reversed. No
  -- payment row records it, so it is worked out from what the original sale
  -- was paid with, never more than the reversal, and never from a sale
  -- that was on credit.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, location_id, customer_id, method, verification, reversal_of,
                               occurred_at, detail)
  select j.business_id, 'pos', 'commerce_adjustment', j.id, j.transaction_id, 'refund_paid', 'cash', 'out',
         least(j.amount, paid.amount), t.currency_code, t.location_id, t.customer_id, paid.method, 'merchant_declared',
         (select e.id from financial_event e where e.source_type = 'payment' and e.source_id = paid.payment_id
             and e.kind = 'money_received'),
         j.occurred_at,
         jsonb_build_object('reversed_sale', s.reversal_of, 'worked_out_from', 'the original sale''s payments')
    from commerce_adjustment j
    join commercial_transaction t on t.id = j.transaction_id
    join sale s on s.id = j.source_id
    cross join lateral (
      select sum(p.amount) as amount,
             case when count(distinct p.method) = 1 then min(p.method::text) else 'mixed' end as method,
             (array_agg(p.id order by p.amount desc))[1] as payment_id
        from payment p
       where p.source_entity_type = 'sale' and p.source_entity_id = s.reversal_of
         and p.status = 'confirmed' and p.reversal_of is null
         and p.method not in ('credit', 'balance')
    ) paid
   where j.kind = 'reversal' and j.source_type = 'sale'
     and paid.amount > 0
     and (p_business is null or j.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'commerce_adjustment' and j.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return jsonb_build_object('written', v_total);
end
$fn$;

create or replace function financial_event_reconciliation(p_business uuid default null)
returns table (business_id uuid, check_name text, expected numeric, recorded numeric, missing int, extra int)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  checks as (
    select 'revenue earned' as c, t.business_id, t.id, t.total as amt, 'src' as side
      from commercial_transaction t where t.earned_at is not null and t.total > 0
    union all select 'revenue earned', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'revenue_earned'
    union all select 'revenue taken back', j.business_id, j.id, j.amount, 'src' from commerce_adjustment j
      where j.kind <> 'overpayment_refund'
    union all select 'revenue taken back', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.basis = 'earned' and e.direction = 'out'
    union all select 'money received', p.business_id, p.id, p.amount, 'src' from payment p
      where p.reversal_of is null and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
        and p.method <> 'credit'
    union all select 'money received', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'money_received'
    union all select 'refunds paid', p.business_id, p.id, p.amount, 'src' from payment p
      where p.reversal_of is not null and p.status = 'refunded'
    union all select 'refunds paid', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'refund_paid' and e.source_type = 'payment'
    union all select 'expenses', x.business_id, x.id, x.amount, 'src' from expense x
      left join approval_request a on a.id = x.approval_id
      where x.approval_id is null or a.status = 'approved'
    union all select 'expenses', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'expense'
    union all select 'till paid-outs', t.business_id, t.id, t.amount, 'src' from till_expense t
    union all select 'till paid-outs', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'till_expense'
    union all select 'provider fees', p.business_id, p.id, p.provider_fee, 'src' from payment p
      where coalesce(p.provider_fee, 0) > 0 and p.reversal_of is null
        and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
    union all select 'provider fees', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'provider_fee' and e.source_type = 'payment'
    union all select 'payouts', s.business_id, s.id, s.net_amount, 'src' from settlement s where s.net_amount > 0
    union all select 'payouts', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'settlement_received'
  ),
  per_id as (
    select c, business_id, id,
           sum(amt) filter (where side = 'src') as src, sum(amt) filter (where side = 'ev') as ev
      from checks
     where p_business is null or business_id = p_business
     group by 1, 2, 3
  )
  select business_id, c, coalesce(sum(src), 0), coalesce(sum(ev), 0),
         count(*) filter (where ev is null)::int, count(*) filter (where src is null)::int
    from per_id
   group by business_id, c
   order by business_id, c
$fn$;
