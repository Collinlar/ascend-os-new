-- ---------------------------------------------------------------------------
-- 0084  Phase 2, step 2c: the commerce reconciliation
--
-- commerce_reconciliation(business_id or null) lists every place where the
-- commerce core (0082, filled by 0083) disagrees with the products. It
-- reads only; it changes nothing. Zero rows means the core and the products
-- tell the same story. PHASE_2_PLAN.md section 5: it must return zero on
-- live, and keep returning zero for a week of real traffic, before any
-- screen reads from the core (step 2d).
--
-- commerce_reconciliation_summary() counts the differences by check, for a
-- quick look.
--
-- WHAT IT CHECKS, for every till sale (not reversal rows), shop order,
-- booking, and invoice or proforma raised on its own:
--   missing_transaction   a product record with no transaction
--   orphan_transaction    a transaction whose product record is gone
--   total_differs         a different total
--   status_differs        a different product status, or a canonical state
--                         that does not follow commerce_status()
--   customer_differs      a different customer
--   lines_differ          different lines (how many, and what they add to)
--   owed_differs          obligations that do not add up to what is owed:
--                         the total; for a booking not yet completed, its
--                         deposit
-- and for money:
--   payment_not_allocated a payment that should pay something, allocated
--                         for a different amount than it was
--   payment_unlinked      a payment for a sale, order, booking or document
--                         with no transaction to pay
--   paid_differs          what the product says is paid (an invoice's
--                         receivable, a booking's deposit_paid) is not what
--                         the core says: confirmed allocations, less refunds
--                         of those payments
--
-- Not compared: cancelled, reversed and refunded transactions are not held
-- to owing their total (what they owe is settled in step 2e); credit notes
-- reduce nothing yet (also 2e). An invoice converted from a proforma, still
-- in draft, is not compared on status or total: the proforma's terms stand
-- until the invoice is issued (0083).
--
-- Tables read: commercial_transaction, transaction_line, payment_obligation,
-- payment_allocation, commerce_document_link, sale, sale_line, shop_order,
-- shop_order_line, service_booking, document, payment, receivable.
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
  -- Confirmed allocations per transaction, less refunds of those payments.
  select o.transaction_id,
         coalesce(sum(a.amount) filter (where p.status = 'confirmed'), 0)
         - coalesce((select sum(r.amount) from payment r
                      where r.reversal_of in (select a2.payment_id from payment_allocation a2
                                                join payment_obligation o2 on o2.id = a2.obligation_id
                                               where o2.transaction_id = o.transaction_id)
                        and r.status in ('refunded', 'confirmed')), 0) as net_paid
    from payment_obligation o
    left join payment_allocation a on a.obligation_id = o.id
    left join payment p on p.id = a.payment_id
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
       pr.status || ' (' || commerce_status(pr.origin_type, pr.status)::text || ')',
       pr.t_product_status || ' (' || pr.t_status::text || ')'
  from pair pr
 where pr.tx is not null
   and (pr.status <> pr.t_product_status or commerce_status(pr.origin_type, pr.status) <> pr.t_status)
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
       and pr.t_status not in ('draft', 'cancelled', 'reversed', 'refunded', 'partially_refunded')
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
$$;

create or replace function commerce_reconciliation_summary()
returns table (check_name text, differences bigint)
language sql stable as $$
  select check_name, count(*) from commerce_reconciliation(null) group by check_name order by check_name
$$;

revoke all on function commerce_reconciliation(uuid) from public, anon, authenticated;
revoke all on function commerce_reconciliation_summary() from public, anon, authenticated;
grant execute on function commerce_reconciliation(uuid) to service_role;
grant execute on function commerce_reconciliation_summary() to service_role;
