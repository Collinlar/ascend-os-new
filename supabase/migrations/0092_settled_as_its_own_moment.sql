-- ---------------------------------------------------------------------------
-- 0092  Phase 3: settled as its own moment
--
-- Paid and settled are different moments (Payments spec; FOUNDATION_ALIGNMENT
-- Phase 3). A customer pays; later the provider pays the money out to the
-- merchant, less its fee. Ascend had the tables for the second moment
-- (settlement and settlement_line, 0029) but nothing filled them, the
-- function that does dropped lines it could not match without a word, and
-- the commerce core could not say "paid, not yet in your account".
--
-- payment_settlement (view)   every payment's settlement state:
--   in_hand     cash, and Mobile Money or transfers the customer sent
--               straight to the merchant (not provider-confirmed): the money
--               is the merchant's the moment it is recorded
--   awaiting    confirmed by the provider, not yet paid out
--   settled     paid out: when, the provider's fee, and the net
-- Refund payments, and payments not confirmed, are left out.
--
-- transaction_settlement (view)   per commercial transaction: what has been
--   paid, how much of it is in the merchant's hands (in hand or settled),
--   and how much is still with the provider.
--
-- record_settlement (0029) now refuses, rather than drops: the lines must
-- add up to the payout's gross, every line must match a confirmed payment of
-- that business, and no payment can be settled twice. Each refusal names
-- the references concerned. Duplicates of the same payout are still a
-- no-op.
--
-- commerce_reconciliation (0085) gains settlement_differs: a payout whose
-- lines do not add up to it, a settled payment that is not confirmed, and a
-- payment in two payouts.
--
-- Pulling payouts from the provider is not here: how Paystack reports them
-- depends on the arrangement still being agreed (PHASE_3_PAYSTACK_BRIEF.md).
--
-- Tables and columns read: payment (id, business_id, status, verification,
-- method, amount, currency_code, provider_reference, provider_fee,
-- reversal_of, occurred_at), settlement, settlement_line,
-- payment_allocation, payment_obligation, commercial_transaction.
-- ---------------------------------------------------------------------------

create or replace view payment_settlement as
select p.id as payment_id,
       p.business_id,
       p.method,
       p.verification,
       p.amount,
       p.currency_code,
       case
         when p.verification <> 'provider_confirmed' then 'in_hand'
         when sl.payment_id is not null then 'settled'
         else 'awaiting'
       end as state,
       case
         when p.verification <> 'provider_confirmed' then p.occurred_at
         else s.settled_at
       end as settled_at,
       coalesce(sl.fee, case when p.verification = 'provider_confirmed' then p.provider_fee end, 0)::numeric(14,2) as fee,
       case
         when p.verification <> 'provider_confirmed' then p.amount
         when sl.payment_id is not null then (sl.amount - coalesce(sl.fee, 0))
       end::numeric(14,2) as net,
       s.id as settlement_id
  from payment p
  left join settlement_line sl on sl.payment_id = p.id
  left join settlement s on s.id = sl.settlement_id
 where p.status = 'confirmed'
   and p.reversal_of is null
   and p.amount > 0
   and p.method <> 'credit';
revoke all on payment_settlement from anon, authenticated;

-- Per transaction: paid, and how much of it has reached the merchant.
create or replace view transaction_settlement as
select o.transaction_id,
       o.business_id,
       coalesce(sum(a.amount), 0)::numeric(14,2) as paid,
       coalesce(sum(a.amount) filter (where ps.state in ('in_hand', 'settled')), 0)::numeric(14,2) as in_merchant_hands,
       coalesce(sum(a.amount) filter (where ps.state = 'awaiting'), 0)::numeric(14,2) as awaiting_settlement,
       max(ps.settled_at) filter (where ps.state = 'settled') as last_settled_at
  from payment_obligation o
  join payment_allocation a on a.obligation_id = o.id
  join payment_settlement ps on ps.payment_id = a.payment_id
 group by o.transaction_id, o.business_id;
revoke all on transaction_settlement from anon, authenticated;

-- ---------------------------------------------------------------------------
-- record_settlement: refuse, never drop
-- ---------------------------------------------------------------------------
create or replace function record_settlement(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_provider text := coalesce(p->>'provider', 'paystack');
  v_settlement uuid;
  v_existing settlement%rowtype;
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_gross numeric := (p->>'gross_amount')::numeric;
  v_sum numeric;
  v_unmatched text[];
  v_unconfirmed text[];
  v_already text[];
begin
  select * into v_existing from settlement
   where provider = v_provider and provider_reference = p->>'provider_reference';
  if found then
    return jsonb_build_object('settlement_id', v_existing.id, 'duplicate', true);
  end if;

  select coalesce(sum((l->>'amount')::numeric), 0) into v_sum from jsonb_array_elements(v_lines) l;
  if jsonb_array_length(v_lines) > 0 and round(v_sum, 2) <> round(v_gross, 2) then
    raise exception 'settlement_lines_do_not_add_up: lines % against gross %', v_sum, v_gross;
  end if;

  -- Every line must be a payment of this business that is confirmed and
  -- not already settled. Named, so the cause can be found.
  select array_agg(l->>'provider_reference') into v_unmatched
    from jsonb_array_elements(v_lines) l
   where not exists (select 1 from payment pay
                      where pay.provider_reference = l->>'provider_reference' and pay.business_id = v_business);
  if v_unmatched is not null then
    raise exception 'settlement_lines_unmatched: no payment of this business for %', v_unmatched;
  end if;
  select array_agg(l->>'provider_reference') into v_unconfirmed
    from jsonb_array_elements(v_lines) l
    join payment pay on pay.provider_reference = l->>'provider_reference' and pay.business_id = v_business
   where pay.status <> 'confirmed';
  if v_unconfirmed is not null then
    raise exception 'settlement_lines_not_confirmed: %', v_unconfirmed;
  end if;
  select array_agg(l->>'provider_reference') into v_already
    from jsonb_array_elements(v_lines) l
    join payment pay on pay.provider_reference = l->>'provider_reference' and pay.business_id = v_business
    join settlement_line sl on sl.payment_id = pay.id;
  if v_already is not null then
    raise exception 'settlement_lines_already_settled: %', v_already;
  end if;

  insert into settlement (
    business_id, provider, provider_reference,
    gross_amount, fees, net_amount, currency_code, settled_at, bank_reference
  ) values (
    v_business, v_provider, p->>'provider_reference',
    v_gross,
    coalesce((p->>'fees')::numeric, 0),
    (p->>'net_amount')::numeric,
    coalesce(p->>'currency_code', 'GHS'),
    coalesce((p->>'settled_at')::timestamptz, now()),
    p->>'bank_reference'
  )
  returning id into v_settlement;

  insert into settlement_line (settlement_id, payment_id, amount, fee)
  select v_settlement, pay.id, (l->>'amount')::numeric, coalesce((l->>'fee')::numeric, 0)
    from jsonb_array_elements(v_lines) l
    join payment pay on pay.provider_reference = l->>'provider_reference' and pay.business_id = v_business;

  -- The provider's fee against the payment it was taken from (PAY-012).
  update payment pay
     set provider_fee = coalesce((l->>'fee')::numeric, 0)
    from jsonb_array_elements(v_lines) l
   where pay.provider_reference = l->>'provider_reference' and pay.business_id = v_business;

  return jsonb_build_object('settlement_id', v_settlement, 'duplicate', false,
                            'lines', jsonb_array_length(v_lines));
end;
$$;
revoke all on function record_settlement(jsonb) from public, anon, authenticated;
grant execute on function record_settlement(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The reconciliation (0085), with settlement_differs added. Generated from
-- the 0085 definition with one counted edit.
-- ---------------------------------------------------------------------------
create or replace function commerce_reconciliation(p_business uuid default null)
returns table (
  business_id uuid,
  check_name text,
  origin_type text,
  origin_id uuid,
  transaction_id uuid,
  expected text,
  found text
)
language sql stable as $$
with
-- What each product says, in one shape.
product as (
  select s.business_id, 'sale'::text as origin_type, s.id as origin_id, s.status::text as status,
         s.total::numeric as total, s.customer_id, null::text as doc_status
    from sale s where s.reversal_of is null and s.total >= 0
  union all
  select o.business_id, 'shop_order', o.id, o.status::text, o.total, o.customer_id, null from shop_order o
  union all
  select b.business_id, 'service_booking', b.id, b.status::text, coalesce(b.price_quoted, 0), b.customer_id, null from service_booking b
  union all
  select d.business_id, 'document', d.id, d.status::text, coalesce(d.total, 0), d.customer_id, d.status::text
    from document d
   where d.type in ('invoice', 'proforma')
     -- joined to another record's transaction (attached, or a proforma
     -- whose invoice took over) is not a transaction of its own
     and not exists (select 1 from commerce_document_link l where l.document_id = d.id and l.role <> 'origin')
),
pair as (
  select p.*, t.id as tx, t.total as t_total, t.status as t_status, t.product_status as t_product_status,
         t.customer_id as t_customer
    from product p
    left join commercial_transaction t on t.origin_type = p.origin_type and t.origin_id = p.origin_id
   where p_business is null or p.business_id = p_business
),
-- An invoice converted from a proforma, waiting in draft (0083).
waiting as (
  select pr.origin_id from pair pr
   where pr.origin_type = 'document'
     and pr.doc_status in ('draft', 'pending_approval', 'change_requested')
     and pr.t_status is distinct from 'draft'
),
paid as (
  -- What the core says is paid: confirmed allocations less refunds (0085).
  select o.transaction_id,
         coalesce(sum(b.amount_paid), 0)
         - coalesce((select sum(j.amount) from commerce_adjustment j
                      where j.transaction_id = o.transaction_id and j.kind = 'refund' and j.obligation_id is null), 0) as net_paid
    from payment_obligation o
    join obligation_balance b on b.obligation_id = o.id
   group by o.transaction_id
)

-- missing_transaction
select pr.business_id, 'missing_transaction', pr.origin_type, pr.origin_id, null::uuid,
       'a transaction', 'none'
  from pair pr where pr.tx is null

union all
-- orphan_transaction
select t.business_id, 'orphan_transaction', t.origin_type, t.origin_id, t.id, 'its product record', 'gone'
  from commercial_transaction t
 where (p_business is null or t.business_id = p_business)
   and not exists (select 1 from product p where p.origin_type = t.origin_type and p.origin_id = t.origin_id)

union all
-- total_differs
select pr.business_id, 'total_differs', pr.origin_type, pr.origin_id, pr.tx, pr.total::text, pr.t_total::text
  from pair pr
 where pr.tx is not null and pr.total <> pr.t_total
   and pr.origin_id not in (select origin_id from waiting)

union all
-- status_differs
select pr.business_id, 'status_differs', pr.origin_type, pr.origin_id, pr.tx,
       pr.status || ' (' || commerce_effective_status(pr.tx)::text || ')',
       pr.t_product_status || ' (' || pr.t_status::text || ')'
  from pair pr
 where pr.tx is not null
   and (pr.status <> pr.t_product_status or commerce_effective_status(pr.tx) <> pr.t_status)
   and pr.origin_id not in (select origin_id from waiting)

union all
-- customer_differs
select pr.business_id, 'customer_differs', pr.origin_type, pr.origin_id, pr.tx,
       coalesce(pr.customer_id::text, 'none'), coalesce(pr.t_customer::text, 'none')
  from pair pr
 where pr.tx is not null and pr.customer_id is distinct from pr.t_customer

union all
-- lines_differ
select x.business_id, 'lines_differ', x.origin_type, x.origin_id, x.tx,
       x.p_count || ' lines, ' || x.p_sum, x.t_count || ' lines, ' || x.t_sum
  from (
    select pr.business_id, pr.origin_type, pr.origin_id, pr.tx,
           case pr.origin_type
             when 'sale' then (select count(*) from sale_line where sale_id = pr.origin_id)
             when 'shop_order' then (select count(*) from shop_order_line where order_id = pr.origin_id)
             when 'service_booking' then case when pr.status = 'completed' and pr.total > 0 then 1 else 0 end
             when 'document' then (select coalesce(jsonb_array_length(d.lines), 0) from document d where d.id = pr.origin_id)
           end as p_count,
           case pr.origin_type
             when 'sale' then (select coalesce(sum(line_total), 0) from sale_line where sale_id = pr.origin_id)
             when 'shop_order' then (select coalesce(sum(line_total), 0) from shop_order_line where order_id = pr.origin_id)
             when 'service_booking' then case when pr.status = 'completed' and pr.total > 0 then pr.total else 0 end
             when 'document' then (select coalesce(sum((l->>'line_total')::numeric), 0) from document d,
                                     jsonb_array_elements(coalesce(d.lines, '[]'::jsonb)) l where d.id = pr.origin_id)
           end as p_sum,
           (select count(*) from transaction_line tl where tl.transaction_id = pr.tx) as t_count,
           (select coalesce(sum(line_total), 0) from transaction_line tl where tl.transaction_id = pr.tx) as t_sum
      from pair pr
     where pr.tx is not null and pr.origin_id not in (select origin_id from waiting)
  ) x
 where x.p_count <> x.t_count or x.p_sum <> x.t_sum

union all
-- owed_differs
select x.business_id, 'owed_differs', x.origin_type, x.origin_id, x.tx, x.expected::text, x.owed::text
  from (
    select pr.business_id, pr.origin_type, pr.origin_id, pr.tx,
           case
             when pr.origin_type = 'service_booking' and pr.status <> 'completed'
               then (select coalesce(deposit_required, 0) from service_booking where id = pr.origin_id)
             else pr.total
           end as expected,
           (select coalesce(sum(amount_due), 0) from payment_obligation o
             where o.transaction_id = pr.tx and o.status not in ('cancelled', 'written_off')) as owed
      from pair pr
     where pr.tx is not null
       and pr.t_status not in ('draft', 'cancelled', 'reversed')
       and pr.origin_id not in (select origin_id from waiting)
  ) x
 where x.expected <> x.owed

union all
-- payment_not_allocated
select p.business_id, 'payment_not_allocated', 'payment', p.id,
       commerce_transaction_for(p.source_entity_type, p.source_entity_id),
       p.amount::text, coalesce((select sum(a.amount) from payment_allocation a where a.payment_id = p.id), 0)::text
  from payment p
 where (p_business is null or p.business_id = p_business)
   and p.amount > 0 and p.reversal_of is null and p.method <> 'credit'
   and p.status in ('confirmed', 'pending', 'initiated')
   and p.source_entity_type in ('sale', 'shop_order', 'service_booking', 'document')
   and commerce_transaction_for(p.source_entity_type, p.source_entity_id) is not null
   and p.amount <> coalesce((select sum(a.amount) from payment_allocation a where a.payment_id = p.id), 0)

union all
-- payment_unlinked
select p.business_id, 'payment_unlinked', 'payment', p.id, null,
       'a transaction for ' || p.source_entity_type || ' ' || p.source_entity_id, 'none'
  from payment p
 where (p_business is null or p.business_id = p_business)
   and p.amount > 0 and p.reversal_of is null and p.method <> 'credit'
   and p.status in ('confirmed', 'pending', 'initiated')
   and p.source_entity_type in ('sale', 'shop_order', 'service_booking', 'document')
   and commerce_transaction_for(p.source_entity_type, p.source_entity_id) is null

union all
-- paid_differs: an invoice's receivable
select r.business_id, 'paid_differs', 'document', r.source_entity_id, t.id,
       r.amount_paid::text || ' (receivable)', coalesce(pd.net_paid, 0)::text
  from receivable r
  join commercial_transaction t on t.id = commerce_transaction_for('document', r.source_entity_id)
  left join paid pd on pd.transaction_id = t.id
 where (p_business is null or r.business_id = p_business)
   and r.source_entity_type = 'document'
   and r.amount_paid <> coalesce(pd.net_paid, 0)

union all
-- paid_differs: a booking's deposit
select b.business_id, 'paid_differs', 'service_booking', b.id, t.id,
       b.deposit_paid::text || ' (deposit_paid)', coalesce(pd.net_paid, 0)::text
  from service_booking b
  join commercial_transaction t on t.origin_type = 'service_booking' and t.origin_id = b.id
  left join paid pd on pd.transaction_id = t.id
 where (p_business is null or b.business_id = p_business)
   and coalesce(b.deposit_paid, 0) <> coalesce(pd.net_paid, 0)

union all
-- adjustment_missing / adjustment_differs (0085): every refund payment,
-- issued credit note and till reversal has its adjustment, in full.
select x.business_id,
       case when x.recorded = 0 then 'adjustment_missing' else 'adjustment_differs' end,
       x.source_type, x.source_id, x.tx, x.amount::text, x.recorded::text
  from (
    select p.business_id, 'payment'::text as source_type, p.id as source_id,
           commerce_transaction_for('payment', p.reversal_of) as tx, p.amount,
           coalesce((select sum(j.amount) from commerce_adjustment j where j.source_type = 'payment' and j.source_id = p.id), 0) as recorded
      from payment p
     where p.reversal_of is not null and p.status = 'refunded' and p.amount > 0
       and (p_business is null or p.business_id = p_business)
    union all
    select d.business_id, 'document', d.id, l.transaction_id, abs(d.total),
           coalesce((select sum(j.amount) from commerce_adjustment j where j.source_type = 'document' and j.source_id = d.id), 0)
      from document d
      join commerce_document_link l on l.document_id = d.id and l.role = 'credit_note'
     where d.type = 'credit_note' and d.status not in ('draft', 'pending_approval', 'change_requested', 'cancelled')
       and abs(coalesce(d.total, 0)) > 0
       and (p_business is null or d.business_id = p_business)
    union all
    select s.business_id, 'sale', s.id, commerce_transaction_for('sale', s.reversal_of), abs(s.total),
           coalesce((select sum(j.amount) from commerce_adjustment j where j.source_type = 'sale' and j.source_id = s.id), 0)
      from sale s
     where s.reversal_of is not null and abs(s.total) > 0
       and (p_business is null or s.business_id = p_business)
  ) x
 where x.tx is not null and x.amount <> x.recorded

union all
-- settlement_differs (0092): a payout whose lines do not add up to it, a
-- settled payment that is not confirmed, a payment in two payouts.
select s.business_id, 'settlement_differs', 'settlement', s.id, null::uuid,
       s.gross_amount::text || ' (payout)', coalesce(sum(sl.amount), 0)::text || ' (its lines)'
  from settlement s
  left join settlement_line sl on sl.settlement_id = s.id
 where (p_business is null or s.business_id = p_business)
 group by s.id
having exists (select 1 from settlement_line x where x.settlement_id = s.id)
   and round(s.gross_amount, 2) <> round(coalesce(sum(sl.amount), 0), 2)
union all
select pay.business_id, 'settlement_differs', 'payment', pay.id,
       commerce_transaction_for(pay.source_entity_type, pay.source_entity_id),
       'a confirmed payment', pay.status::text || ', yet in a payout'
  from payment pay
  join settlement_line sl on sl.payment_id = pay.id
 where (p_business is null or pay.business_id = p_business)
   and pay.status <> 'confirmed'
union all
select pay.business_id, 'settlement_differs', 'payment', pay.id,
       commerce_transaction_for(pay.source_entity_type, pay.source_entity_id),
       'one payout', count(*)::text || ' payouts'
  from payment pay
  join settlement_line sl on sl.payment_id = pay.id
 where (p_business is null or pay.business_id = p_business)
 group by pay.id
having count(*) > 1
$$;
