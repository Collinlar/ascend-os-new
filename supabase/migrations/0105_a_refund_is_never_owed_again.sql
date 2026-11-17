-- ---------------------------------------------------------------------------
-- 0105  A refund is never owed again
--
-- Decided by Collins on 17 Nov 2026, from what the F5 check found. Until
-- now the commerce core treated a refund as un-paying a sale: an invoice of
-- GHS 100, paid, then GHS 25 refunded, showed GHS 25 owed again, and the
-- reminders would have chased the customer for money they had just been
-- given back. The financial facts (0100) treat the same refund as revenue
-- given back. Collins chose the second: a refund lowers what the sale is
-- worth, and is never owed again.
--
-- What is owed is now what was due, less what was paid, less what was
-- credited. A refund changes what the business kept, not what the customer
-- owes:
--   obligation_balance.outstanding     due - paid (before refunds) - credited
--   obligation_balance.amount_paid     unchanged: paid, less refunds
--   obligation_balance.amount_refunded new, at the end
--   document_amounts.outstanding       total - paid (before refunds) - credited
--   document_amounts.refunded          new, at the end
--
-- One exception, kept apart: a customer who paid more than was owed and is
-- given the extra back. That is not revenue given back. Such a refund is
-- recorded as kind 'overpayment_refund', taken first from whatever was paid
-- beyond the amount due, and it reduces no revenue, no evidence and no
-- dashboard revenue; it is still money paid out.
--
-- Changed to follow (each generated from its latest definition, edits
-- counted):
--   commerce_refresh_obligations  status from what is owed
--   commerce_apply_refund         splits off the overpayment part
--   document_settlement_status    paid, refunded or credited in full
--   queue_payment_reminders       asks only for what is owed
--   outstanding_receivables       shows only what is owed
--   commerce_dashboard_figures    overpayment refunds are money paid out
--   financial_events_sync         overpayment refunds are not revenue taken back
--   financial_event_reconciliation  the same
--
-- No refund has been made on live, so nothing shown there changes; every
-- transaction and invoice with a refund is refreshed once all the same.
--
-- Tables and columns read: commerce_adjustment (kind, obligation_id,
-- refunded_payment_id, amount), payment_allocation, payment_obligation,
-- payment (status, reversal_of, amount, source_entity_type,
-- source_entity_id), document (total, converted_from, type, status).
-- ---------------------------------------------------------------------------

alter table commerce_adjustment drop constraint if exists commerce_adjustment_kind_check;
alter table commerce_adjustment add constraint commerce_adjustment_kind_check
  check (kind in ('refund', 'credit', 'reversal', 'return', 'overpayment_refund'));
-- One refund can now write two rows against one obligation (the overpaid
-- part and the rest), so the once-only rule includes the kind.
drop index if exists commerce_adjustment_once;
create unique index if not exists commerce_adjustment_once
  on commerce_adjustment (source_type, source_id, coalesce(obligation_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

create or replace view obligation_balance as
select o.id as obligation_id,
       o.business_id,
       o.transaction_id,
       o.kind,
       o.status,
       o.currency_code,
       o.amount_due,
       (x.allocated - x.refunded)::numeric(14,2) as amount_paid,
       greatest(o.amount_due - x.allocated - x.credited, 0)::numeric(14,2) as outstanding,
       x.credited::numeric(14,2) as amount_credited,
       x.refunded::numeric(14,2) as amount_refunded
  from payment_obligation o
  cross join lateral (
    select coalesce((select sum(a.amount) from payment_allocation a join payment p on p.id = a.payment_id
                      where a.obligation_id = o.id and p.status = 'confirmed'), 0) as allocated,
           coalesce((select sum(j.amount) from commerce_adjustment j
                      where j.obligation_id = o.id and j.kind in ('refund', 'overpayment_refund')), 0) as refunded,
           coalesce((select sum(j.amount) from commerce_adjustment j
                      where j.obligation_id = o.id and j.kind = 'credit'), 0) as credited
  ) x;
revoke all on obligation_balance from anon, authenticated;

create or replace function commerce_refresh_obligations(p_tx uuid)
returns void language sql as $$
  update payment_obligation o
     set status = s.next,
         settled_at = case when s.next = 'paid' then coalesce(o.settled_at, now()) end,
         updated_at = now()
    from (select b.obligation_id,
                 case
                   when b.amount_due > 0 and b.outstanding <= 0 then 'paid'
                   when b.outstanding < b.amount_due then 'partially_paid'
                   else 'open'
                 end as next
            from obligation_balance b
           where b.transaction_id = p_tx) s
   where s.obligation_id = o.id
     and o.transaction_id = p_tx
     and o.status not in ('cancelled', 'written_off')
     and o.status is distinct from s.next
$$;

create or replace function commerce_apply_refund(p_payment uuid)
returns void language plpgsql as $$
declare
  rf payment%rowtype;
  v_tx uuid;
  v_reason text;
  v_actor uuid;
  v_left numeric;
  v_take numeric;
  v_over numeric;
  r record;
begin
  select * into rf from payment where id = p_payment;
  if not found or rf.reversal_of is null or rf.status <> 'refunded' or rf.amount <= 0 then return; end if;
  if exists (select 1 from commerce_adjustment where source_type = 'payment' and source_id = rf.id) then return; end if;
  v_tx := commerce_transaction_for('payment', rf.reversal_of);
  if v_tx is null then return; end if;

  select nullif(btrim(reason), ''), requested_by into v_reason, v_actor
    from refund_request
   where payment_id = rf.reversal_of and (refund_payment_id = rf.id or refund_payment_id is null)
   order by (refund_payment_id = rf.id) desc nulls last, created_at desc
   limit 1;
  v_reason := coalesce(v_reason, 'refund (no reason recorded)');

  -- Against the obligations the original payment paid, most recent first.
  v_left := rf.amount;
  for r in
    select a.obligation_id,
           a.amount - coalesce((select sum(j.amount) from commerce_adjustment j
                                 where j.refunded_payment_id = rf.reversal_of and j.obligation_id = a.obligation_id), 0) as refundable,
           -- Paid beyond what was due, and not yet given back.
           greatest(
             coalesce((select sum(a2.amount) from payment_allocation a2 join payment p2 on p2.id = a2.payment_id
                        where a2.obligation_id = a.obligation_id and p2.status = 'confirmed'), 0)
             - (select o.amount_due from payment_obligation o where o.id = a.obligation_id)
             - coalesce((select sum(j.amount) from commerce_adjustment j
                          where j.obligation_id = a.obligation_id and j.kind = 'overpayment_refund'), 0),
             0) as overpaid
      from payment_allocation a
     where a.payment_id = rf.reversal_of
     order by a.allocated_at desc, a.id desc
  loop
    v_take := least(v_left, greatest(r.refundable, 0));
    if v_take > 0 then
      v_over := least(v_take, r.overpaid);
      if v_over > 0 then
        insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                         actor_membership_id, source_type, source_id, refunded_payment_id, occurred_at)
        values (rf.business_id, v_tx, r.obligation_id, 'overpayment_refund', v_over, v_reason, v_actor, 'payment', rf.id,
                rf.reversal_of, rf.occurred_at);
      end if;
      if v_take - v_over > 0 then
        insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                         actor_membership_id, source_type, source_id, refunded_payment_id, occurred_at)
        values (rf.business_id, v_tx, r.obligation_id, 'refund', v_take - v_over, v_reason, v_actor, 'payment', rf.id,
                rf.reversal_of, rf.occurred_at);
      end if;
      v_left := v_left - v_take;
    end if;
    exit when v_left <= 0;
  end loop;
  if v_left > 0 then
    -- More than the payment paid: kept against the transaction, visible.
    insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                     actor_membership_id, source_type, source_id, refunded_payment_id, occurred_at)
    values (rf.business_id, v_tx, null, 'refund', v_left, v_reason, v_actor, 'payment', rf.id,
            rf.reversal_of, rf.occurred_at);
  end if;
  perform commerce_settle_state(v_tx);
end $$;

drop function if exists document_amounts(uuid);
create function document_amounts(p_document uuid)
returns table (total numeric, paid numeric, credited numeric, outstanding numeric, refunded numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(d.total, 0)::numeric(14,2),
         (x.gross - x.refunded)::numeric(14,2),
         x.credited::numeric(14,2),
         greatest(coalesce(d.total, 0) - x.gross - x.credited, 0)::numeric(14,2),
         x.refunded::numeric(14,2)
    from document d
    cross join lateral (
      select coalesce((select sum(p.amount) filter (where p.status = 'confirmed')
                         from payment p
                        where p.source_entity_type = 'document' and p.source_entity_id = d.id), 0) as gross,
             coalesce((select sum(p.amount) filter (where p.status = 'refunded' and p.reversal_of is not null)
                         from payment p
                        where p.source_entity_type = 'document' and p.source_entity_id = d.id), 0) as refunded,
             coalesce((select sum(abs(coalesce(c.total, 0)))
                         from document c
                        where c.converted_from = d.id and c.type = 'credit_note'
                          and c.status not in ('draft', 'pending_approval', 'change_requested', 'cancelled')), 0) as credited
    ) x
   where d.id = p_document
$fn$;
revoke all on function document_amounts(uuid) from public, anon, authenticated;
grant execute on function document_amounts(uuid) to service_role;

create or replace function document_settlement_status(p_document uuid)
returns document_status
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc document%rowtype;
  a record;
begin
  select * into v_doc from document where id = p_document;
  if not found then return null; end if;
  if v_doc.number is null
     or v_doc.type not in ('invoice', 'proforma')
     or v_doc.status in ('draft', 'pending_approval', 'change_requested', 'cancelled', 'superseded',
                         'rejected', 'expired', 'archived') then
    return v_doc.status;
  end if;
  select * into a from document_amounts(p_document);
  -- Nothing left owed.
  if a.total > 0 and a.outstanding <= 0.005 then
    return case
      when a.paid > 0.005 then 'paid'
      when a.refunded > 0.005 and a.credited < a.total - 0.005 then 'refunded'
      else 'credited' end::document_status;
  end if;
  if a.paid + a.refunded > 0.005 then
    return 'partially_paid';
  end if;
  if v_doc.status in ('paid', 'partially_paid', 'credited', 'refunded') then
    return 'issued';
  end if;
  return v_doc.status;
end
$fn$;
revoke all on function document_settlement_status(uuid) from public, anon, authenticated;
grant execute on function document_settlement_status(uuid) to service_role;

-- queue_payment_reminders (0086): asks only for what is owed.
create or replace function queue_payment_reminders(p_limit int default 50)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_sent int := 0;
  v_skipped int := 0;
  v_any boolean;
  v_result jsonb;
  v_sequence int;
  v_vars jsonb;
  v_message uuid;
begin
  for r in
    select d.id, d.business_id, d.customer_id, d.number, d.total, d.due_date,
           c.display_name, c.phone_e164, c.email,
           coalesce(paid.amount, 0) as paid,
           coalesce(rem.n, 0) as reminders,
           rem.last_sent
    from document d
    join customer c on c.id = d.customer_id
    left join lateral (
      -- Paid less refunded, plus what was credited (0086): the reminder asks
      -- only for what is really still owed.
      select coalesce(d.total, 0) - a.outstanding as amount from document_amounts(d.id) a
    ) paid on true
    left join lateral (
      select count(*)::int as n, max(sent_at) as last_sent
      from document_reminder dr
      where dr.document_id = d.id
    ) rem on true
    where d.type = 'invoice'
      and d.status = 'overdue'
      and (c.phone_e164 is not null or c.email is not null)
      and coalesce(d.total, 0) - coalesce(paid.amount, 0) > 0.005
      and coalesce(rem.n, 0) < 6
      and (rem.last_sent is null or rem.last_sent < now() - interval '7 days')
    order by d.due_date
    limit p_limit
  loop
    v_sequence := r.reminders + 1;
    v_any := false;
    v_message := null;

    v_vars := jsonb_build_object(
      'customer_name', coalesce(r.display_name, 'there'),
      'document_number', coalesce(r.number, ''),
      'amount', to_char(coalesce(r.total, 0) - r.paid, 'FM999,999,990.00'),
      'due_date', to_char(r.due_date, 'DD Mon YYYY'),
      'link', ''
    );

    begin
      if r.phone_e164 is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder',
          'customer_id', r.customer_id,
          'recipient', r.phone_e164,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text,
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := (v_result->>'message_id')::uuid;
        end if;
      end if;

      if r.email is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder.email',
          'customer_id', r.customer_id,
          'recipient', r.email,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text || ':email',
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := coalesce(v_message, (v_result->>'message_id')::uuid);
        end if;
      end if;

      if v_any then
        insert into document_reminder (document_id, business_id, message_id, sequence)
        values (r.id, r.business_id, v_message, v_sequence);
        v_sent := v_sent + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      insert into audit_log (business_id, action, entity_type, entity_id, detail)
      values (r.business_id, 'documents.reminder.failed', 'document', r.id,
              jsonb_build_object('error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('queued', v_sent, 'skipped', v_skipped);
end;
$fn$;

create or replace function outstanding_receivables(p_business uuid)
returns table (
  document_id uuid,
  number text,
  customer_name text,
  customer_phone text,
  total numeric,
  paid numeric,
  outstanding numeric,
  due_date date,
  days_overdue int,
  reminders int,
  status document_status
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.number, c.display_name, c.phone_e164,
         coalesce(d.total, 0),
         coalesce(paid.amount, 0),
         round(coalesce(d.total, 0) - coalesce(paid.amount, 0) - coalesce(paid.credited, 0), 2),
         d.due_date,
         greatest(0, (current_date - d.due_date))::int,
         coalesce(rem.n, 0),
         d.status
  from document d
  left join customer c on c.id = d.customer_id
  left join lateral (
    -- Paid less refunded; credits counted separately (0086).
    select a.paid as amount, a.credited from document_amounts(d.id) a
  ) paid on true
  left join lateral (
    select count(*)::int as n from document_reminder dr where dr.document_id = d.id
  ) rem on true
  where d.business_id = p_business
    and d.type = 'invoice'
    and d.number is not null
    and d.status in ('issued', 'sent', 'delivered', 'viewed', 'partially_paid', 'overdue')
    and coalesce(d.total, 0) - coalesce(paid.amount, 0) - coalesce(paid.credited, 0) > 0.005
  order by d.due_date nulls last;
$fn$;

-- ---------------------------------------------------------------------------
-- Existing invoices and proformas, once.
-- ---------------------------------------------------------------------------
do $$
declare v_changed int;
begin
  with moved as (
    update document d
       set status = document_settlement_status(d.id), updated_at = now()
     where d.type in ('invoice', 'proforma')
       and d.number is not null
       and d.status is distinct from document_settlement_status(d.id)
    returning 1
  )
  select count(*)::int into v_changed from moved;
  raise notice 'documents: % invoices or proformas now read what their payments and credits add up to', v_changed;
end $$;

-- outstanding_receivables (0086): shows only what is owed.
create or replace function outstanding_receivables(p_business uuid)
returns table (
  document_id uuid,
  number text,
  customer_name text,
  customer_phone text,
  total numeric,
  paid numeric,
  outstanding numeric,
  due_date date,
  days_overdue int,
  reminders int,
  status document_status
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.number, c.display_name, c.phone_e164,
         coalesce(d.total, 0),
         coalesce(paid.amount, 0),
         round(coalesce(paid.outstanding, 0), 2),
         d.due_date,
         greatest(0, (current_date - d.due_date))::int,
         coalesce(rem.n, 0),
         d.status
  from document d
  left join customer c on c.id = d.customer_id
  left join lateral (
    -- Paid less refunded; credits counted separately (0086).
    select a.paid as amount, a.credited, a.outstanding from document_amounts(d.id) a
  ) paid on true
  left join lateral (
    select count(*)::int as n from document_reminder dr where dr.document_id = d.id
  ) rem on true
  where d.business_id = p_business
    and d.type = 'invoice'
    and d.number is not null
    and d.status in ('issued', 'sent', 'delivered', 'viewed', 'partially_paid', 'overdue')
    and coalesce(paid.outstanding, 0) > 0.005
  order by d.due_date nulls last;
$fn$;

-- commerce_dashboard_figures (0087): overpayment refunds are money paid out.
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
    round((select amount from received) - (select amount from refunded_today), 2),
    round((select verified from received), 2),
    round((select coalesce(sum(outstanding), 0) from open_owed), 2),
    (select count(distinct customer_id)::int from open_owed where customer_id is not null),
    (select count(*)::int from open_owed where due_date < p_day),
    round((select coalesce(sum(outstanding), 0) from open_owed where due_date < p_day), 2),
    (select max(p_day - due_date)::int from open_owed where due_date < p_day)
$fn$;

-- financial_events_sync (0100): overpayment refunds are not revenue taken back.
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

-- financial_event_reconciliation (0101): the same.
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


-- Every transaction and invoice with a refund, once.
do $$
declare r record; v_n int := 0; v_d int := 0;
begin
  for r in select distinct transaction_id from commerce_adjustment where kind in ('refund', 'overpayment_refund') loop
    perform commerce_settle_state(r.transaction_id);
    v_n := v_n + 1;
  end loop;
  for r in select distinct p.source_entity_id as id from payment p
            where p.source_entity_type = 'document' and p.status = 'refunded' and p.reversal_of is not null loop
    update document set status = document_settlement_status(r.id)
     where id = r.id and status is distinct from document_settlement_status(r.id);
    if found then v_d := v_d + 1; end if;
  end loop;
  raise notice 'refreshed % transactions, % invoices changed status', v_n, v_d;
end $$;
