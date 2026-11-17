-- ---------------------------------------------------------------------------
-- 0104  Financial Foundation, step F5: the accountant export
--
-- FINANCIAL_FOUNDATION_PLAN.md 2.7, approved 17 Nov 2026. Spec 07 section
-- 13: exports, and room for accounting integrations later. Built from
-- financial_event alone. Adds readers only; nothing shown changes.
--
-- financial_export(business, period)
--   One row per financial fact reported in that month (0103), in date
--   order, in words an accountant reads: the date it happened, the month
--   it is reported in and, when it arrived late, the month it belongs to;
--   what kind of fact it is; earned, cash or transfer; in or out; the
--   amount and the same amount signed (in +, out -; a transfer is not
--   signed, because it is neither); category; a reference a person can
--   find (receipt or invoice number, credit note, provider reference);
--   customer or counterparty; location; how it was paid; how well it is
--   confirmed; and the fact it reverses.
--
-- financial_export_csv(business, period)
--   The same rows as CSV text with a header row, quoted so names with
--   commas or quotes survive. A download screen comes with the Finance
--   product; this is what it will serve.
--
-- Orders and bookings have no number of their own, so their reference is
-- built from their id ("Order 1A2B3C4D"), the same each time.
--
-- Tables and columns read: financial_event, financial_category (key,
-- label), commercial_transaction (origin_type, origin_id), sale
-- (receipt_number), document (number), commerce_adjustment (source_type,
-- source_id), payment (provider_reference), settlement
-- (provider_reference), customer (display_name), location (name).
-- ---------------------------------------------------------------------------

create or replace function financial_reference(p_origin_type text, p_origin_id uuid)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select case p_origin_type
    when 'sale' then (select 'Receipt ' || s.receipt_number from sale s where s.id = p_origin_id)
    when 'document' then (select initcap(replace(d.type::text, '_', ' ')) || ' ' || d.number from document d where d.id = p_origin_id)
    when 'shop_order' then 'Order ' || upper(left(p_origin_id::text, 8))
    when 'service_booking' then 'Booking ' || upper(left(p_origin_id::text, 8))
  end
$fn$;

create or replace function financial_export(p_business uuid, p_period date)
returns table (
  fact_id uuid, happened_on date, reported_period date, belongs_to_period date,
  kind text, kind_label text, basis text, direction text,
  amount numeric, signed_amount numeric, currency_code text,
  category text, category_label text,
  reference text, transaction_reference text,
  customer text, counterparty text, location text, method text,
  verification text, verification_label text, reverses_fact_id uuid, source text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select e.id,
         e.occurred_at::date,
         financial_event_period(e.reported_period, e.occurred_at),
         nullif(e.detail->>'belongs_to_period', '')::date,
         e.kind,
         case e.kind
           when 'revenue_earned' then 'Revenue earned'
           when 'revenue_refunded' then 'Revenue refunded'
           when 'credit_given' then 'Credit note'
           when 'sale_reversed' then 'Sale reversed'
           when 'goods_returned' then 'Goods returned'
           when 'money_received' then 'Money received'
           when 'payment_reversed' then 'Payment reversed'
           when 'refund_paid' then 'Refund paid'
           when 'expense' then 'Expense'
           when 'till_expense' then 'Paid out of the till'
           when 'provider_fee' then 'Provider fee'
           when 'settlement_received' then 'Payout to bank'
           else e.kind end,
         e.basis, e.direction,
         e.amount,
         case when e.basis = 'transfer' then null
              when e.direction = 'in' then e.amount else -e.amount end,
         e.currency_code,
         e.category,
         coalesce((select c.label from financial_category c
                    where c.key = e.category and (c.business_id = e.business_id or c.business_id is null)
                    order by c.business_id nulls last limit 1), e.category),
         -- The fact's own reference.
         case e.source_type
           when 'commercial_transaction' then financial_reference(t.origin_type, t.origin_id)
           when 'commerce_adjustment' then
             (select case j.source_type
                       when 'document' then financial_reference('document', j.source_id)
                       when 'sale' then (select 'Receipt ' || s.receipt_number from sale s where s.id = j.source_id)
                       when 'payment' then (select 'Refund ' || coalesce(p.provider_reference, upper(left(p.id::text, 8)))
                                              from payment p where p.id = j.source_id)
                     end
                from commerce_adjustment j where j.id = e.source_id)
           when 'payment' then (select coalesce(p.provider_reference, 'Payment ' || upper(left(p.id::text, 8)))
                                  from payment p where p.id = e.source_id)
           when 'settlement' then (select 'Payout ' || s.provider_reference from settlement s where s.id = e.source_id)
           when 'expense' then 'Expense ' || upper(left(e.source_id::text, 8))
           when 'till_expense' then 'Till ' || coalesce(e.detail->>'reason', upper(left(e.source_id::text, 8)))
         end,
         financial_reference(t.origin_type, t.origin_id),
         cu.display_name,
         e.counterparty,
         l.name,
         e.method,
         e.verification,
         case e.verification
           when 'merchant_declared' then 'Recorded by the business'
           when 'system_recorded' then 'Recorded by Ascend'
           when 'customer_confirmed' then 'Confirmed by the customer'
           when 'payment_verified' then 'Confirmed by the payment provider'
           when 'institution_verified' then 'Confirmed by an institution'
         end,
         e.reversal_of,
         e.source
    from financial_event e
    left join commercial_transaction t on t.id = e.transaction_id
    left join customer cu on cu.id = e.customer_id
    left join location l on l.id = e.location_id
   where e.business_id = p_business
     and financial_event_period(e.reported_period, e.occurred_at) = date_trunc('month', p_period)::date
   order by e.occurred_at, e.recorded_at, e.id
$fn$;

create or replace function financial_export_csv(p_business uuid, p_period date)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with rows as (
    select string_agg(
             concat_ws(',',
               x.happened_on::text, x.reported_period::text, coalesce(x.belongs_to_period::text, ''),
               '"' || replace(x.kind_label, '"', '""') || '"',
               x.basis, x.direction,
               x.amount::text, coalesce(x.signed_amount::text, ''), x.currency_code,
               '"' || replace(coalesce(x.category_label, ''), '"', '""') || '"',
               '"' || replace(coalesce(x.reference, ''), '"', '""') || '"',
               '"' || replace(coalesce(x.transaction_reference, ''), '"', '""') || '"',
               '"' || replace(coalesce(x.customer, ''), '"', '""') || '"',
               '"' || replace(coalesce(x.counterparty, ''), '"', '""') || '"',
               '"' || replace(coalesce(x.location, ''), '"', '""') || '"',
               coalesce(x.method, ''),
               '"' || replace(coalesce(x.verification_label, ''), '"', '""') || '"',
               x.fact_id::text, coalesce(x.reverses_fact_id::text, '')),
             E'\n' order by x.happened_on, x.fact_id) as body
      from financial_export(p_business, p_period) x
  )
  select 'Date,Reported in,Belongs to,What,Basis,Direction,Amount,Signed amount,Currency,Category,Reference,Sale or invoice,Customer,Counterparty,Location,Paid by,Confirmation,Fact id,Reverses fact'
         || coalesce(E'\n' || body, '')
    from rows
$fn$;

revoke all on function financial_reference(text, uuid) from public, anon, authenticated;
revoke all on function financial_export(uuid, date) from public, anon, authenticated;
revoke all on function financial_export_csv(uuid, date) from public, anon, authenticated;
grant execute on function financial_reference(text, uuid) to service_role;
grant execute on function financial_export(uuid, date) to service_role;
grant execute on function financial_export_csv(uuid, date) to service_role;
