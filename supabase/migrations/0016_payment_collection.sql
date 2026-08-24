-- AscendSME Connected Platform. Migration 0016: payment collection.
-- Ascend owns the payment experience and the reconciliation record while a
-- licensed partner does the regulated processing (§19.1). This is the first
-- path where a payment earns `provider_confirmed` verification: the money
-- was seen by the provider, not merely declared by the merchant (PAY-006).

create type payment_intent_purpose as enum (
  'document', 'shop_order', 'balance_topup'
);
create type payment_intent_status as enum (
  'initiated', 'pending', 'confirmed', 'failed', 'abandoned'
);

-- What we asked the provider to collect, and what came back. Kept separate
-- from `payment` so an abandoned checkout never looks like money received.
create table payment_intent (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,          -- ours, sent to the provider
  business_id uuid not null references business(id),
  customer_id uuid references customer(id),
  purpose payment_intent_purpose not null,
  source_entity_type text,
  source_entity_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'GHS',
  provider text not null default 'paystack',
  provider_reference text,
  status payment_intent_status not null default 'initiated',
  payer_contact text,
  payment_id uuid references payment(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index intent_business_idx on payment_intent(business_id, created_at);
create index intent_source_idx on payment_intent(source_entity_type, source_entity_id);

alter table payment_intent enable row level security;

-- ---------------------------------------------------------------------------
-- confirm_payment_intent: the only path that writes a provider_confirmed
-- payment. Called from the verified webhook, never from a merchant action.
--
-- Idempotent on the provider's own event: providers retry webhooks, and a
-- retry must not credit a merchant twice (PAY-005).
-- ---------------------------------------------------------------------------
create or replace function confirm_payment_intent(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_intent payment_intent%rowtype;
  v_payment uuid;
  v_doc document%rowtype;
  v_paid numeric(14,2);
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

  -- The provider's amount is authoritative. A mismatch is not something to
  -- reconcile silently: record what actually arrived.
  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider, provider_reference,
    source_entity_type, source_entity_id, occurred_at
  ) values (
    'intent:' || v_intent.reference,
    v_intent.business_id, v_intent.customer_id,
    coalesce((p->>'method')::payment_method, 'mobile_money'),
    'confirmed', 'provider_confirmed',
    coalesce((p->>'amount')::numeric, v_intent.amount),
    v_intent.currency_code, v_intent.provider, p->>'provider_reference',
    case v_intent.purpose
      when 'document' then 'document'
      when 'shop_order' then 'shop_order'
      else 'balance_topup'
    end,
    v_intent.source_entity_id,
    coalesce((p->>'paid_at')::timestamptz, now())
  )
  on conflict (client_ref) do nothing
  returning id into v_payment;

  if v_payment is null then
    select id into v_payment from payment
    where client_ref = 'intent:' || v_intent.reference;
  end if;

  update payment_intent
  set status = 'confirmed',
      provider_reference = p->>'provider_reference',
      payment_id = v_payment,
      completed_at = now()
  where id = v_intent.id;

  -- Purpose decides what the money means.
  if v_intent.purpose = 'balance_topup' then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id
    ) values (
      v_intent.business_id, 'top_up',
      coalesce((p->>'amount')::numeric, v_intent.amount), v_intent.currency_code,
      'balance.topup', 'payment', v_payment
    );

  elsif v_intent.purpose = 'document' then
    select * into v_doc from document where id = v_intent.source_entity_id;

    update receivable
    set amount_paid = amount_paid + coalesce((p->>'amount')::numeric, v_intent.amount),
        settled_at = case
          when amount_paid + coalesce((p->>'amount')::numeric, v_intent.amount) >= amount_due
          then now() else settled_at end
    where source_entity_type = 'document' and source_entity_id = v_intent.source_entity_id;

    -- Status moves; the issued content does not (the immutability trigger
    -- from migration 0014 allows exactly this).
    select coalesce(sum(amount), 0) into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_intent.source_entity_id
      and status = 'confirmed';

    update document
    set status = case when v_paid >= coalesce(v_doc.total, 0) then 'paid'::document_status
                      else 'partially_paid'::document_status end,
        updated_at = now()
    where id = v_intent.source_entity_id;

  elsif v_intent.purpose = 'shop_order' then
    update shop_order set updated_at = now() where id = v_intent.source_entity_id;
  end if;

  insert into ledger_entry (
    business_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, business_date
  ) values (
    v_intent.business_id,
    case when v_intent.purpose = 'balance_topup' then 'adjustment' else 'sale_revenue' end,
    coalesce((p->>'amount')::numeric, v_intent.amount), v_intent.currency_code,
    'payment', v_payment, current_date
  );

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_intent.business_id, 'customer_web',
    case v_intent.purpose when 'document' then 'documents'
                          when 'shop_order' then 'shop'
                          else 'readiness' end,
    'payment', v_payment,
    coalesce((p->>'amount')::numeric, v_intent.amount), v_intent.currency_code,
    'provider_confirmed',
    jsonb_build_object('purpose', v_intent.purpose, 'provider', v_intent.provider),
    current_date
  );

  return jsonb_build_object('intent_id', v_intent.id, 'payment_id', v_payment, 'duplicate', false);
end;
$$;

create or replace function fail_payment_intent(p jsonb)
returns void
language sql security definer
as $$
  update payment_intent
  set status = 'failed', completed_at = now(), provider_reference = p->>'provider_reference'
  where reference = p->>'reference' and status <> 'confirmed';
$$;
