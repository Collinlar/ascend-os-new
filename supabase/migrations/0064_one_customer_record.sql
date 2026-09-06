-- ---------------------------------------------------------------------------
-- 0064  One customer, actually enforced
--
-- CAP-003 says the shared customer record must support product-set-specific
-- interactions without duplicate customer creation. Every write path checks
-- for an existing customer by phone before making one, so the rule was
-- being followed by convention. It was not being enforced, and the live
-- database shows what that costs:
--
--   Collins  +233242101281  via shop       CLASmart
--   Collins  0242101281     via documents  CLASmart
--
-- One person, one business, two records, because the storefront saved a
-- normalised number and Documents saved what was typed into the box. The
-- checks compared raw strings and neither matched the other.
--
-- It is also racy. Two first-time orders from the same number arriving
-- together would both find nothing and both insert, whatever the checks
-- say.
--
-- Three changes: a normal form for Ghanaian numbers, a way to merge what
-- is already split, and then a unique index so it cannot happen again.
-- The order matters, because the index cannot be created while duplicates
-- exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The normal form. Ghana writes the same number as 024 210 1281,
-- 0242101281, +233242101281 and 233242101281, and all four are one person.
--
-- Immutable because a generated column depends on it.
-- ---------------------------------------------------------------------------
create or replace function normalise_phone(p_phone text)
returns text
language plpgsql
immutable
as $fn$
declare
  v_digits text;
begin
  if p_phone is null then
    return null;
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  -- Already international: 233 followed by the nine-digit national number.
  if left(v_digits, 3) = '233' and length(v_digits) = 12 then
    return '+' || v_digits;
  end if;

  -- National with the trunk zero: 0 followed by nine digits.
  if left(v_digits, 1) = '0' and length(v_digits) = 10 then
    return '+233' || right(v_digits, 9);
  end if;

  -- Bare national number, nine digits.
  if length(v_digits) = 9 then
    return '+233' || v_digits;
  end if;

  -- Anything else is left alone rather than mangled. A number this does
  -- not recognise is more likely a foreign one or a typo than something
  -- worth guessing at, and guessing would merge two people.
  return '+' || v_digits;
end;
$fn$;

alter table customer
  add column if not exists phone_normalised text
  generated always as (normalise_phone(phone_e164)) stored;

-- ---------------------------------------------------------------------------
-- merge_customers: move everything the duplicate is attached to onto the
-- record being kept, then remove it.
--
-- Ten tables reference customer(id). Missing one would leave a row pointing
-- at a customer that no longer exists, so they are all named here and the
-- delete at the end is what proves none were missed: it fails loudly on a
-- foreign key rather than quietly orphaning anything.
-- ---------------------------------------------------------------------------
create or replace function merge_customers(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_keep uuid := (p->>'keep_id')::uuid;
  v_drop uuid := (p->>'drop_id')::uuid;
  v_keep_row customer%rowtype;
  v_drop_row customer%rowtype;
  v_moved jsonb := '{}'::jsonb;
begin
  if v_keep = v_drop then
    raise exception 'cannot_merge_a_record_into_itself';
  end if;

  select * into v_keep_row from customer where id = v_keep;
  if not found then raise exception 'keep_customer_not_found'; end if;
  select * into v_drop_row from customer where id = v_drop;
  if not found then raise exception 'drop_customer_not_found'; end if;

  -- Merging across businesses would move one business's customer history
  -- into another's books.
  if v_keep_row.business_id <> v_drop_row.business_id then
    raise exception 'customers_belong_to_different_businesses';
  end if;

  update sale             set customer_id = v_keep where customer_id = v_drop;
  update shop_order       set customer_id = v_keep where customer_id = v_drop;
  update service_booking  set customer_id = v_keep where customer_id = v_drop;
  update document         set customer_id = v_keep where customer_id = v_drop;
  update payment          set customer_id = v_keep where customer_id = v_drop;
  update payment_intent   set customer_id = v_keep where customer_id = v_drop;
  update receivable       set customer_id = v_keep where customer_id = v_drop;
  update project          set customer_id = v_keep where customer_id = v_drop;
  update message          set customer_id = v_keep where customer_id = v_drop;
  update consent_record   set customer_id = v_keep where customer_id = v_drop;

  -- Keep whatever the surviving record was missing. A duplicate usually
  -- exists because one channel knew something the other did not.
  update customer
     set email = coalesce(email, v_drop_row.email),
         organisation_name = coalesce(organisation_name, v_drop_row.organisation_name),
         phone_e164 = coalesce(phone_e164, v_drop_row.phone_e164),
         person_id = coalesce(person_id, v_drop_row.person_id),
         notes = case
                   when notes is null then v_drop_row.notes
                   when v_drop_row.notes is null then notes
                   else notes || E'\n' || v_drop_row.notes
                 end,
         marketing_consent = marketing_consent or v_drop_row.marketing_consent,
         updated_at = now()
   where id = v_keep;

  delete from customer where id = v_drop;

  return jsonb_build_object('kept', v_keep, 'merged', v_drop);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Merge what is already split, before the index makes it impossible.
--
-- Oldest record wins, because it is the one the longest history hangs off
-- and the one a merchant is likelier to recognise.
-- ---------------------------------------------------------------------------
do $merge$
declare
  r record;
  v_merged int := 0;
begin
  for r in
    select business_id, phone_normalised,
           (array_agg(id order by created_at))[1] as keep_id,
           array_agg(id order by created_at) as all_ids
    from customer
    where phone_normalised is not null
    group by business_id, phone_normalised
    having count(*) > 1
  loop
    for i in 2 .. array_length(r.all_ids, 1) loop
      perform merge_customers(jsonb_build_object(
        'keep_id', r.keep_id, 'drop_id', r.all_ids[i]
      ));
      v_merged := v_merged + 1;
    end loop;
  end loop;

  raise notice 'merged % duplicate customer record(s)', v_merged;
end
$merge$;

-- ---------------------------------------------------------------------------
-- Now it cannot happen again, whatever any future code path does.
-- ---------------------------------------------------------------------------
create unique index if not exists customer_one_per_phone_per_business
  on customer (business_id, phone_normalised)
  where phone_normalised is not null;

-- ---------------------------------------------------------------------------
-- find_or_create_customer: the one way in.
--
-- Shop and Services each had their own lookup inside their own functions
-- and Documents did it from the API route, so the rule lived in three
-- places and one of them normalised differently from the others. That is
-- precisely what ARC-003 warns about.
--
-- Takes whatever the channel knows and fills in what the record was
-- missing, so a customer who gives an email on their second order is
-- reachable by email from then on.
-- ---------------------------------------------------------------------------
create or replace function find_or_create_customer(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_phone text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_email text := nullif(btrim(coalesce(p->>'email', '')), '');
  v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
  v_normal text := normalise_phone(v_phone);
  v_id uuid;
  v_created boolean := false;
begin
  if v_business is null then
    raise exception 'business_required';
  end if;

  if v_normal is not null then
    select id into v_id from customer
    where business_id = v_business and phone_normalised = v_normal;
  end if;

  -- No number to match on, but an address will do: a customer who only
  -- ever gives an email is still one customer.
  if v_id is null and v_email is not null then
    select id into v_id from customer
    where business_id = v_business and lower(email) = lower(v_email);
  end if;

  if v_id is null then
    if v_name is null and v_phone is null and v_email is null then
      -- An anonymous sale is allowed and does not need a record
      -- (POS-SALE-004).
      return jsonb_build_object('customer_id', null, 'created', false);
    end if;

    insert into customer (business_id, display_name, phone_e164, email, created_via)
    values (
      v_business,
      coalesce(v_name, 'Customer'),
      v_phone,
      v_email,
      coalesce(nullif(p->>'created_via', ''), 'manual')
    )
    returning id into v_id;
    v_created := true;
  else
    -- Fill the gaps rather than overwrite: the merchant may have corrected
    -- a name here that the storefront never knew.
    update customer
       set email = coalesce(email, v_email),
           phone_e164 = coalesce(phone_e164, v_phone),
           display_name = case
                            when display_name in ('Customer', '') or display_name is null
                              then coalesce(v_name, display_name)
                            else display_name
                          end,
           updated_at = now()
     where id = v_id;
  end if;

  return jsonb_build_object('customer_id', v_id, 'created', v_created);
end;
$fn$;

revoke all on function merge_customers(jsonb) from public, anon, authenticated;
revoke all on function find_or_create_customer(jsonb) from public, anon, authenticated;
grant execute on function merge_customers(jsonb) to service_role;
grant execute on function find_or_create_customer(jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- The two channels that carried their own copy of the lookup.
--
-- Both are replaced whole rather than patched, because the customer block
-- sits in the middle of each and there is no way to change it in place.
-- Everything else in both functions is exactly what it was; only the
-- customer lookup differs, and it now goes through find_or_create_customer
-- so a number written four different ways reaches one record.
--
-- This is not optional now. The unique index above would turn the old
-- string comparison into a failed order rather than a duplicate: the
-- lookup would miss, the insert would be refused, and the customer would
-- be told their order did not go through.
-- ---------------------------------------------------------------------------
create or replace function place_shop_order(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_client_ref text := p->>'client_ref';
  v_existing shop_order%rowtype;
  v_customer uuid;
  v_location uuid;
  v_order uuid;
  v_line jsonb;
  v_item record;
  v_unit numeric(14,2);
  v_qty numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_line_count int := 0;
begin
  if v_client_ref is null then
    raise exception 'client_ref is required';
  end if;

  select * into v_existing from shop_order where client_ref = v_client_ref;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'duplicate', true);
  end if;

  -- One shared customer record per business, matched on the normalised
  -- number rather than the raw one (CAP-003, 0064). The lookup used to live
  -- here and compared strings, which is how one person became two records.
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business,
    'name', p->>'customer_name',
    'phone', p->>'customer_phone',
    'email', p->>'customer_email',
    'created_via', 'shop'
  ))->>'customer_id', '')::uuid;

  select id into v_location
  from location where business_id = v_business and active order by created_at limit 1;

  insert into shop_order (
    client_ref, business_id, location_id, customer_id, status,
    fulfilment, delivery_detail, subtotal, delivery_fee, total,
    currency_code, source
  ) values (
    v_client_ref, v_business, v_location, v_customer, 'pending',
    coalesce((p->>'fulfilment')::fulfilment_method, 'pickup'),
    coalesce(p->'delivery_detail', '{}'::jsonb),
    0, 0, 0, 'GHS',
    coalesce(p->>'source', 'shop_link')
  )
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p->'lines')
  loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    -- Server-side price: shop listing override, else base price.
    select ci.id, ci.name, ci.base_price, ci.track_stock, cl.price_override
    into v_item
    from catalogue_item ci
    join channel_listing cl on cl.item_id = ci.id and cl.channel = 'shop' and cl.visible
    where ci.id = (v_line->>'item_id')::uuid
      and ci.business_id = v_business
      and ci.active;

    if not found then
      raise exception 'item unavailable: %', v_line->>'item_id';
    end if;

    v_unit := coalesce(v_item.price_override, v_item.base_price);
    if v_unit is null then
      raise exception 'item has no price: %', v_item.id;
    end if;

    insert into shop_order_line (order_id, item_id, description, quantity, unit_price, line_total)
    values (v_order, v_item.id, v_item.name, v_qty, v_unit, round(v_unit * v_qty, 2));

    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
    v_line_count := v_line_count + 1;

    if v_item.track_stock and v_location is not null then
      insert into stock_movement (
        client_ref, business_id, location_id, item_id, kind, quantity,
        source_entity_type, source_entity_id, occurred_at
      ) values (
        v_client_ref || ':rsv:' || v_item.id,
        v_business, v_location, v_item.id, 'reservation', -1 * v_qty,
        'shop_order', v_order, now()
      ) on conflict (client_ref) do nothing;
    end if;
  end loop;

  if v_line_count = 0 then
    raise exception 'order has no lines';
  end if;

  update shop_order set subtotal = v_subtotal, total = v_subtotal where id = v_order;

  -- Customer placed this order themselves: customer-confirmed evidence (RDY-008).
  insert into event_outbox (
    event_type, business_id, location_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'shop.order.placed', v_business, v_location, 'customer_web', 'shop',
    'shop_order', v_order, v_subtotal, 'GHS', 'customer_confirmed',
    jsonb_build_object('line_count', v_line_count, 'source', coalesce(p->>'source', 'shop_link')),
    current_date
  );

  return jsonb_build_object('order_id', v_order, 'total', v_subtotal, 'duplicate', false);
end;
$$;
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
-- The customer list, and one customer's history.
--
-- Nine tables carry customer_id and nothing has ever joined them, so a
-- merchant could not answer "who are my customers" or "what has this person
-- bought before". The data was always there; nobody had assembled it.
--
-- Counted from what actually happened rather than kept as a running total
-- on the customer row, because a stored total drifts and this cannot.
-- ---------------------------------------------------------------------------
create or replace function business_customers(p_business uuid, p_query text default null)
returns table (
  id uuid,
  display_name text,
  phone_e164 text,
  email text,
  created_via text,
  orders int,
  sales int,
  bookings int,
  documents int,
  spent numeric,
  owed numeric,
  last_seen timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select
    c.id, c.display_name, c.phone_e164, c.email, c.created_via,
    coalesce(o.n, 0)::int, coalesce(s.n, 0)::int,
    coalesce(b.n, 0)::int, coalesce(d.n, 0)::int,
    -- What they have actually paid, across every channel.
    coalesce(paid.total, 0),
    -- What they still owe on issued invoices.
    coalesce(due.total, 0),
    greatest(
      coalesce(o.last_at, 'epoch'::timestamptz),
      coalesce(s.last_at, 'epoch'::timestamptz),
      coalesce(b.last_at, 'epoch'::timestamptz),
      coalesce(d.last_at, 'epoch'::timestamptz)
    )
  from customer c
  left join lateral (select count(*) n, max(placed_at) last_at from shop_order where customer_id = c.id) o on true
  left join lateral (select count(*) n, max(occurred_at) last_at from sale where customer_id = c.id) s on true
  left join lateral (select count(*) n, max(created_at) last_at from service_booking where customer_id = c.id) b on true
  left join lateral (select count(*) n, max(created_at) last_at from document where customer_id = c.id and number is not null) d on true
  left join lateral (
    select sum(amount) total from payment
    where customer_id = c.id and status = 'confirmed'
  ) paid on true
  left join lateral (
    select sum(coalesce(dd.total, 0)) total from document dd
    where dd.customer_id = c.id and dd.type = 'invoice' and dd.number is not null
      and dd.status in ('issued','sent','delivered','viewed','partially_paid','overdue')
  ) due on true
  where c.business_id = p_business
    and (
      p_query is null or p_query = ''
      or c.display_name ilike '%' || p_query || '%'
      or c.phone_e164 ilike '%' || p_query || '%'
      or c.email ilike '%' || p_query || '%'
    )
  order by greatest(
    coalesce(o.last_at, 'epoch'::timestamptz),
    coalesce(s.last_at, 'epoch'::timestamptz),
    coalesce(b.last_at, 'epoch'::timestamptz),
    coalesce(d.last_at, 'epoch'::timestamptz)
  ) desc nulls last,
  c.display_name;
$fn$;

-- One customer, everything they have done, newest first. The zero-silo
-- promise made visible: a sale, an online order, a booking and an invoice
-- in one list because they were always one record underneath.
create or replace function customer_history(p_customer uuid)
returns table (
  kind text,
  reference text,
  happened_at timestamptz,
  amount numeric,
  status text
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select 'Sale', s.receipt_number, s.occurred_at, s.total, s.status::text
  from sale s where s.customer_id = p_customer
  union all
  select 'Online order', left(o.id::text, 8), o.placed_at, o.total, o.status::text
  from shop_order o where o.customer_id = p_customer
  union all
  select 'Booking',
         coalesce((select ci.name from catalogue_item ci where ci.id = b.item_id), 'Service'),
         coalesce(b.scheduled_start, b.created_at), b.price_quoted, b.status::text
  from service_booking b where b.customer_id = p_customer
  union all
  select initcap(replace(d.type::text, '_', ' ')), d.number, d.issued_at, d.total, d.status::text
  from document d where d.customer_id = p_customer and d.number is not null
  order by happened_at desc nulls last
  limit 100;
$fn$;

revoke all on function business_customers(uuid, text) from public, anon, authenticated;
revoke all on function customer_history(uuid) from public, anon, authenticated;
grant execute on function business_customers(uuid, text) to service_role;
grant execute on function customer_history(uuid) to service_role;
