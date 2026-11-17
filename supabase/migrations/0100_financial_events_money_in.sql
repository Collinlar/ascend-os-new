-- ---------------------------------------------------------------------------
-- 0100  Financial Foundation, step F1: the financial event stream, money in
--
-- FINANCIAL_FOUNDATION_PLAN.md, approved by Collins on 17 Nov 2026 with
-- every recommendation (decision 1: one stream, projected from operations,
-- never written by products). Spec 07 sections 3 to 5.
--
-- financial_event   one row per financial fact, append-only (like the other
--                   history tables, 0072), with the spec's fields: business,
--                   event id, source, source transaction, amount, currency,
--                   direction, kind, category, location, counterparty, when,
--                   verification level and what it reverses.
--
-- Two bases are kept apart, which the old ledger_entry mixes:
--   earned   revenue the business has earned, and what was taken back
--   cash     money that actually moved
--
--   kind               basis   direction  from
--   revenue_earned     earned  in         commercial_transaction, at earned_at
--   revenue_refunded   earned  out        commerce_adjustment kind refund
--   credit_given       earned  out        commerce_adjustment kind credit
--   sale_reversed      earned  out        commerce_adjustment kind reversal
--   goods_returned     earned  out        commerce_adjustment kind return
--   money_received     cash    in         payment confirmed (not a refund row)
--   payment_reversed   cash    out        a confirmed payment later reversed
--   refund_paid        cash    out        refund payment rows (status
--                                         refunded, reversal_of set), and the
--                                         money handed back when a till sale
--                                         is reversed (no payment row exists
--                                         for that; the old ledger booked it
--                                         as a refund too)
--
-- Money out that is not commerce (expenses, till paid-outs, provider fees,
-- settlements) and categories come in F2.
--
-- Verification uses the five-level ladder (0093): cash and anything the
-- merchant entered is merchant_declared; a provider-confirmed payment is
-- payment_verified; revenue from a shop order or booking the customer placed
-- is customer_confirmed.
--
-- reversal_of points at the event a fact takes back: an adjustment at the
-- transaction's revenue_earned, a refund at the money_received it returns.
--
-- Projection: triggers on commercial_transaction, commerce_adjustment and
-- payment call financial_events_sync for the one record. A failure is
-- recorded in commerce_projection_error and never raised, so a sale, an
-- order or a payment can never be blocked by this (as in 0083). Idempotent:
-- (source_type, source_id, kind) is unique.
--
-- financial_event_reconciliation(business or null): every source with its
-- events, every event with its source, and the totals, per business.
--
-- Tables and columns read: commercial_transaction (id, business_id,
-- location_id, customer_id, origin_type, origin_id, originating_product,
-- currency_code, total, earned_at), commerce_adjustment (id, business_id,
-- transaction_id, kind, amount, source_type, source_id, refunded_payment_id,
-- occurred_at), payment (id, business_id, location_id, customer_id, method,
-- status, verification, amount, currency_code, provider, source_entity_type,
-- source_entity_id, reversal_of, occurred_at), payment_allocation
-- (payment_id, obligation_id), payment_obligation (id, transaction_id),
-- sale (id, reversal_of, total).
-- ---------------------------------------------------------------------------

create table if not exists financial_event (
  id uuid primary key default gen_random_uuid(),         -- the event id
  business_id uuid not null references business(id),
  source text not null check (source in ('pos', 'shop', 'services', 'documents', 'payments', 'office', 'inventory', 'procurement')),
  source_type text not null,                               -- commercial_transaction | commerce_adjustment | payment | ...
  source_id uuid not null,
  transaction_id uuid,                                     -- the commercial transaction, when there is one
  kind text not null check (kind in (
    'revenue_earned', 'revenue_refunded', 'credit_given', 'sale_reversed', 'goods_returned',
    'money_received', 'payment_reversed', 'refund_paid')),
  basis text not null check (basis in ('earned', 'cash')),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null,
  category text,
  location_id uuid references location(id),
  customer_id uuid,                                        -- the counterparty, when it is a customer
  counterparty text,                                       -- otherwise a name (a supplier, a provider)
  method text,                                             -- for money that moved: cash, mobile_money, card ...
  verification text not null check (verification in
    ('merchant_declared', 'system_recorded', 'customer_confirmed', 'payment_verified', 'institution_verified')),
  reversal_of uuid references financial_event(id),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  detail jsonb not null default '{}',
  constraint financial_event_once unique (source_type, source_id, kind)
);
create index if not exists financial_event_business_at on financial_event (business_id, occurred_at);
create index if not exists financial_event_transaction on financial_event (transaction_id) where transaction_id is not null;
alter table financial_event enable row level security;
revoke all on financial_event from anon, authenticated;

drop trigger if exists financial_event_append_only on financial_event;
create trigger financial_event_append_only before update or delete on financial_event
  for each row execute function refuse_history_change();

-- erase_history (0085), unchanged except that financial_event joins the
-- protected history tables it can erase from (test data, data protection).
create or replace function erase_history(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_table text := p->>'table';
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_by text := nullif(btrim(coalesce(p->>'requested_by', '')), '');
  v_ids text[];
  v_count int;
  v_scope text;
begin
  if v_table is null or v_table not in (
    'stock_movement', 'ledger_entry', 'balance_entry', 'evidence_record',
    'score_result', 'audit_log', 'report_access_log',
    'transaction_line', 'commerce_adjustment', 'financial_event'
  ) then
    raise exception 'erase_history: not a protected history table: %', coalesce(v_table, '(none)');
  end if;
  if v_business is null then
    raise exception 'erase_history: business_id is required';
  end if;
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'erase_history: say why, in at least 10 characters';
  end if;
  if v_by is null then
    raise exception 'erase_history: requested_by is required';
  end if;

  if jsonb_typeof(p->'ids') = 'array' then
    select array_agg(x) into v_ids from jsonb_array_elements_text(p->'ids') x;
  end if;

  -- Lasts until this transaction ends, and only this function sets it.
  perform set_config('ascend.history_erasure', v_reason, true);

  -- report_access_log has no business_id; it belongs to a business through
  -- the share that was viewed.
  if v_table = 'report_access_log' then
    v_scope := 'share_id in (select id from public.report_share where business_id = $1)';
  else
    v_scope := 'business_id = $1';
  end if;

  if v_ids is null then
    execute format('delete from public.%I where %s', v_table, v_scope)
      using v_business;
  else
    execute format('delete from public.%I where %s and id::text = any($2)', v_table, v_scope)
      using v_business, v_ids;
  end if;
  get diagnostics v_count = row_count;

  perform set_config('ascend.history_erasure', '', true);

  insert into audit_log (business_id, action, entity_type, detail)
  values (
    null, 'history.erased', v_table,
    jsonb_build_object(
      'business_id', v_business,
      'table', v_table,
      'rows', v_count,
      'ids', coalesce(to_jsonb(v_ids), 'null'::jsonb),
      'reason', v_reason,
      'requested_by', v_by
    )
  );

  return jsonb_build_object('table', v_table, 'erased', v_count);
end;
$$;

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
   where (p_business is null or j.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'commerce_adjustment' and j.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Money received: a payment that was confirmed (it may since have been
  -- reversed, refunded or disputed; it was still received), and is not
  -- itself a refund row. Kept once received, whatever happens later.
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

-- Triggers. Never raise: a failure is recorded and the product's write goes on.
create or replace function financial_event_project()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  begin
    perform financial_events_sync(new.business_id, tg_table_name, new.id);
  exception when others then
    insert into commerce_projection_error (origin_type, origin_id, business_id, error)
    values ('financial_event:' || tg_table_name, new.id, new.business_id, sqlerrm);
  end;
  return null;
end
$fn$;

-- Compared old with new rather than "update of earned_at": earned_at is
-- set by another trigger (0087), and a column trigger only fires for
-- columns the statement itself sets.
drop trigger if exists financial_event_from_transaction on commercial_transaction;
drop trigger if exists financial_event_from_transaction_insert on commercial_transaction;
drop trigger if exists financial_event_from_transaction_update on commercial_transaction;
create trigger financial_event_from_transaction_insert
  after insert on commercial_transaction
  for each row when (new.earned_at is not null)
  execute function financial_event_project();
create trigger financial_event_from_transaction_update
  after update on commercial_transaction
  for each row when (old.earned_at is null and new.earned_at is not null)
  execute function financial_event_project();

drop trigger if exists financial_event_from_adjustment on commerce_adjustment;
create trigger financial_event_from_adjustment
  after insert on commerce_adjustment
  for each row execute function financial_event_project();

drop trigger if exists financial_event_from_payment on payment;
drop trigger if exists financial_event_from_payment_insert on payment;
drop trigger if exists financial_event_from_payment_update on payment;
create trigger financial_event_from_payment_insert
  after insert on payment
  for each row execute function financial_event_project();
create trigger financial_event_from_payment_update
  after update on payment
  for each row when (old.status is distinct from new.status)
  execute function financial_event_project();

-- Allocation can arrive after the payment: a payment received before its
-- allocation still records money received, and its transaction is filled
-- from the payment's own source, which is the same transaction.

-- The reconciliation report.
create or replace function financial_event_reconciliation(p_business uuid default null)
returns table (business_id uuid, check_name text, expected numeric, recorded numeric, missing int, extra int)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  tx as (select t.business_id, t.id, t.total from commercial_transaction t
          where t.earned_at is not null and t.total > 0 and (p_business is null or t.business_id = p_business)),
  ev_tx as (select e.business_id, e.source_id, e.amount from financial_event e
             where e.kind = 'revenue_earned' and (p_business is null or e.business_id = p_business)),
  adj as (select j.business_id, j.id, j.amount from commerce_adjustment j
           where p_business is null or j.business_id = p_business),
  ev_adj as (select e.business_id, e.source_id, e.amount from financial_event e
              where e.basis = 'earned' and e.direction = 'out' and (p_business is null or e.business_id = p_business)),
  pin as (select p.business_id, p.id, p.amount from payment p
           where p.reversal_of is null and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
             and (p_business is null or p.business_id = p_business)),
  ev_pin as (select e.business_id, e.source_id, e.amount from financial_event e
              where e.kind = 'money_received' and (p_business is null or e.business_id = p_business)),
  pout as (select p.business_id, p.id, p.amount from payment p
            where p.reversal_of is not null and p.status = 'refunded'
              and (p_business is null or p.business_id = p_business)),
  ev_pout as (select e.business_id, e.source_id, e.amount from financial_event e
               where e.kind = 'refund_paid' and e.source_type = 'payment' and (p_business is null or e.business_id = p_business)),
  checks as (
    select 'revenue earned' as c, s.business_id, s.id, s.total as amt, 'src' as side from tx s
    union all select 'revenue earned', e.business_id, e.source_id, e.amount, 'ev' from ev_tx e
    union all select 'revenue taken back', s.business_id, s.id, s.amount, 'src' from adj s
    union all select 'revenue taken back', e.business_id, e.source_id, e.amount, 'ev' from ev_adj e
    union all select 'money received', s.business_id, s.id, s.amount, 'src' from pin s
    union all select 'money received', e.business_id, e.source_id, e.amount, 'ev' from ev_pin e
    union all select 'refunds paid', s.business_id, s.id, s.amount, 'src' from pout s
    union all select 'refunds paid', e.business_id, e.source_id, e.amount, 'ev' from ev_pout e
  ),
  per_id as (
    select c, business_id, id,
           sum(amt) filter (where side = 'src') as src, sum(amt) filter (where side = 'ev') as ev
      from checks group by 1, 2, 3
  )
  select business_id, c, coalesce(sum(src), 0), coalesce(sum(ev), 0),
         count(*) filter (where ev is null)::int, count(*) filter (where src is null)::int
    from per_id
   group by business_id, c
   order by business_id, c
$fn$;

revoke all on function financial_events_sync(uuid, text, uuid) from public, anon, authenticated;
revoke all on function financial_event_reconciliation(uuid) from public, anon, authenticated;
grant execute on function financial_events_sync(uuid, text, uuid) to service_role;
grant execute on function financial_event_reconciliation(uuid) to service_role;

-- Backfill: everything that has happened.
select financial_events_sync(null, null, null);
