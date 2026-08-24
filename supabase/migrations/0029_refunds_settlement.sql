-- AscendSME Connected Platform. Migration 0029: provider refunds and
-- settlement reconciliation.
--
-- Two gaps closed:
--
--   1. Refunds existed only as a schema shape. A merchant who refunded a
--      customer through Paystack had no way to record it, so the books
--      showed revenue that had gone back out. Refunds now reverse properly
--      and keep their link to the original payment (PAY-008).
--   2. Settlement was unmodelled. A merchant could see money collected but
--      had no way to check it had actually reached their bank, which is the
--      question they care about most (PAY-009, PAY-012).

create type refund_status as enum ('requested', 'pending', 'completed', 'failed');

create table refund_request (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  payment_id uuid not null references payment(id),
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'GHS',
  reason text not null,
  status refund_status not null default 'requested',
  provider_reference text,
  requested_by uuid references business_membership(id),
  refund_payment_id uuid references payment(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index refund_payment_idx on refund_request(payment_id);

-- Settlements are what the provider actually paid into the bank, and which
-- collected payments made up that transfer.
create table settlement (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  provider text not null default 'paystack',
  provider_reference text not null,
  gross_amount numeric(14,2) not null,
  fees numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null,
  currency_code text not null default 'GHS',
  settled_at timestamptz not null,
  bank_reference text,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table settlement_line (
  settlement_id uuid not null references settlement(id),
  payment_id uuid not null references payment(id),
  amount numeric(14,2) not null,
  fee numeric(14,2) not null default 0,
  primary key (settlement_id, payment_id)
);

alter table refund_request enable row level security;
alter table settlement enable row level security;
alter table settlement_line enable row level security;

-- ---------------------------------------------------------------------------
-- request_refund: validates before anything leaves.
--
-- A refund can never exceed what remains refundable on the original
-- payment, however many partial refunds came before it.
-- ---------------------------------------------------------------------------
create or replace function request_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_payment payment%rowtype;
  v_already numeric(14,2);
  v_amount numeric(14,2) := (p->>'amount')::numeric;
  v_request uuid;
begin
  select * into v_payment from payment where id = (p->>'payment_id')::uuid for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'payment_not_refundable';
  end if;

  select coalesce(sum(amount), 0) into v_already
  from refund_request
  where payment_id = v_payment.id and status in ('requested', 'pending', 'completed');

  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if v_already + v_amount > v_payment.amount then
    raise exception 'exceeds_refundable_amount';
  end if;

  insert into refund_request (
    business_id, payment_id, amount, currency_code, reason,
    status, requested_by
  ) values (
    v_payment.business_id, v_payment.id, v_amount, v_payment.currency_code,
    coalesce(p->>'reason', 'refund'), 'requested',
    nullif(p->>'requested_by', '')::uuid
  )
  returning id into v_request;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_payment.business_id, nullif(p->>'requested_by', '')::uuid, 'refund.requested',
    'refund_request', v_request,
    jsonb_build_object('amount', v_amount, 'payment', v_payment.id)
  );

  return jsonb_build_object('refund_id', v_request, 'amount', v_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_refund: called from the verified provider webhook only.
--
-- Writes a reversing payment linked to the original, posts the refund to
-- the ledger, and unwinds the document or receivable that the original
-- payment settled (PAY-008).
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
  on conflict (client_ref) do nothing
  returning id into v_refund_payment;

  if v_refund_payment is null then
    select id into v_refund_payment from payment
    where client_ref = 'refund:' || v_request.id::text;
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
    select coalesce(sum(amount), 0) into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_original.source_entity_id
      and status = 'confirmed';

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

-- ---------------------------------------------------------------------------
-- record_settlement: what actually reached the bank, and from which
-- collections. Idempotent on the provider's own settlement reference.
-- ---------------------------------------------------------------------------
create or replace function record_settlement(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_settlement uuid;
  v_line jsonb;
  v_existing settlement%rowtype;
begin
  select * into v_existing from settlement
  where provider = coalesce(p->>'provider', 'paystack')
    and provider_reference = p->>'provider_reference';
  if found then
    return jsonb_build_object('settlement_id', v_existing.id, 'duplicate', true);
  end if;

  insert into settlement (
    business_id, provider, provider_reference,
    gross_amount, fees, net_amount, currency_code, settled_at, bank_reference
  ) values (
    (p->>'business_id')::uuid,
    coalesce(p->>'provider', 'paystack'),
    p->>'provider_reference',
    (p->>'gross_amount')::numeric,
    coalesce((p->>'fees')::numeric, 0),
    (p->>'net_amount')::numeric,
    coalesce(p->>'currency_code', 'GHS'),
    coalesce((p->>'settled_at')::timestamptz, now()),
    p->>'bank_reference'
  )
  returning id into v_settlement;

  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    insert into settlement_line (settlement_id, payment_id, amount, fee)
    select v_settlement, pay.id,
           (v_line->>'amount')::numeric,
           coalesce((v_line->>'fee')::numeric, 0)
    from payment pay
    where pay.provider_reference = v_line->>'provider_reference'
      and pay.business_id = (p->>'business_id')::uuid
    on conflict do nothing;

    -- Record the provider's fee against the payment it was taken from
    -- (PAY-012), so net proceeds are visible per collection.
    update payment
    set provider_fee = coalesce((v_line->>'fee')::numeric, 0)
    where provider_reference = v_line->>'provider_reference'
      and business_id = (p->>'business_id')::uuid;
  end loop;

  return jsonb_build_object('settlement_id', v_settlement, 'duplicate', false);
end;
$$;

-- Collected but not yet paid out. The question a merchant actually asks:
-- "the app says I took GHS 4,000 this week, so where is it?"
create or replace view unsettled_collections as
select
  pay.business_id,
  pay.currency_code,
  count(*) as payment_count,
  sum(pay.amount) as collected,
  min(pay.occurred_at) as oldest_collection
from payment pay
left join settlement_line sl on sl.payment_id = pay.id
where pay.status = 'confirmed'
  and pay.verification = 'provider_confirmed'
  and sl.payment_id is null
group by pay.business_id, pay.currency_code;
