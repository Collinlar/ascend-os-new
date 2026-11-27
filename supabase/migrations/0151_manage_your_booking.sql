-- ---------------------------------------------------------------------------
-- 0151  Manage your booking (Modules round 4, S2; decisions 1, 5, 6)
--
-- 1. booking_settings: how long before a booking the customer can still
--    change or cancel it themselves. 24 hours unless the business says
--    otherwise (0 to 168).
-- 2. booking_access_token: the customer's private link to one booking,
--    stored as a hash like an order link (0145).
-- 3. customer_change_booking: from that link, move the booking to another
--    time the same person is free, or cancel it, while the window is open.
--    A cancelled booking with money paid owes the deposit back; the
--    business returns it directly (no online payments yet) and marks it,
--    which records a refund against the payment so Money follows.
-- 4. booking_rating: after the visit, stars and a comment only the
--    business sees. Once per booking.
-- 5. booking_wish: "Nothing fits": which days and part of the day suit
--    the customer, for the business to answer from its own WhatsApp.
--
-- Reads: service_booking (0003, 0018, 0020), available_slots (0073),
-- payment and ledger_entry (0004), refunds in the money core (0085),
-- event_outbox (0006), require_permission (0081),
-- business_membership, catalogue_item, customer (0002).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The change window
-- ---------------------------------------------------------------------------
create table if not exists booking_settings (
  business_id uuid primary key references business(id),
  change_window_hours int not null default 24 check (change_window_hours between 0 and 168),
  updated_by uuid references business_membership(id),
  updated_at timestamptz not null default now()
);
alter table booking_settings enable row level security;

create or replace function booking_change_window(p_business uuid)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select change_window_hours from booking_settings where business_id = p_business), 24);
$$;

create or replace function set_booking_settings(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_hours int := (p->>'change_window_hours')::int;
begin
  perform require_permission(v_actor, v_business, array['bookings.manage', 'business.settings']);
  if v_hours is null or v_hours < 0 or v_hours > 168 then
    raise exception 'window_out_of_range';
  end if;
  insert into booking_settings (business_id, change_window_hours, updated_by, updated_at)
  values (v_business, v_hours, v_actor, now())
  on conflict (business_id) do update
    set change_window_hours = excluded.change_window_hours, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('change_window_hours', v_hours);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The customer's link
-- ---------------------------------------------------------------------------
create table if not exists booking_access_token (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  booking_id uuid not null references service_booking(id),
  business_id uuid not null references business(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists booking_access_token_booking_idx on booking_access_token (booking_id);
alter table booking_access_token enable row level security;
revoke all on booking_access_token from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Changing it
-- ---------------------------------------------------------------------------
alter table service_booking
  add column if not exists cancelled_by text,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists reschedule_count int not null default 0,
  add column if not exists deposit_to_return numeric(14,2),
  add column if not exists deposit_returned_at timestamptz,
  add column if not exists deposit_returned_by uuid references business_membership(id),
  add column if not exists deposit_return_method text;

alter table service_booking drop constraint if exists service_booking_cancelled_by_check;
alter table service_booking add constraint service_booking_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('customer', 'business'));
alter table service_booking drop constraint if exists service_booking_return_method_check;
alter table service_booking add constraint service_booking_return_method_check
  check (deposit_return_method is null or deposit_return_method in ('cash', 'mobile_money', 'bank_transfer'));

-- What has been paid on a booking, less anything refunded.
create or replace function booking_paid(p_booking uuid)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(case when status = 'confirmed' and reversal_of is null then amount
                           when status = 'refunded' and reversal_of is not null then -amount
                           else 0 end), 0)
    from payment
   where source_entity_type = 'service_booking'
     and source_entity_id = p_booking;
$$;

create or replace function customer_change_booking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_b service_booking%rowtype;
  v_action text := p->>'action';
  v_window int;
  v_new timestamptz := nullif(p->>'new_start', '')::timestamptz;
  v_length interval;
  v_paid numeric;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
begin
  select * into v_b from service_booking where id = (p->>'booking_id')::uuid for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_b.status not in ('requested', 'confirmed') then
    raise exception 'booking_not_changeable: %', v_b.status;
  end if;
  v_window := booking_change_window(v_b.business_id);
  if v_b.scheduled_start is not null and v_b.scheduled_start - make_interval(hours => v_window) <= now() then
    raise exception 'outside_window: %', v_window;
  end if;

  if v_action = 'reschedule' then
    if v_new is null or v_b.scheduled_start is null or v_b.scheduled_end is null then
      raise exception 'new_time_needed';
    end if;
    if v_new = v_b.scheduled_start then
      return jsonb_build_object('booking_id', v_b.id, 'scheduled_start', v_new, 'unchanged', true);
    end if;
    if v_new - make_interval(hours => v_window) <= now() then
      raise exception 'new_time_too_soon: %', v_window;
    end if;
    v_length := v_b.scheduled_end - v_b.scheduled_start;
    -- Free the booking's own time first, so a move that overlaps it (an
    -- hour later for a two-hour service) is judged fairly. If the new time
    -- is not free, the whole change is undone.
    update service_booking set scheduled_start = null, scheduled_end = null where id = v_b.id;
    if v_b.assigned_membership_id is not null and not exists (
      select 1 from available_slots(v_b.item_id, v_b.assigned_membership_id, (v_new at time zone 'UTC')::date) s
       where s.slot_start = v_new
    ) then
      raise exception 'slot_unavailable';
    end if;
    begin
      update service_booking
         set scheduled_start = v_new,
             scheduled_end = v_new + v_length,
             rescheduled_at = now(),
             reschedule_count = reschedule_count + 1,
             updated_at = now()
       where id = v_b.id;
    exception
      when exclusion_violation then
        raise exception 'slot_taken';
    end;
    insert into event_outbox (event_type, business_id, location_id, channel, product_set, entity_type, entity_id,
                              amount, currency_code, verification, payload, business_date)
    values ('services.booking.rescheduled', v_b.business_id, v_b.location_id, 'customer_web', 'services',
            'service_booking', v_b.id, v_b.price_quoted, v_b.currency_code, 'customer_confirmed',
            jsonb_build_object('from', v_b.scheduled_start, 'to_start', v_new, 'by', 'customer'), current_date);
    return jsonb_build_object('booking_id', v_b.id, 'scheduled_start', v_new, 'scheduled_end', v_new + v_length);
  end if;

  if v_action = 'cancel' then
    v_paid := booking_paid(v_b.id);
    update service_booking
       set status = 'cancelled',
           cancelled_by = 'customer',
           cancellation_reason = coalesce(v_reason, 'Cancelled by the customer'),
           deposit_to_return = case when v_paid > 0 then v_paid else null end,
           hold_expires_at = null,
           updated_at = now()
     where id = v_b.id;
    insert into event_outbox (event_type, business_id, location_id, channel, product_set, entity_type, entity_id,
                              amount, currency_code, verification, payload, business_date)
    values ('services.booking.progressed', v_b.business_id, v_b.location_id, 'customer_web', 'services',
            'service_booking', v_b.id, v_b.price_quoted, v_b.currency_code, 'customer_confirmed',
            jsonb_build_object('from', v_b.status, 'to', 'cancelled', 'by', 'customer', 'deposit_to_return', v_paid), current_date);
    return jsonb_build_object('booking_id', v_b.id, 'status', 'cancelled', 'deposit_to_return', v_paid);
  end if;

  raise exception 'action_unknown';
end;
$fn$;

-- The business gave the deposit back (directly, until online payments).
create or replace function return_booking_deposit(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_b service_booking%rowtype;
  v_method text := coalesce(nullif(p->>'method', ''), 'mobile_money');
  v_left numeric;
  v_take numeric;
  r payment%rowtype;
begin
  perform require_permission(v_actor, v_business, array['bookings.manage']);
  select * into v_b from service_booking where id = (p->>'booking_id')::uuid and business_id = v_business for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if coalesce(v_b.deposit_to_return, 0) <= 0 then
    raise exception 'nothing_to_return';
  end if;
  if v_b.deposit_returned_at is not null then
    raise exception 'already_returned';
  end if;
  if v_method not in ('cash', 'mobile_money', 'bank_transfer') then
    raise exception 'method_unknown';
  end if;

  -- A real refund against each payment that paid it, newest first, so the
  -- money core and Money see the deposit leave (0085 applies a refunded
  -- payment that reverses another). Never more than what was paid.
  v_left := least(v_b.deposit_to_return, booking_paid(v_b.id));
  for r in
    select p.* from payment p
     where p.source_entity_type = 'service_booking' and p.source_entity_id = v_b.id
       and p.status = 'confirmed' and p.reversal_of is null
     order by p.occurred_at desc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.amount - coalesce((select sum(x.amount) from payment x where x.reversal_of = r.id and x.status = 'refunded'), 0));
    if v_take > 0 then
      insert into payment (client_ref, business_id, location_id, customer_id, method, status, verification, amount,
                           currency_code, source_entity_type, source_entity_id, reversal_of, actor_membership_id, occurred_at)
      values ('deposit-return:' || r.id::text, v_b.business_id, r.location_id, r.customer_id, v_method::payment_method,
              'refunded', 'merchant_declared', v_take, r.currency_code, 'service_booking', v_b.id, r.id, v_actor, now());
      insert into ledger_entry (business_id, kind, amount, currency_code, source_entity_type, source_entity_id, business_date)
      values (v_b.business_id, 'refund', -1 * v_take, r.currency_code, 'service_booking', v_b.id, current_date);
      v_left := v_left - v_take;
    end if;
  end loop;

  update service_booking
     set deposit_returned_at = now(), deposit_returned_by = v_actor, deposit_return_method = v_method, updated_at = now()
   where id = v_b.id;
  insert into event_outbox (event_type, business_id, location_id, actor_membership_id, channel, product_set, entity_type, entity_id,
                            amount, currency_code, verification, payload, business_date)
  values ('services.booking.deposit_returned', v_b.business_id, v_b.location_id, v_actor, 'business_web', 'services',
          'service_booking', v_b.id, v_b.deposit_to_return, v_b.currency_code, 'merchant_declared',
          jsonb_build_object('amount', v_b.deposit_to_return, 'method', v_method), current_date);
  return jsonb_build_object('returned', v_b.deposit_to_return, 'method', v_method);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Ratings, private to the business
-- ---------------------------------------------------------------------------
create table if not exists booking_rating (
  booking_id uuid primary key references service_booking(id),
  business_id uuid not null references business(id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists booking_rating_business on booking_rating (business_id, created_at desc);
alter table booking_rating enable row level security;

create or replace function rate_booking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_b service_booking%rowtype;
  v_stars int := (p->>'stars')::int;
begin
  select * into v_b from service_booking where id = (p->>'booking_id')::uuid;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_b.status <> 'completed' then
    raise exception 'not_done_yet';
  end if;
  if v_stars is null or v_stars < 1 or v_stars > 5 then
    raise exception 'stars_1_to_5';
  end if;
  if exists (select 1 from booking_rating where booking_id = v_b.id) then
    raise exception 'already_rated';
  end if;
  insert into booking_rating (booking_id, business_id, stars, comment)
  values (v_b.id, v_b.business_id, v_stars, nullif(left(btrim(coalesce(p->>'comment', '')), 500), ''));
  return jsonb_build_object('rated', v_stars);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. "Nothing fits"
-- ---------------------------------------------------------------------------
create table if not exists booking_wish (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  item_id uuid references catalogue_item(id),
  membership_id uuid references business_membership(id),
  days smallint[] not null default '{}',
  part text not null default 'any' check (part in ('morning', 'afternoon', 'any')),
  customer_name text not null check (length(btrim(customer_name)) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  note text check (note is null or length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answered_by uuid references business_membership(id),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  check (days <@ array[0,1,2,3,4,5,6]::smallint[])
);
create index if not exists booking_wish_open on booking_wish (business_id, created_at desc) where status = 'open';
alter table booking_wish enable row level security;

create or replace function answer_booking_wish(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_status text := coalesce(nullif(p->>'status', ''), 'answered');
begin
  perform require_permission(v_actor, v_business, array['bookings.manage', 'bookings.manage_assigned']);
  if v_status not in ('answered', 'closed') then
    raise exception 'status_unknown';
  end if;
  update booking_wish set status = v_status, answered_by = v_actor, answered_at = now()
   where id = (p->>'wish_id')::uuid and business_id = v_business and status = 'open';
  if not found then
    raise exception 'wish_not_found';
  end if;
  return jsonb_build_object('status', v_status);
end;
$fn$;

revoke all on function booking_change_window(uuid) from public, anon, authenticated;
revoke all on function set_booking_settings(jsonb) from public, anon, authenticated;
revoke all on function booking_paid(uuid) from public, anon, authenticated;
revoke all on function customer_change_booking(jsonb) from public, anon, authenticated;
revoke all on function return_booking_deposit(jsonb) from public, anon, authenticated;
revoke all on function rate_booking(jsonb) from public, anon, authenticated;
revoke all on function answer_booking_wish(jsonb) from public, anon, authenticated;
grant execute on function booking_change_window(uuid) to service_role;
grant execute on function set_booking_settings(jsonb) to service_role;
grant execute on function booking_paid(uuid) to service_role;
grant execute on function customer_change_booking(jsonb) to service_role;
grant execute on function return_booking_deposit(jsonb) to service_role;
grant execute on function rate_booking(jsonb) to service_role;
grant execute on function answer_booking_wish(jsonb) to service_role;
