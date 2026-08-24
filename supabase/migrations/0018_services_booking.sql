-- AscendSME Connected Platform. Migration 0018: Ascend Services booking.
-- Services sell time, so the scarce resource is a provider's calendar. The
-- correctness requirement that matters most is that two customers can never
-- hold the same provider at the same moment, however simultaneously they
-- tap (SRV-004).

create extension if not exists btree_gist;

-- Service configuration lives on the shared catalogue item rather than a
-- parallel service table (SRV-003, CAP-004).
--   duration_minutes, capacity, deposit_amount, booking_model, buffer_minutes
-- are read from catalogue_item.service_attributes.

alter table service_booking
  add column scheduled_range tstzrange
    generated always as (
      case
        when scheduled_start is not null and scheduled_end is not null
        then tstzrange(scheduled_start, scheduled_end, '[)')
      end
    ) stored,
  add column deposit_paid numeric(14,2) not null default 0,
  add column cancellation_reason text,
  add column no_show_at timestamptz;

-- The guarantee: one provider cannot hold two live bookings that overlap in
-- time. Enforced by the database, so no amount of concurrent traffic,
-- retried requests or future code can create a clash (SRV-004).
alter table service_booking
  add constraint service_booking_no_provider_overlap
  exclude using gist (
    assigned_membership_id with =,
    scheduled_range with &&
  )
  where (
    assigned_membership_id is not null
    and scheduled_range is not null
    and status in ('confirmed', 'in_progress')
  );

create index booking_range_idx on service_booking using gist (scheduled_range);

-- ---------------------------------------------------------------------------
-- available_slots: free start times for a service on a given date.
--
-- Availability is the provider's working window minus what is already
-- booked. Slots in the past are never offered, and a service with a buffer
-- leaves the provider room between jobs.
-- ---------------------------------------------------------------------------
create or replace function available_slots(
  p_item_id uuid,
  p_membership_id uuid,
  p_date date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable
as $$
declare
  v_item catalogue_item%rowtype;
  v_duration int;
  v_buffer int;
  v_step int;
begin
  select * into v_item from catalogue_item where id = p_item_id and kind = 'service';
  if not found then
    return;
  end if;

  v_duration := coalesce((v_item.service_attributes->>'duration_minutes')::int, 60);
  v_buffer := coalesce((v_item.service_attributes->>'buffer_minutes')::int, 0);
  -- Offer starts on a sensible grid rather than every minute.
  v_step := greatest(coalesce((v_item.service_attributes->>'slot_step_minutes')::int, 30), 5);

  return query
  with windows as (
    select
      (p_date + a.start_time) at time zone 'UTC' as win_start,
      (p_date + a.end_time) at time zone 'UTC' as win_end
    from staff_availability a
    where a.membership_id = p_membership_id
      and a.day_of_week = extract(dow from p_date)::int
      and (a.effective_from is null or a.effective_from <= p_date)
      and (a.effective_to is null or a.effective_to >= p_date)
  ),
  candidates as (
    select
      gs as slot_start,
      gs + make_interval(mins => v_duration) as slot_end
    from windows w,
      generate_series(
        w.win_start,
        w.win_end - make_interval(mins => v_duration),
        make_interval(mins => v_step)
      ) as gs
  )
  select c.slot_start, c.slot_end
  from candidates c
  where c.slot_start > now()
    and not exists (
      select 1 from service_booking b
      where b.assigned_membership_id = p_membership_id
        and b.status in ('confirmed', 'in_progress')
        and b.scheduled_range &&
            tstzrange(
              c.slot_start - make_interval(mins => v_buffer),
              c.slot_end + make_interval(mins => v_buffer),
              '[)'
            )
    )
  order by c.slot_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- book_service: one atomic booking.
--
-- The overlap constraint is the real defence against double booking; this
-- function turns the resulting error into an answer the customer can act on
-- rather than a stack trace.
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
  v_existing service_booking%rowtype;
  v_client_ref text := p->>'client_ref';
begin
  if v_client_ref is not null then
    select * into v_existing from service_booking
    where completion_detail->>'client_ref' = v_client_ref;
    if found then
      return jsonb_build_object('booking_id', v_existing.id, 'duplicate', true);
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

  -- A fixed slot is confirmed on booking; a request waits for the provider
  -- to accept, and a quote-first job waits for a price (SRV-001).
  v_status := case v_model
    when 'fixed_slot' then 'confirmed'::booking_status
    when 'quote_first' then 'requested'::booking_status
    else 'requested'::booking_status
  end;

  -- One shared customer record per business and phone (CAP-003).
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
      completion_detail
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
    jsonb_build_object('model', v_model, 'status', v_status),
    current_date, now()
  );

  return jsonb_build_object(
    'booking_id', v_booking,
    'status', v_status,
    'scheduled_start', v_start,
    'deposit_required', v_deposit,
    'duplicate', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- advance_booking: provider-side transitions, with the same
-- "legal graph only" discipline used for Shop orders.
-- ---------------------------------------------------------------------------
create or replace function advance_booking(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_booking service_booking%rowtype;
  v_to booking_status := (p->>'to_status')::booking_status;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_allowed boolean;
  v_event text;
begin
  select * into v_booking from service_booking where id = (p->>'booking_id')::uuid for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  if v_booking.status = v_to then
    return jsonb_build_object('booking_id', v_booking.id, 'status', v_to, 'unchanged', true);
  end if;

  v_allowed := (v_booking.status, v_to) in (
    ('requested', 'quoted'),
    ('requested', 'confirmed'),
    ('requested', 'cancelled'),
    ('quoted', 'confirmed'),
    ('quoted', 'cancelled'),
    ('confirmed', 'in_progress'),
    ('confirmed', 'cancelled'),
    ('confirmed', 'no_show'),
    ('in_progress', 'completed'),
    ('in_progress', 'cancelled')
  );
  if not v_allowed then
    raise exception 'illegal transition: % to %', v_booking.status, v_to;
  end if;

  begin
    update service_booking
    set status = v_to,
        cancellation_reason = case when v_to = 'cancelled' then p->>'reason' else cancellation_reason end,
        no_show_at = case when v_to = 'no_show' then now() else no_show_at end,
        price_quoted = coalesce(nullif(p->>'price_quoted', '')::numeric, price_quoted),
        updated_at = now()
    where id = v_booking.id;
  exception
    when exclusion_violation then
      raise exception 'slot_taken';
  end;

  -- Completion recognises the revenue for the service delivered.
  if v_to = 'completed' then
    insert into ledger_entry (
      business_id, location_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_booking.business_id, v_booking.location_id, 'sale_revenue',
      coalesce(v_booking.price_quoted, 0), v_booking.currency_code,
      'service_booking', v_booking.id, current_date
    );
  end if;

  v_event := case v_to
    when 'confirmed' then 'services.booking.confirmed'
    when 'completed' then 'services.booking.completed'
    when 'no_show' then 'services.booking.no_show'
    else 'services.booking.progressed'
  end;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, payload, business_date
  ) values (
    v_event, v_booking.business_id, v_booking.location_id, v_actor,
    'business_web', 'services', 'service_booking', v_booking.id,
    v_booking.price_quoted, v_booking.currency_code, 'merchant_declared',
    jsonb_build_object('from', v_booking.status, 'to', v_to),
    current_date
  );

  return jsonb_build_object('booking_id', v_booking.id, 'status', v_to, 'unchanged', false);
end;
$$;
