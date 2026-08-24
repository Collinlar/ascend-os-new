-- AscendSME Connected Platform. Migration 0020: booking deposits
-- (SRV-006, PAY-007).
--
-- The hard part is not taking the money, it is the gap between a customer
-- choosing a slot and paying for it. Leave the slot open and two customers
-- pay for the same time. Hold it forever and one abandoned checkout blocks
-- a provider's Saturday indefinitely. So a deposit booking holds the slot
-- with an expiry, and the hold is released automatically if the money does
-- not arrive.

alter type payment_intent_purpose add value if not exists 'service_booking';

alter table service_booking
  add column hold_expires_at timestamptz,
  add column deposit_intent_reference text;

-- Unpaid holds are visible so support and owners can see why a slot looks
-- taken.
create index booking_hold_idx on service_booking(hold_expires_at)
  where hold_expires_at is not null;

-- ---------------------------------------------------------------------------
-- release_expired_holds: returns abandoned slots to the calendar.
--
-- Runs on the relay. Only touches bookings that are still waiting on a
-- deposit: a booking someone actually paid for is never reclaimed.
-- ---------------------------------------------------------------------------
create or replace function release_expired_holds()
returns int
language plpgsql security definer
as $$
declare
  v_released int;
begin
  with expired as (
    update service_booking
    set status = 'cancelled',
        hold_expires_at = null,
        cancellation_reason = 'deposit not paid in time',
        updated_at = now()
    where hold_expires_at is not null
      and hold_expires_at < now()
      and status = 'confirmed'
      and deposit_required is not null
      and deposit_paid < deposit_required
    returning id, business_id, location_id
  )
  insert into event_outbox (
    event_type, business_id, location_id, channel, product_set,
    entity_type, entity_id, payload, business_date
  )
  select
    'services.booking.progressed', e.business_id, e.location_id,
    'system', 'services', 'service_booking', e.id,
    jsonb_build_object('from', 'confirmed', 'to', 'cancelled', 'reason', 'hold_expired'),
    current_date
  from expired e;

  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

-- ---------------------------------------------------------------------------
-- book_service gains deposit handling. A service that asks for a deposit
-- holds the slot for a bounded window; one that does not behaves exactly as
-- before.
-- ---------------------------------------------------------------------------
create or replace function book_service(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_item catalogue_item%rowtype;
  v_business uuid := (p->>'business_id')::uuid;
  v_start timestamptz := (p->>'scheduled_start')::timestamptz;
  v_duration int;
  v_end timestamptz;
  v_customer uuid;
  v_booking uuid;
  v_deposit numeric(14,2);
  v_model booking_model;
  v_status booking_status;
  v_hold_minutes int;
  v_hold_until timestamptz;
  v_existing service_booking%rowtype;
  v_client_ref text := p->>'client_ref';
begin
  if v_client_ref is not null then
    select * into v_existing from service_booking
    where completion_detail->>'client_ref' = v_client_ref;
    if found then
      return jsonb_build_object(
        'booking_id', v_existing.id,
        'status', v_existing.status,
        'scheduled_start', v_existing.scheduled_start,
        'deposit_required', coalesce(v_existing.deposit_required, 0),
        'duplicate', true
      );
    end if;
  end if;

  select * into v_item
  from catalogue_item
  where id = (p->>'item_id')::uuid and business_id = v_business and kind = 'service' and active;
  if not found then
    raise exception 'service_unavailable';
  end if;

  if v_start is null or v_start <= now() then
    raise exception 'slot_in_past';
  end if;

  v_duration := coalesce((v_item.service_attributes->>'duration_minutes')::int, 60);
  v_end := v_start + make_interval(mins => v_duration);
  v_deposit := coalesce((v_item.service_attributes->>'deposit_amount')::numeric, 0);
  v_model := coalesce((v_item.service_attributes->>'booking_model')::booking_model, 'fixed_slot');
  v_hold_minutes := coalesce((v_item.service_attributes->>'hold_minutes')::int, 30);

  if v_model = 'fixed_slot' then
    v_status := 'confirmed'::booking_status;
  else
    v_status := 'requested'::booking_status;
  end if;

  -- A deposit booking holds the slot while the customer pays, but only for
  -- a bounded window.
  if v_deposit > 0 and v_status = 'confirmed' then
    v_hold_until := now() + make_interval(mins => v_hold_minutes);
  end if;

  select id into v_customer
  from customer
  where business_id = v_business and phone_e164 = p->>'customer_phone';

  if v_customer is null then
    insert into customer (business_id, display_name, phone_e164, created_via)
    values (v_business, p->>'customer_name', p->>'customer_phone', 'services')
    returning id into v_customer;
  end if;

  begin
    insert into service_booking (
      business_id, location_id, customer_id, item_id, model, status,
      scheduled_start, scheduled_end, assigned_membership_id,
      service_address, deposit_required, price_quoted, currency_code,
      hold_expires_at, completion_detail
    ) values (
      v_business,
      nullif(p->>'location_id', '')::uuid,
      v_customer,
      v_item.id,
      v_model,
      v_status,
      v_start,
      v_end,
      nullif(p->>'membership_id', '')::uuid,
      p->>'service_address',
      nullif(v_deposit, 0),
      v_item.base_price,
      coalesce(v_item.currency_code, 'GHS'),
      v_hold_until,
      case when v_client_ref is null then '{}'::jsonb
           else jsonb_build_object('client_ref', v_client_ref) end
    )
    returning id into v_booking;
  exception
    when exclusion_violation then
      raise exception 'slot_taken';
  end;

  insert into event_outbox (
    event_type, business_id, location_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date, occurred_at
  ) values (
    'services.booking.requested', v_business,
    nullif(p->>'location_id', '')::uuid,
    'customer_web', 'services',
    'service_booking', v_booking, v_item.base_price,
    coalesce(v_item.currency_code, 'GHS'), 'customer_confirmed',
    jsonb_build_object('model', v_model, 'status', v_status, 'deposit_required', v_deposit),
    current_date, now()
  );

  return jsonb_build_object(
    'booking_id', v_booking,
    'status', v_status,
    'scheduled_start', v_start,
    'deposit_required', v_deposit,
    'hold_expires_at', v_hold_until,
    'duplicate', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_payment_intent learns about bookings: a paid deposit clears the
-- hold and the slot becomes the customer's for good.
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
