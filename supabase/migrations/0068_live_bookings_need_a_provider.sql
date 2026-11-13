-- ---------------------------------------------------------------------------
-- 0068  A booking that holds time must have somebody to hold it for
--
-- The double-booking guarantee from 0018 (service_booking_no_provider_overlap)
-- only covers bookings that have a provider. It says "one provider cannot
-- hold two overlapping confirmed bookings", and a booking with no provider
-- is nobody's, so it overlaps with everything and conflicts with nothing.
--
-- Two doors led to a confirmed booking with no provider:
--   1. book_service accepted a blank provider and confirmed a fixed slot
--      anyway, so a direct call could book a time that was already held or
--      taken.
--   2. advance_booking can move a requested or quoted booking (which are
--      allowed to have no provider yet) to confirmed without checking that
--      anyone has been assigned.
-- Found while testing 0067: the first run of the held-slot check failed
-- because it sent no provider.
--
-- Closing the doors one at a time would leave the next path open, so the
-- rule goes where nothing can skip it: a check constraint. A booking that is
-- confirmed or in progress has a provider, or it does not exist.
-- advance_booking is left alone on purpose. It is only defined in 0018 and
-- the constraint stops it without rewriting it; the route turns the refusal
-- into a plain message.
--
-- book_service is also changed so the customer is told what happened before
-- the database has to refuse. It additionally checks that the provider is an
-- active member of THIS business. Until now any membership id in the request
-- was accepted, including one from a different business.
--
-- Tables and columns touched (checked against the live schema):
--   service_booking: status, assigned_membership_id (+ the columns book_service
--     already writes, unchanged from 0067)
--   business_membership: id, business_id, status
-- No rows violate the new constraint (both existing bookings are cancelled
-- and assigned), so it is added fully validated.
--
-- Everything else in book_service is exactly 0067.
-- ---------------------------------------------------------------------------

alter table service_booking
  add constraint service_booking_live_needs_provider
  check (
    status not in ('confirmed', 'in_progress')
    or assigned_membership_id is not null
  );

-- ---------------------------------------------------------------------------
-- book_service: 0067 plus the provider checks.
-- ---------------------------------------------------------------------------
create or replace function book_service(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_business uuid := (p->>'business_id')::uuid;
  v_start timestamptz := (p->>'scheduled_start')::timestamptz;
  v_member uuid := nullif(p->>'membership_id', '')::uuid;
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

  -- A fixed slot is confirmed on booking; a request waits for the provider
  -- to accept, and a quote-first job waits for a price (SRV-001).
  if v_model = 'fixed_slot' then
    v_status := 'confirmed'::booking_status;
  else
    v_status := 'requested'::booking_status;
  end if;

  -- A provider, if one is named, must be on this business's team.
  if v_member is not null then
    perform 1 from business_membership
    where id = v_member and business_id = v_business and status = 'active';
    if not found then
      raise exception 'provider_not_on_team';
    end if;
  end if;

  -- A booking that holds a time needs someone to hold it for, or the
  -- overlap rule has nothing to compare against.
  if v_status = 'confirmed' and v_member is null then
    raise exception 'provider_required';
  end if;

  -- A deposit booking holds the slot while the customer pays, but only for
  -- a bounded window. release_expired_holds() frees it if the money never
  -- arrives.
  if v_deposit > 0 and v_status = 'confirmed' then
    v_hold_until := now() + make_interval(mins => v_hold_minutes);
  end if;

  -- Same single lookup the storefront uses (0064).
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business,
    'name', p->>'customer_name',
    'phone', p->>'customer_phone',
    'email', p->>'customer_email',
    'created_via', 'services'
  ))->>'customer_id', '')::uuid;

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
      v_member,
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
      -- Someone else took this slot between the customer seeing it and
      -- tapping. Say so plainly rather than failing obscurely.
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

revoke all on function book_service(jsonb) from public, anon, authenticated;
grant execute on function book_service(jsonb) to service_role;
