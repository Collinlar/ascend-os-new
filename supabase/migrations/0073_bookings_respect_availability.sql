-- ---------------------------------------------------------------------------
-- 0073  A booking can only be made for a time that is actually free
--
-- The booking page offers times from available_slots, which knows a
-- provider's working hours, their time off, and the buffer between bookings.
-- book_service knew none of that. It refused only an exact overlap with
-- another confirmed booking (the 0018 constraint), so a request sent straight
-- to the API could book 3am, a Sunday the provider does not work, a day they
-- have off, or a slot that leaves no buffer after the last client.
--
-- THE CHANGE
--   book_service       A confirmed booking is accepted only if its start is
--                      one of the slots available_slots offers for that
--                      provider on that day. One rule, asked of the same
--                      function the page uses. Generated from its latest
--                      definition (0070) with one counted insertion.
--   available_slots    Time off that was declined or cancelled still
--                      blocked bookings: since 0061 time off has a status,
--                      and this function never looked at it, so a refused
--                      leave request still took the provider off the
--                      calendar. Requested time off still blocks, because a
--                      provider's own blocked time is stored as requested
--                      and is never approved. Generated from its latest
--                      definition (0019) with one counted insertion.
--
-- Requests and quote-first bookings are unchanged: they wait for the provider
-- to accept and carry no time promise until then.
--
-- Times are compared in UTC, as available_slots computes them. Ghana is
-- UTC+0 all year. A business in another time zone needs available_slots
-- itself to learn the zone first.
--
-- Tables and columns touched (checked against the live schema):
--   staff_time_off: membership_id, starts_at, ends_at, status
--   service_booking, catalogue_item, staff_availability: as before
-- No column is added. Signatures and return types are unchanged.
-- ---------------------------------------------------------------------------

-- available_slots (latest definition was 0019_availability_management.sql)
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
    and not exists (
      select 1 from staff_time_off t
      where t.membership_id = p_membership_id
        -- Declined and cancelled leave no longer takes anyone off the
        -- calendar (0073). Requested still does: a provider's own blocked
        -- time is stored as requested and never approved.
        and t.status not in ('declined', 'cancelled')
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
end;
$$;

-- book_service (latest definition was 0070_idempotency_keys_per_business.sql)
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
    where completion_detail->>'client_ref' = v_client_ref
      and business_id = v_business;
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

  -- The time must be one the booking page would have offered: inside the
  -- provider's working hours, clear of their time off, and clear of their
  -- other bookings including the buffer between them. Asked of
  -- available_slots itself, so the page and the server cannot disagree
  -- about what is free (0073).
  if v_status = 'confirmed' and not exists (
    select 1
    from available_slots(v_item.id, v_member, (v_start at time zone 'UTC')::date) s
    where s.slot_start = v_start
  ) then
    raise exception 'slot_unavailable';
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
