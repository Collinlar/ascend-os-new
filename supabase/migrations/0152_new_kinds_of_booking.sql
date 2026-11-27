-- ---------------------------------------------------------------------------
-- 0152  New kinds of booking (Modules round 4, S3; decisions 2, 3, 4)
--
-- A service is booked one of three ways, set on the service
-- (service_attributes.booking_model, read since 0018):
--
-- 1. fixed_slot, as before, with an optional "also at the customer's home"
--    (service_attributes.home: {enabled, travel_fee, areas}). A home
--    booking arrives as a request the business accepts after checking the
--    address (request_home_booking); the price carries the travel fee.
-- 2. class_session: the owner schedules each class (date, time, place, who
--    teaches, seats) and customers book one or more seats until it is full
--    (schedule_class, cancel_class, class_sessions, book_class_seats).
--    A seat booking holds no one's diary, so it never trips the overlap
--    rule; the class itself is the teacher's time.
-- 3. quote_first: the customer tells the business about the day (occasion,
--    date, people, where, what, up to 3 photos), which reaches Requests
--    (request_quote_booking). The owner answers with a quotation made in
--    Documents from the booking (link_booking_quotation, which marks it
--    quoted), and the customer accepts it on their booking link
--    (accept_booking_quotation), which confirms the booking with a deposit
--    due (service_attributes.deposit_percent, 30 unless set).
--
-- Reads: service_booking (0003, 0018, 0020, 0151), catalogue_item (0002),
-- available_slots (0073), find_or_create_customer (0064), document (0003,
-- 0014), event_outbox (0006), require_permission (0081),
-- business_membership, location.
-- ---------------------------------------------------------------------------

alter table service_booking
  add column if not exists class_session_id uuid,
  add column if not exists seats int not null default 1,
  add column if not exists travel_fee numeric(14,2),
  add column if not exists request_detail jsonb,
  add column if not exists quotation_document_id uuid references document(id);

alter table service_booking drop constraint if exists service_booking_seats_check;
alter table service_booking add constraint service_booking_seats_check check (seats between 1 and 50);

-- 0068 said a live booking needs a provider, so the overlap rule has
-- someone to compare. That stays for any booking that holds a time in
-- someone's diary. A seat in a class holds no one's diary (the class is
-- the teacher's time), and an accepted quote for a day not yet planned
-- holds no time at all.
alter table service_booking drop constraint if exists service_booking_live_needs_provider;
alter table service_booking add constraint service_booking_live_needs_provider
  check (
    status not in ('confirmed', 'in_progress')
    or assigned_membership_id is not null
    or class_session_id is not null
    or scheduled_range is null
  );

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create table if not exists class_session (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  item_id uuid not null references catalogue_item(id),
  location_id uuid references location(id),
  membership_id uuid references business_membership(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  seats int not null check (seats between 1 and 200),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  note text check (note is null or length(note) <= 200),
  created_by uuid references business_membership(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists class_session_upcoming on class_session (business_id, starts_at) where status = 'open';
alter table class_session enable row level security;

alter table service_booking drop constraint if exists service_booking_class_session_fk;
alter table service_booking add constraint service_booking_class_session_fk
  foreign key (class_session_id) references class_session(id);

create or replace function class_seats_taken(p_session uuid)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(seats), 0)::int from service_booking
   where class_session_id = p_session and status in ('requested', 'confirmed', 'in_progress', 'completed');
$$;

create or replace function schedule_class(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_item catalogue_item%rowtype;
  v_start timestamptz := (p->>'starts_at')::timestamptz;
  v_seats int := (p->>'seats')::int;
  v_location uuid := nullif(p->>'location_id', '')::uuid;
  v_teacher uuid := nullif(p->>'membership_id', '')::uuid;
  v_id uuid;
begin
  perform require_permission(v_actor, v_business, array['bookings.manage']);
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business and kind = 'service' and active;
  if not found then
    raise exception 'service_not_found';
  end if;
  if coalesce(v_item.service_attributes->>'booking_model', 'fixed_slot') <> 'class_session' then
    raise exception 'not_a_class';
  end if;
  if v_start is null or v_start <= now() then
    raise exception 'class_in_past';
  end if;
  if v_seats is null or v_seats < 1 or v_seats > 200 then
    raise exception 'seats_out_of_range';
  end if;
  if v_location is not null and not exists (select 1 from location where id = v_location and business_id = v_business and active) then
    raise exception 'place_not_found';
  end if;
  if v_teacher is not null and not exists (select 1 from business_membership where id = v_teacher and business_id = v_business and status = 'active') then
    raise exception 'teacher_not_on_team';
  end if;
  insert into class_session (business_id, item_id, location_id, membership_id, starts_at, ends_at, seats, note, created_by)
  values (v_business, v_item.id, v_location, v_teacher, v_start,
          v_start + make_interval(mins => coalesce((v_item.service_attributes->>'duration_minutes')::int, 60)),
          v_seats, nullif(left(btrim(coalesce(p->>'note', '')), 200), ''), v_actor)
  returning id into v_id;
  return jsonb_build_object('class_session_id', v_id);
end;
$fn$;

-- Cancelling a class cancels its seat bookings, each with what it paid
-- marked to return.
create or replace function cancel_class(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_session class_session%rowtype;
  v_n int := 0;
  r service_booking%rowtype;
  v_paid numeric;
begin
  perform require_permission(v_actor, v_business, array['bookings.manage']);
  select * into v_session from class_session where id = (p->>'class_session_id')::uuid and business_id = v_business for update;
  if not found then
    raise exception 'class_not_found';
  end if;
  if v_session.status = 'cancelled' then
    return jsonb_build_object('cancelled', 0, 'unchanged', true);
  end if;
  update class_session set status = 'cancelled' where id = v_session.id;
  for r in select * from service_booking where class_session_id = v_session.id and status in ('requested', 'confirmed') for update loop
    v_paid := booking_paid(r.id);
    update service_booking
       set status = 'cancelled', cancelled_by = 'business',
           cancellation_reason = coalesce(nullif(btrim(coalesce(p->>'reason', '')), ''), 'The class was cancelled'),
           deposit_to_return = case when v_paid > 0 then v_paid else null end, updated_at = now()
     where id = r.id;
    insert into event_outbox (event_type, business_id, location_id, actor_membership_id, channel, product_set, entity_type, entity_id,
                              amount, currency_code, verification, payload, business_date)
    values ('services.booking.progressed', r.business_id, r.location_id, v_actor, 'business_web', 'services', 'service_booking', r.id,
            r.price_quoted, r.currency_code, 'merchant_declared', jsonb_build_object('from', r.status, 'to', 'cancelled', 'class', true), current_date);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('cancelled', v_n);
end;
$fn$;

-- Upcoming classes for a service, with seats left, for the booking page.
create or replace function class_sessions(p_business uuid, p_item uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, seats int, seats_left int,
               place text, teacher text, note text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id, s.starts_at, s.ends_at, s.seats, greatest(s.seats - class_seats_taken(s.id), 0),
         l.name, pe.full_name, s.note
    from class_session s
    left join location l on l.id = s.location_id
    left join business_membership m on m.id = s.membership_id
    left join person pe on pe.id = m.person_id
   where s.business_id = p_business and s.item_id = p_item and s.status = 'open'
     and s.starts_at > now() and s.starts_at < now() + interval '60 days'
   order by s.starts_at
   limit 20;
$$;

create or replace function book_class_seats(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_session class_session%rowtype;
  v_item catalogue_item%rowtype;
  v_seats int := coalesce((p->>'seats')::int, 1);
  v_customer uuid;
  v_booking uuid;
  v_ref text := nullif(p->>'client_ref', '');
  v_existing service_booking%rowtype;
begin
  if v_ref is not null then
    select * into v_existing from service_booking
     where business_id = v_business and completion_detail->>'client_ref' = v_ref limit 1;
    if found then
      return jsonb_build_object('booking_id', v_existing.id, 'status', v_existing.status, 'scheduled_start', v_existing.scheduled_start, 'duplicate', true);
    end if;
  end if;
  select * into v_session from class_session where id = (p->>'class_session_id')::uuid and business_id = v_business for update;
  if not found or v_session.status <> 'open' then
    raise exception 'class_not_found';
  end if;
  if v_session.starts_at <= now() then
    raise exception 'class_started';
  end if;
  if v_seats < 1 or v_seats > 20 then
    raise exception 'seats_out_of_range';
  end if;
  if class_seats_taken(v_session.id) + v_seats > v_session.seats then
    raise exception 'class_full: %', greatest(v_session.seats - class_seats_taken(v_session.id), 0);
  end if;
  select * into v_item from catalogue_item where id = v_session.item_id;
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business, 'name', p->>'customer_name', 'phone', p->>'customer_phone', 'created_via', 'services'
  ))->>'customer_id', '')::uuid;
  insert into service_booking (business_id, location_id, customer_id, item_id, model, status, scheduled_start, scheduled_end,
                               assigned_membership_id, class_session_id, seats, price_quoted, currency_code, completion_detail)
  values (v_business, v_session.location_id, v_customer, v_item.id, 'class_session', 'confirmed', v_session.starts_at, v_session.ends_at,
          null, v_session.id, v_seats, coalesce(v_item.base_price, 0) * v_seats, coalesce(v_item.currency_code, 'GHS'),
          case when v_ref is null then '{}'::jsonb else jsonb_build_object('client_ref', v_ref) end)
  returning id into v_booking;
  insert into event_outbox (event_type, business_id, location_id, channel, product_set, entity_type, entity_id,
                            amount, currency_code, verification, payload, business_date)
  values ('services.booking.requested', v_business, v_session.location_id, 'customer_web', 'services', 'service_booking', v_booking,
          coalesce(v_item.base_price, 0) * v_seats, coalesce(v_item.currency_code, 'GHS'), 'customer_confirmed',
          jsonb_build_object('model', 'class_session', 'status', 'confirmed', 'seats', v_seats), current_date);
  return jsonb_build_object('booking_id', v_booking, 'status', 'confirmed', 'scheduled_start', v_session.starts_at,
                            'scheduled_end', v_session.ends_at, 'seats', v_seats);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Home service
-- ---------------------------------------------------------------------------
create or replace function request_home_booking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_item catalogue_item%rowtype;
  v_member uuid := nullif(p->>'membership_id', '')::uuid;
  v_start timestamptz := (p->>'scheduled_start')::timestamptz;
  v_address text := nullif(btrim(coalesce(p->>'service_address', '')), '');
  v_fee numeric;
  v_customer uuid;
  v_booking uuid;
  v_ref text := nullif(p->>'client_ref', '');
  v_existing service_booking%rowtype;
begin
  if v_ref is not null then
    select * into v_existing from service_booking
     where business_id = v_business and completion_detail->>'client_ref' = v_ref limit 1;
    if found then
      return jsonb_build_object('booking_id', v_existing.id, 'status', v_existing.status, 'scheduled_start', v_existing.scheduled_start, 'duplicate', true);
    end if;
  end if;
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business and kind = 'service' and active;
  if not found then
    raise exception 'service_unavailable';
  end if;
  if coalesce((v_item.service_attributes->'home'->>'enabled')::boolean, false) is not true then
    raise exception 'no_home_service';
  end if;
  if v_address is null or length(v_address) < 6 then
    raise exception 'address_needed';
  end if;
  if v_member is null or not exists (select 1 from business_membership where id = v_member and business_id = v_business and status = 'active') then
    raise exception 'provider_required';
  end if;
  -- A time the booking page offered for that person, so a request never
  -- asks for 3am.
  if v_start is null or not exists (
    select 1 from available_slots(v_item.id, v_member, (v_start at time zone 'UTC')::date) s where s.slot_start = v_start
  ) then
    raise exception 'slot_unavailable';
  end if;
  v_fee := coalesce((v_item.service_attributes->'home'->>'travel_fee')::numeric, 0);
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business, 'name', p->>'customer_name', 'phone', p->>'customer_phone', 'created_via', 'services'
  ))->>'customer_id', '')::uuid;
  insert into service_booking (business_id, location_id, customer_id, item_id, model, status, scheduled_start, scheduled_end,
                               assigned_membership_id, service_address, travel_fee, deposit_required, price_quoted, currency_code,
                               completion_detail)
  values (v_business, nullif(p->>'location_id', '')::uuid, v_customer, v_item.id, 'field_job', 'requested', v_start,
          v_start + make_interval(mins => coalesce((v_item.service_attributes->>'duration_minutes')::int, 60)),
          v_member, left(v_address, 300), nullif(v_fee, 0), nullif(coalesce((v_item.service_attributes->>'deposit_amount')::numeric, 0), 0),
          coalesce(v_item.base_price, 0) + v_fee, coalesce(v_item.currency_code, 'GHS'),
          case when v_ref is null then '{}'::jsonb else jsonb_build_object('client_ref', v_ref) end)
  returning id into v_booking;
  insert into event_outbox (event_type, business_id, channel, product_set, entity_type, entity_id,
                            amount, currency_code, verification, payload, business_date)
  values ('services.booking.requested', v_business, 'customer_web', 'services', 'service_booking', v_booking,
          coalesce(v_item.base_price, 0) + v_fee, coalesce(v_item.currency_code, 'GHS'), 'customer_confirmed',
          jsonb_build_object('model', 'field_job', 'status', 'requested', 'home', true), current_date);
  return jsonb_build_object('booking_id', v_booking, 'status', 'requested', 'scheduled_start', v_start, 'travel_fee', v_fee);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Quote first
-- ---------------------------------------------------------------------------
create or replace function request_quote_booking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_item catalogue_item%rowtype;
  v_detail jsonb := coalesce(p->'detail', '{}'::jsonb);
  v_date date := nullif(v_detail->>'date', '')::date;
  v_photos jsonb := coalesce(v_detail->'photos', '[]'::jsonb);
  v_customer uuid;
  v_booking uuid;
  v_ref text := nullif(p->>'client_ref', '');
  v_existing service_booking%rowtype;
  ph jsonb;
begin
  if v_ref is not null then
    select * into v_existing from service_booking
     where business_id = v_business and completion_detail->>'client_ref' = v_ref limit 1;
    if found then
      return jsonb_build_object('booking_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
    end if;
  end if;
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business and kind = 'service' and active;
  if not found then
    raise exception 'service_unavailable';
  end if;
  if coalesce(v_item.service_attributes->>'booking_model', 'fixed_slot') <> 'quote_first' then
    raise exception 'not_quote_first';
  end if;
  if v_date is null or v_date < current_date then
    raise exception 'date_needed';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 3 then
    raise exception 'too_many_photos';
  end if;
  for ph in select * from jsonb_array_elements(v_photos) loop
    if (ph->>'path') !~ ('^' || v_business::text || '/request-[0-9a-f-]{36}\.jpg$') then
      raise exception 'photo_not_ours';
    end if;
  end loop;
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business, 'name', p->>'customer_name', 'phone', p->>'customer_phone', 'created_via', 'services'
  ))->>'customer_id', '')::uuid;
  insert into service_booking (business_id, customer_id, item_id, model, status, request_detail, currency_code, completion_detail)
  values (v_business, v_customer, v_item.id, 'quote_first', 'requested',
          jsonb_build_object(
            'occasion', left(coalesce(v_detail->>'occasion', ''), 60),
            'date', v_date,
            'people', left(coalesce(v_detail->>'people', ''), 60),
            'where', left(coalesce(v_detail->>'where', ''), 160),
            'needs', coalesce(v_detail->'needs', '[]'::jsonb),
            'note', left(coalesce(v_detail->>'note', ''), 500),
            'photos', v_photos),
          coalesce(v_item.currency_code, 'GHS'),
          case when v_ref is null then '{}'::jsonb else jsonb_build_object('client_ref', v_ref) end)
  returning id into v_booking;
  insert into event_outbox (event_type, business_id, channel, product_set, entity_type, entity_id, currency_code, verification, payload, business_date)
  values ('services.booking.requested', v_business, 'customer_web', 'services', 'service_booking', v_booking,
          coalesce(v_item.currency_code, 'GHS'), 'customer_confirmed', jsonb_build_object('model', 'quote_first', 'status', 'requested'), current_date);
  return jsonb_build_object('booking_id', v_booking, 'status', 'requested');
end;
$fn$;

-- The owner's quotation for a request, made in Documents from the booking.
create or replace function link_booking_quotation(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_b service_booking%rowtype;
  v_doc document%rowtype;
begin
  perform require_permission(v_actor, v_business, array['bookings.manage', 'bookings.manage_assigned']);
  select * into v_b from service_booking where id = (p->>'booking_id')::uuid and business_id = v_business for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_b.model <> 'quote_first' or v_b.status not in ('requested', 'quoted') then
    raise exception 'not_waiting_for_a_quote';
  end if;
  select * into v_doc from document where id = (p->>'document_id')::uuid and business_id = v_business and type = 'quotation';
  if not found then
    raise exception 'quotation_not_found';
  end if;
  update service_booking
     set quotation_document_id = v_doc.id, status = 'quoted',
         price_quoted = coalesce(v_doc.total, price_quoted), updated_at = now()
   where id = v_b.id;
  if v_b.status = 'requested' then
    insert into event_outbox (event_type, business_id, actor_membership_id, channel, product_set, entity_type, entity_id,
                              amount, currency_code, verification, payload, business_date)
    values ('services.booking.progressed', v_business, v_actor, 'business_web', 'services', 'service_booking', v_b.id,
            v_doc.total, v_b.currency_code, 'merchant_declared', jsonb_build_object('from', 'requested', 'to', 'quoted', 'quotation', v_doc.number), current_date);
  end if;
  return jsonb_build_object('booking_id', v_b.id, 'status', 'quoted');
end;
$fn$;

-- The customer accepts the quotation on their booking link.
create or replace function accept_booking_quotation(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_b service_booking%rowtype;
  v_doc document%rowtype;
  v_pct numeric;
  v_deposit numeric;
begin
  select * into v_b from service_booking where id = (p->>'booking_id')::uuid for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_b.status <> 'quoted' or v_b.quotation_document_id is null then
    raise exception 'no_quotation_to_accept';
  end if;
  select * into v_doc from document where id = v_b.quotation_document_id for update;
  if v_doc.number is null or v_doc.status in ('draft', 'cancelled', 'superseded', 'rejected', 'expired') then
    raise exception 'quotation_not_open';
  end if;
  if v_doc.valid_until is not null and v_doc.valid_until < current_date then
    raise exception 'quotation_expired';
  end if;
  select coalesce((service_attributes->>'deposit_percent')::numeric, 30) into v_pct from catalogue_item where id = v_b.item_id;
  v_deposit := round(coalesce(v_doc.total, 0) * greatest(least(v_pct, 100), 0) / 100, 2);
  update document set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = v_doc.id and status <> 'accepted';
  update service_booking
     set status = 'confirmed', price_quoted = v_doc.total, deposit_required = nullif(v_deposit, 0), updated_at = now()
   where id = v_b.id;
  insert into event_outbox (event_type, business_id, channel, product_set, entity_type, entity_id,
                            amount, currency_code, verification, payload, business_date)
  values ('services.booking.confirmed', v_b.business_id, 'customer_web', 'services', 'service_booking', v_b.id,
          v_doc.total, v_b.currency_code, 'customer_confirmed', jsonb_build_object('from', 'quoted', 'to', 'confirmed', 'accepted', v_doc.number), current_date);
  return jsonb_build_object('booking_id', v_b.id, 'status', 'confirmed', 'total', v_doc.total, 'deposit', v_deposit);
end;
$fn$;

revoke all on function class_seats_taken(uuid) from public, anon, authenticated;
revoke all on function schedule_class(jsonb) from public, anon, authenticated;
revoke all on function cancel_class(jsonb) from public, anon, authenticated;
revoke all on function class_sessions(uuid, uuid) from public, anon, authenticated;
revoke all on function book_class_seats(jsonb) from public, anon, authenticated;
revoke all on function request_home_booking(jsonb) from public, anon, authenticated;
revoke all on function request_quote_booking(jsonb) from public, anon, authenticated;
revoke all on function link_booking_quotation(jsonb) from public, anon, authenticated;
revoke all on function accept_booking_quotation(jsonb) from public, anon, authenticated;
grant execute on function class_seats_taken(uuid) to service_role;
grant execute on function schedule_class(jsonb) to service_role;
grant execute on function cancel_class(jsonb) to service_role;
grant execute on function class_sessions(uuid, uuid) to service_role;
grant execute on function book_class_seats(jsonb) to service_role;
grant execute on function request_home_booking(jsonb) to service_role;
grant execute on function request_quote_booking(jsonb) to service_role;
grant execute on function link_booking_quotation(jsonb) to service_role;
grant execute on function accept_booking_quotation(jsonb) to service_role;
