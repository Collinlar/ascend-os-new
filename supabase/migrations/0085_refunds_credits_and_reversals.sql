-- ---------------------------------------------------------------------------
-- 0085  Phase 2, step 2e: refunds, credits and reversals in the commerce core
--
-- Spec 02 sections 12 and 13: a return, refund or reversal keeps the
-- original transaction and records what changed, why and by whom, never an
-- edit. Until now the core copied a refund payment, a credit note and a
-- sale reversal row but did not say what they did to the money.
--
-- commerce_adjustment   one row per refund, credit note or sale reversal,
--                       against the original transaction (and, for a
--                       refund or credit, the obligation it touched), with
--                       amount, reason and actor. It cannot be edited or
--                       deleted, except through the audited erase_history.
--
-- WHAT EACH ONE DOES
--   refund     money went back to the customer. What is paid on the
--              obligation goes down by the refund, exactly as the product's
--              receivable and deposit_paid already go down.
--   credit     a credit note: what is owed goes down; nothing was paid back.
--   reversal   a till sale reversed. Recorded with the reversal's amount
--              and reason; the original transaction is already reversed.
--
--   obligation_balance now shows amount_paid net of refunds and a new
--   amount_credited column; outstanding is what is due less both.
--
--   A transaction with refunds or credits becomes partially_refunded, or
--   refunded once they reach its total (PHASE_2_PLAN.md section 3). Draft,
--   cancelled, reversed and disputed transactions keep their state.
--   commerce_effective_status(transaction) is that rule, used by the
--   projection and the reconciliation alike.
--
-- RECONCILIATION (0084) also checks now that every refund payment, issued
-- credit note and sale reversal has its adjustment, for the right amount
-- (adjustment_missing, adjustment_differs).
--
-- PRODUCT FIX. After a refund, complete_refund and confirm_payment_intent
-- set an invoice's status from its confirmed payments, which never counted
-- the refund: a refunded invoice stayed "paid". Both now count what was
-- paid less what was refunded, the same figure the receivable holds. The
-- rest of both functions is unchanged (generated from 0070, two edits each
-- counted).
--
-- Existing refunds, credit notes and reversals are recorded once at the end.
--
-- Tables and columns read: payment (id, amount, status, reversal_of,
-- source_entity_type, source_entity_id), payment_allocation, refund_request
-- (payment_id, refund_payment_id, reason, requested_by, created_at),
-- document (id, type, status, total, reason, created_by, issued_at,
-- created_at), sale (id, reversal_of, total, cashier_membership_id,
-- occurred_at), approval_request (kind, source_entity_type,
-- source_entity_id, note, created_at).
-- ---------------------------------------------------------------------------

create table if not exists commerce_adjustment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  transaction_id uuid not null references commercial_transaction(id),
  obligation_id uuid references payment_obligation(id),
  kind text not null check (kind in ('refund', 'credit', 'reversal', 'return')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  actor_membership_id uuid references business_membership(id),
  source_type text not null check (source_type in ('payment', 'document', 'sale')),
  source_id uuid not null,
  refunded_payment_id uuid references payment(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists commerce_adjustment_once
  on commerce_adjustment (source_type, source_id, coalesce(obligation_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists commerce_adjustment_transaction on commerce_adjustment (transaction_id);
create index if not exists commerce_adjustment_obligation on commerce_adjustment (obligation_id) where obligation_id is not null;

create or replace function commerce_adjustment_is_kept()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('ascend.history_erasure', true), '') <> '' then
    return old;
  end if;
  raise exception 'commerce_adjustment_kept: an adjustment is history; record another adjustment instead';
end $$;
drop trigger if exists commerce_adjustment_kept on commerce_adjustment;
create trigger commerce_adjustment_kept before update or delete on commerce_adjustment
  for each row execute function commerce_adjustment_is_kept();

alter table commerce_adjustment enable row level security;
revoke all on commerce_adjustment from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paid, credited and outstanding per obligation
-- ---------------------------------------------------------------------------
create or replace view obligation_balance as
select o.id as obligation_id,
       o.business_id,
       o.transaction_id,
       o.kind,
       o.status,
       o.currency_code,
       o.amount_due,
       (x.allocated - x.refunded)::numeric(14,2) as amount_paid,
       greatest(o.amount_due - (x.allocated - x.refunded) - x.credited, 0)::numeric(14,2) as outstanding,
       x.credited::numeric(14,2) as amount_credited
  from payment_obligation o
  cross join lateral (
    select coalesce((select sum(a.amount) from payment_allocation a join payment p on p.id = a.payment_id
                      where a.obligation_id = o.id and p.status = 'confirmed'), 0) as allocated,
           coalesce((select sum(j.amount) from commerce_adjustment j
                      where j.obligation_id = o.id and j.kind = 'refund'), 0) as refunded,
           coalesce((select sum(j.amount) from commerce_adjustment j
                      where j.obligation_id = o.id and j.kind = 'credit'), 0) as credited
  ) x;
revoke all on obligation_balance from anon, authenticated;

create or replace function commerce_refresh_obligations(p_tx uuid)
returns void language sql as $$
  update payment_obligation o
     set status = case
           when b.amount_paid + b.amount_credited >= o.amount_due and o.amount_due > 0 then 'paid'
           when b.amount_paid + b.amount_credited > 0 then 'partially_paid'
           else 'open' end,
         settled_at = case when b.amount_paid + b.amount_credited >= o.amount_due and o.amount_due > 0
                           then coalesce(o.settled_at, now()) end,
         updated_at = now()
    from obligation_balance b
   where b.obligation_id = o.id
     and o.transaction_id = p_tx
     and o.status not in ('cancelled', 'written_off')
     and o.status is distinct from (case
           when b.amount_paid + b.amount_credited >= o.amount_due and o.amount_due > 0 then 'paid'
           when b.amount_paid + b.amount_credited > 0 then 'partially_paid'
           else 'open' end)
$$;

-- ---------------------------------------------------------------------------
-- The state a transaction is in, adjustments included
-- ---------------------------------------------------------------------------
create or replace function commerce_effective_status(p_tx uuid)
returns commerce_status language plpgsql stable as $$
declare
  v_t commercial_transaction%rowtype;
  v_base commerce_status;
  v_reduced numeric;
begin
  select * into v_t from commercial_transaction where id = p_tx;
  if not found then return null; end if;
  v_base := commerce_status(v_t.origin_type, v_t.product_status);
  if v_base in ('draft', 'cancelled', 'reversed', 'refunded', 'disputed') then
    return v_base;
  end if;
  select coalesce(sum(amount), 0) into v_reduced
    from commerce_adjustment where transaction_id = p_tx and kind in ('refund', 'credit', 'return');
  if v_reduced <= 0 then return v_base; end if;
  if v_t.total > 0 and v_reduced >= v_t.total then return 'refunded'; end if;
  return 'partially_refunded';
end $$;

create or replace function commerce_settle_state(p_tx uuid)
returns void language plpgsql as $$
declare
  v_t commercial_transaction%rowtype;
  v_status commerce_status;
begin
  select * into v_t from commercial_transaction where id = p_tx;
  if not found then return; end if;
  if v_t.status in ('cancelled', 'reversed') then
    perform commerce_close_obligations(p_tx,
      coalesce(v_t.cancellation_reason, 'the ' || v_t.transaction_type || ' was ' || v_t.status::text));
  end if;
  perform commerce_refresh_obligations(p_tx);
  v_status := commerce_effective_status(p_tx);
  if v_status is distinct from v_t.status then
    update commercial_transaction set status = v_status, updated_at = now() where id = p_tx;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recording each kind of adjustment
-- ---------------------------------------------------------------------------

-- A refund payment (complete_refund writes it with reversal_of set).
create or replace function commerce_apply_refund(p_payment uuid)
returns void language plpgsql as $$
declare
  rf payment%rowtype;
  v_tx uuid;
  v_reason text;
  v_actor uuid;
  v_left numeric;
  v_take numeric;
  v_last uuid;
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
                                 where j.refunded_payment_id = rf.reversal_of and j.obligation_id = a.obligation_id), 0) as refundable
      from payment_allocation a
     where a.payment_id = rf.reversal_of
     order by a.allocated_at desc, a.id desc
  loop
    v_last := r.obligation_id;
    v_take := least(v_left, greatest(r.refundable, 0));
    if v_take > 0 then
      insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                       actor_membership_id, source_type, source_id, refunded_payment_id, occurred_at)
      values (rf.business_id, v_tx, r.obligation_id, 'refund', v_take, v_reason, v_actor, 'payment', rf.id,
              rf.reversal_of, rf.occurred_at);
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

-- An issued credit note, against the transaction it joined.
create or replace function commerce_apply_credit(p_doc uuid, p_tx uuid)
returns void language plpgsql as $$
declare
  d document%rowtype;
  v_left numeric;
  v_take numeric;
  v_last uuid;
  r record;
begin
  select * into d from document where id = p_doc;
  if not found or d.type <> 'credit_note' or p_tx is null then return; end if;
  if d.status in ('draft', 'pending_approval', 'change_requested', 'cancelled') then return; end if;
  if abs(coalesce(d.total, 0)) <= 0 then return; end if;
  if exists (select 1 from commerce_adjustment where source_type = 'document' and source_id = d.id) then return; end if;

  v_left := abs(d.total);
  for r in
    select b.obligation_id, b.outstanding
      from obligation_balance b
     where b.transaction_id = p_tx and b.status not in ('cancelled', 'written_off')
     order by (select created_at from payment_obligation where id = b.obligation_id)
  loop
    v_last := r.obligation_id;
    v_take := least(v_left, greatest(r.outstanding, 0));
    if v_take > 0 then
      insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                       actor_membership_id, source_type, source_id, occurred_at)
      values (d.business_id, p_tx, r.obligation_id, 'credit', v_take,
              coalesce(nullif(btrim(d.reason), ''), 'credit note (no reason recorded)'),
              d.created_by, 'document', d.id, coalesce(d.issued_at, d.created_at));
      v_left := v_left - v_take;
    end if;
    exit when v_left <= 0;
  end loop;
  if v_left > 0 then
    -- More than is still owed (a credit on a paid invoice): the customer is
    -- owed it; kept against the transaction.
    insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                     actor_membership_id, source_type, source_id, occurred_at)
    values (d.business_id, p_tx, null, 'credit', v_left,
            coalesce(nullif(btrim(d.reason), ''), 'credit note (no reason recorded)'),
            d.created_by, 'document', d.id, coalesce(d.issued_at, d.created_at));
  end if;
  perform commerce_settle_state(p_tx);
end $$;

-- A till sale reversal row (execute_sale_reversal writes it with
-- reversal_of set and negative amounts).
create or replace function commerce_apply_reversal(p_sale uuid)
returns void language plpgsql as $$
declare
  rv sale%rowtype;
  v_tx uuid;
  v_reason text;
begin
  select * into rv from sale where id = p_sale;
  if not found or rv.reversal_of is null or abs(rv.total) <= 0 then return; end if;
  if exists (select 1 from commerce_adjustment where source_type = 'sale' and source_id = rv.id) then return; end if;
  v_tx := commerce_transaction_for('sale', rv.reversal_of);
  if v_tx is null then return; end if;
  -- An approved refund at the till carries its reason on the approval.
  select nullif(btrim(note), '') into v_reason
    from approval_request
   where kind = 'refund' and source_entity_type = 'sale' and source_entity_id = rv.reversal_of
   order by created_at desc limit 1;
  insert into commerce_adjustment (business_id, transaction_id, obligation_id, kind, amount, reason,
                                   actor_membership_id, source_type, source_id, occurred_at)
  values (rv.business_id, v_tx, null, 'reversal', abs(rv.total),
          coalesce(v_reason, 'reversed at the till (no reason recorded)'),
          rv.cashier_membership_id, 'sale', rv.id, rv.occurred_at);
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- The projection (0083): reversal rows, credit notes and refund payments now
-- record their adjustment. Generated from 0083; edits marked in place.
-- ---------------------------------------------------------------------------
create or replace function commerce_sync_sale(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  s sale%rowtype;
  v_status commerce_status;
  v_tx uuid;
  v_next int;
begin
  select * into s from sale where id = p_id;
  if not found then return; end if;
  -- A reversal row is not a transaction: it is an adjustment on the original.
  if s.reversal_of is not null then
    perform commerce_apply_reversal(s.id);
    return;
  end if;
  if s.total < 0 then return; end if;
  v_status := commerce_status('sale', s.status::text);
  v_tx := commerce_put_transaction(
    s.business_id, s.customer_id, s.location_id, 'pos', 'pos', 'sale', 'sale', s.id, s.currency_code,
    s.subtotal, s.discount_total, s.tax_total, 0, s.total, v_status, s.status::text,
    coalesce(nullif(btrim(s.note), ''), 'cancelled at the till (no reason recorded)'),
    s.cashier_membership_id, s.occurred_at);

  select coalesce(max(line_number), 0) into v_next from transaction_line where transaction_id = v_tx;
  insert into transaction_line (
    business_id, transaction_id, line_number, origin_line_id, item_id, variant_id, description,
    quantity, unit_price, discount, tax, line_total, price_source, price_overridden_by)
  select s.business_id, v_tx, v_next + row_number() over (order by sl.id), sl.id, sl.item_id, sl.variant_id,
         coalesce(sl.description, ci.name), sl.quantity, sl.unit_price, coalesce(sl.discount, 0), coalesce(sl.tax, 0), sl.line_total,
         x.src, case when x.src = 'manual_override' then s.cashier_membership_id end
    from sale_line sl
    left join catalogue_item ci on ci.id = sl.item_id
    left join item_variant iv on iv.id = sl.variant_id
    cross join lateral (select case
        when p_backfill then 'unknown'
        when sl.item_id is null then 'manual_override'
        when sl.unit_price = ci.base_price + coalesce(iv.price_delta, 0) then 'catalogue'
        else 'manual_override' end as src) x
   where sl.sale_id = s.id
     and not exists (select 1 from transaction_line t where t.transaction_id = v_tx and t.origin_line_id = sl.id);

  if v_status <> 'draft' then
    perform commerce_put_obligation(v_tx, 'full', s.total, null);
  end if;
  perform commerce_settle_state(v_tx);
end $$;

create or replace function commerce_sync_document(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  d document%rowtype;
  v_link commerce_document_link%rowtype;
  v_from commerce_document_link%rowtype;
  v_from_type document_type;
  v_tx uuid;
  v_status commerce_status;
  v_existing commercial_transaction%rowtype;
begin
  select * into d from document where id = p_id;
  if not found then return; end if;
  select * into v_link from commerce_document_link where document_id = d.id;

  -- Already linked as something other than the origin: nothing to project.
  if found and v_link.role = 'credit_note' then
    perform commerce_apply_credit(d.id, v_link.transaction_id);
    return;
  end if;
  if found and v_link.role <> 'origin' then return; end if;

  if v_link.document_id is null then
    -- Raised from a sale, order or booking: join that transaction (decision 2).
    if d.source_entity_type in ('sale', 'shop_order', 'service_booking') then
      v_tx := commerce_transaction_for(d.source_entity_type, d.source_entity_id);
      if v_tx is not null then
        perform commerce_link_document(d.id, d.business_id, v_tx,
          case d.type when 'receipt' then 'receipt' when 'credit_note' then 'credit_note' else 'attached' end);
        if d.type = 'credit_note' then perform commerce_apply_credit(d.id, v_tx); end if;
        return;
      end if;
    end if;

    if d.type not in ('invoice', 'proforma') then
      -- Receipts and credit notes join whatever they were raised from.
      v_tx := coalesce(
        commerce_transaction_for('document', d.converted_from),
        commerce_transaction_for(d.source_entity_type, d.source_entity_id),
        commerce_transaction_for('payment', d.payment_id));
      if v_tx is not null and d.type in ('receipt', 'credit_note') then
        perform commerce_link_document(d.id, d.business_id, v_tx, d.type::text);
      end if;
      if v_tx is not null and d.type = 'credit_note' then
        perform commerce_apply_credit(d.id, v_tx);
      end if;
      return;   -- quotations, purchase orders and the rest are not transactions
    end if;

    -- An invoice converted from a proforma takes over its transaction.
    if d.converted_from is not null then
      select * into v_from from commerce_document_link where document_id = d.converted_from;
      select type into v_from_type from document where id = d.converted_from;
      if v_from.role = 'origin' and v_from_type = 'proforma' and d.type = 'invoice' then
        update commercial_transaction
           set origin_id = d.id, transaction_type = 'invoice', updated_at = now()
         where id = v_from.transaction_id;
        perform commerce_link_document(d.converted_from, d.business_id, v_from.transaction_id, 'superseded');
        perform commerce_link_document(d.id, d.business_id, v_from.transaction_id, 'origin');
        -- While the invoice is still a draft, the proforma's terms stand.
        if d.status in ('draft', 'pending_approval', 'change_requested') then return; end if;
      end if;
    end if;
  end if;

  v_status := commerce_status('document', d.status::text);
  select * into v_existing from commercial_transaction where origin_type = 'document' and origin_id = d.id;

  -- Draft lines follow the draft; once issued they are kept.
  if v_existing.id is not null and v_existing.status = 'draft' then
    delete from transaction_line where transaction_id = v_existing.id;
  end if;

  v_tx := commerce_put_transaction(
    d.business_id, d.customer_id, null, 'documents', 'documents', d.type::text, 'document', d.id,
    d.currency_code, coalesce(d.subtotal, d.total), 0, coalesce(d.tax_total, 0), 0, coalesce(d.total, 0),
    v_status, d.status::text,
    coalesce(nullif(btrim(d.reason), ''),
             case d.status when 'rejected' then 'rejected by the customer'
                           when 'expired' then 'expired before it was paid'
                           else 'cancelled in Documents (no reason recorded)' end),
    d.created_by, coalesce(d.issued_at, d.created_at));
  perform commerce_link_document(d.id, d.business_id, v_tx, 'origin');

  if not exists (select 1 from transaction_line where transaction_id = v_tx) then
    insert into transaction_line (business_id, transaction_id, line_number, item_id, variant_id, description,
                                  quantity, unit_price, discount, tax, line_total, price_source)
    select d.business_id, v_tx, l.n, nullif(l.v->>'item_id', '')::uuid, nullif(l.v->>'variant_id', '')::uuid,
           l.v->>'description', (l.v->>'quantity')::numeric, (l.v->>'unit_price')::numeric,
           coalesce(nullif(l.v->>'discount', '')::numeric, 0), coalesce(nullif(l.v->>'tax', '')::numeric, 0),
           (l.v->>'line_total')::numeric, 'document'
      from jsonb_array_elements(coalesce(d.lines, '[]'::jsonb)) with ordinality as l(v, n);
  end if;

  -- Owed once issued.
  if v_status <> 'draft' then
    perform commerce_put_obligation(v_tx, 'full', coalesce(d.total, 0), d.due_date);
  end if;
  perform commerce_settle_state(v_tx);
end $$;

create or replace function commerce_sync_payment(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  pay payment%rowtype;
  v_tx uuid;
  v_t commercial_transaction%rowtype;
  v_left numeric;
  v_take numeric;
  v_last uuid;
  r record;
begin
  select * into pay from payment where id = p_id;
  if not found then return; end if;
  v_tx := commerce_transaction_for(pay.source_entity_type, pay.source_entity_id);
  if v_tx is null then return; end if;

  -- A refund payment is an adjustment on what the original paid.
  if pay.reversal_of is not null and pay.status = 'refunded' then
    perform commerce_apply_refund(pay.id);
    return;
  end if;

  if pay.amount > 0 and pay.reversal_of is null and pay.method <> 'credit'
     and pay.status in ('confirmed', 'pending', 'initiated')
     and not exists (select 1 from payment_allocation where payment_id = pay.id) then
    v_left := pay.amount;
    for r in
      select o.id, o.amount_due - coalesce((
               select sum(a.amount) from payment_allocation a join payment p2 on p2.id = a.payment_id
                where a.obligation_id = o.id and p2.status in ('confirmed', 'pending', 'initiated')), 0) as outstanding
        from payment_obligation o
       where o.transaction_id = v_tx and o.status not in ('cancelled', 'written_off')
       order by (o.kind = 'deposit') desc, o.created_at
    loop
      v_last := r.id;
      v_take := least(v_left, greatest(r.outstanding, 0));
      if v_take > 0 then
        insert into payment_allocation (business_id, payment_id, obligation_id, amount)
        values (pay.business_id, pay.id, r.id, v_take);
        v_left := v_left - v_take;
      end if;
      exit when v_left <= 0;
    end loop;

    if v_left > 0 then
      if v_last is null then
        -- Paid before anything was owed (an advance on a booking, say).
        select * into v_t from commercial_transaction where id = v_tx;
        v_last := commerce_put_obligation(v_tx,
          case when v_t.origin_type = 'service_booking' and v_t.status <> 'completed' then 'deposit' else 'full' end,
          v_left, null);
      end if;
      -- Paid more than was owed: kept against the last obligation, visible
      -- as overpaid rather than lost.
      insert into payment_allocation (business_id, payment_id, obligation_id, amount)
      values (pay.business_id, pay.id, v_last, v_left)
      on conflict (payment_id, obligation_id) do update set amount = payment_allocation.amount + excluded.amount;
    end if;
  end if;
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- complete_refund and confirm_payment_intent (0070), unchanged except that
-- an invoice's status counts what was paid less what was refunded.
-- ---------------------------------------------------------------------------
create or replace function complete_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_request refund_request%rowtype;
  v_original payment%rowtype;
  v_refund_payment uuid;
  v_paid numeric(14,2);
  v_doc document%rowtype;
begin
  select * into v_request from refund_request
  where provider_reference = p->>'provider_reference'
     or id = nullif(p->>'refund_id', '')::uuid
  for update;

  if not found then
    raise exception 'refund_not_found';
  end if;
  if v_request.status = 'completed' then
    return jsonb_build_object('refund_id', v_request.id, 'duplicate', true);
  end if;

  select * into v_original from payment where id = v_request.payment_id;

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider, provider_reference,
    source_entity_type, source_entity_id, reversal_of, occurred_at
  ) values (
    'refund:' || v_request.id::text,
    v_request.business_id, v_original.customer_id, v_original.method,
    'refunded', 'provider_confirmed',
    v_request.amount, v_request.currency_code, v_original.provider,
    p->>'provider_reference',
    v_original.source_entity_type, v_original.source_entity_id,
    v_original.id,
    now()
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_refund_payment;

  if v_refund_payment is null then
    select id into v_refund_payment from payment
    where client_ref = 'refund:' || v_request.id::text
      and business_id = v_request.business_id;
  end if;

  update refund_request
  set status = 'completed',
      provider_reference = coalesce(p->>'provider_reference', provider_reference),
      refund_payment_id = v_refund_payment,
      completed_at = now()
  where id = v_request.id;

  -- Money leaving is a refund, not negative revenue.
  insert into ledger_entry (
    business_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, business_date
  ) values (
    v_request.business_id, 'refund', -1 * v_request.amount, v_request.currency_code,
    'payment', v_refund_payment, current_date
  );

  -- Unwind whatever the original payment settled.
  if v_original.source_entity_type = 'document' then
    update receivable
    set amount_paid = greatest(amount_paid - v_request.amount, 0),
        settled_at = null
    where source_entity_type = 'document'
      and source_entity_id = v_original.source_entity_id;

    select * into v_doc from document where id = v_original.source_entity_id;
    -- Paid less refunded (0085): the refund row is 'refunded', never
    -- 'confirmed', so counting only confirmed payments left a refunded
    -- invoice marked paid.
    select coalesce(sum(amount) filter (where status = 'confirmed'), 0)
         - coalesce(sum(amount) filter (where status = 'refunded' and reversal_of is not null), 0)
    into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_original.source_entity_id;

    update document
    set status = case
          when v_paid <= 0 then 'issued'::document_status
          when v_paid >= coalesce(v_doc.total, 0) then 'paid'::document_status
          else 'partially_paid'::document_status end,
        updated_at = now()
    where id = v_original.source_entity_id;

  elsif v_original.source_entity_type = 'service_booking' then
    update service_booking
    set deposit_paid = greatest(deposit_paid - v_request.amount, 0),
        updated_at = now()
    where id = v_original.source_entity_id;
  end if;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    correction_of, payload, business_date
  ) values (
    'finance.payment.refunded', v_request.business_id, 'system',
    case v_original.source_entity_type
      when 'document' then 'documents'
      when 'shop_order' then 'shop'
      when 'service_booking' then 'services'
      else 'readiness' end,
    'payment', v_refund_payment, v_request.amount, v_request.currency_code,
    'provider_confirmed',
    null,
    jsonb_build_object('refund_of', v_original.id, 'reason', v_request.reason),
    current_date
  );

  return jsonb_build_object(
    'refund_id', v_request.id,
    'refund_payment_id', v_refund_payment,
    'duplicate', false
  );
end;
$$;

create or replace function confirm_payment_intent(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_intent payment_intent%rowtype;
  v_payment uuid;
  v_doc document%rowtype;
  v_paid numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into v_intent
  from payment_intent
  where reference = p->>'reference'
  for update;

  if not found then
    raise exception 'intent_not_found';
  end if;

  if v_intent.status = 'confirmed' then
    return jsonb_build_object(
      'intent_id', v_intent.id,
      'payment_id', v_intent.payment_id,
      'duplicate', true
    );
  end if;

  v_amount := coalesce((p->>'amount')::numeric, v_intent.amount);

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider, provider_reference,
    source_entity_type, source_entity_id, occurred_at
  ) values (
    'intent:' || v_intent.reference,
    v_intent.business_id, v_intent.customer_id,
    coalesce((p->>'method')::payment_method, 'mobile_money'),
    'confirmed', 'provider_confirmed',
    v_amount,
    v_intent.currency_code, v_intent.provider, p->>'provider_reference',
    case v_intent.purpose
      when 'document' then 'document'
      when 'shop_order' then 'shop_order'
      when 'service_booking' then 'service_booking'
      else 'balance_topup'
    end,
    v_intent.source_entity_id,
    coalesce((p->>'paid_at')::timestamptz, now())
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_payment;

  if v_payment is null then
    select id into v_payment from payment
    where client_ref = 'intent:' || v_intent.reference
      and business_id = v_intent.business_id;
  end if;

  update payment_intent
  set status = 'confirmed',
      provider_reference = p->>'provider_reference',
      payment_id = v_payment,
      completed_at = now()
  where id = v_intent.id;

  if v_intent.purpose = 'balance_topup' then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id
    ) values (
      v_intent.business_id, 'top_up', v_amount, v_intent.currency_code,
      'balance.topup', 'payment', v_payment
    );

    insert into ledger_entry (
      business_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_intent.business_id, 'adjustment', v_amount, v_intent.currency_code,
      'payment', v_payment, current_date
    );

  elsif v_intent.purpose = 'document' then
    select * into v_doc from document where id = v_intent.source_entity_id;

    update receivable
    set amount_paid = amount_paid + v_amount,
        settled_at = case
          when amount_paid + v_amount >= amount_due then now() else settled_at end
    where source_entity_type = 'document' and source_entity_id = v_intent.source_entity_id;

    -- Paid less refunded (0085), as in complete_refund.
    select coalesce(sum(amount) filter (where status = 'confirmed'), 0)
         - coalesce(sum(amount) filter (where status = 'refunded' and reversal_of is not null), 0)
    into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_intent.source_entity_id;

    update document
    set status = case when v_paid >= coalesce(v_doc.total, 0) then 'paid'::document_status
                      else 'partially_paid'::document_status end,
        updated_at = now()
    where id = v_intent.source_entity_id;

  elsif v_intent.purpose = 'service_booking' then
    -- The deposit landed: the slot is theirs, and the hold no longer
    -- applies. Revenue waits for completion, as it does for every service.
    update service_booking
    set deposit_paid = deposit_paid + v_amount,
        hold_expires_at = null,
        updated_at = now()
    where id = v_intent.source_entity_id;

  elsif v_intent.purpose = 'shop_order' then
    update shop_order set updated_at = now() where id = v_intent.source_entity_id;
  end if;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_intent.business_id, 'customer_web',
    case v_intent.purpose when 'document' then 'documents'
                          when 'shop_order' then 'shop'
                          when 'service_booking' then 'services'
                          else 'readiness' end,
    'payment', v_payment, v_amount, v_intent.currency_code, 'provider_confirmed',
    jsonb_build_object('purpose', v_intent.purpose, 'provider', v_intent.provider),
    current_date
  );

  return jsonb_build_object('intent_id', v_intent.id, 'payment_id', v_payment, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- erase_history (0083), with commerce_adjustment added to what it may erase.
-- ---------------------------------------------------------------------------
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
    'transaction_line', 'commerce_adjustment'
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

-- ---------------------------------------------------------------------------
-- The reconciliation (0084), with refunds and credits counted and the
-- adjustment checks added.
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
$$;

-- ---------------------------------------------------------------------------
-- Existing refunds, credit notes and reversals, once; then every
-- transaction's state brought up to date. Failures are recorded, not raised.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_fail int := 0; v_done int := 0;
begin
  for r in select 'payment' k, id, business_id from payment where reversal_of is not null order by occurred_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'document' k, id, business_id from document where type = 'credit_note' order by created_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'sale' k, id, business_id from sale where reversal_of is not null order by occurred_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select id from commercial_transaction loop
    perform commerce_settle_state(r.id);
  end loop;
  raise notice 'commerce adjustments: % records read, % could not be recorded (see commerce_projection_error)', v_done, v_fail;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'commerce_effective_status(uuid)',
    'commerce_apply_refund(uuid)',
    'commerce_apply_credit(uuid, uuid)',
    'commerce_apply_reversal(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
