-- AscendSME Connected Platform. Migration 0010: Shop storefront and order
-- placement. Customers complete a first order through a shared link without
-- any app or account (CHN-004, SHP-012, SHP-013). Orders use the shared
-- customer, catalogue, inventory and evidence records (SHP-007) and reserve
-- stock through movements (SHP-018).

-- Shareable shop identity: ascendsme.africa/s/{slug}
alter table business add column shop_slug text unique;

create or replace function slugify(p_name text)
returns text
language sql immutable
as $$
  select trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
$$;

-- Backfill any existing businesses.
update business
set shop_slug = slugify(name) || '-' || substr(id::text, 1, 4)
where shop_slug is null;

-- Double-tap protection on order placement.
alter table shop_order add column client_ref text unique;

-- create_business now also claims a shop slug.
create or replace function create_business(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_person uuid := (p->>'person_id')::uuid;
  v_entry text := coalesce(p->>'entry_product_set', 'pos');
  v_business uuid;
  v_location uuid;
  v_owner_role uuid;
  v_membership uuid;
  v_slug text;
  r record;
begin
  if v_person is null then
    raise exception 'person_id is required';
  end if;
  if not exists (select 1 from product_set where key = v_entry) then
    raise exception 'unknown entry product set: %', v_entry;
  end if;

  insert into business (name, country_code, archetype, onboarding_source)
  values (
    p->>'name',
    coalesce(p->>'country_code', 'GH'),
    p->>'archetype',
    coalesce(p->'onboarding_source', '{}'::jsonb)
  )
  returning id into v_business;

  -- Claim a readable slug; fall back to an id suffix on collision.
  v_slug := slugify(p->>'name');
  if v_slug is null or v_slug = '' or exists (select 1 from business where shop_slug = v_slug) then
    v_slug := coalesce(nullif(v_slug, ''), 'shop') || '-' || substr(v_business::text, 1, 4);
  end if;
  update business set shop_slug = v_slug where id = v_business;

  insert into location (business_id, name, city)
  values (v_business, coalesce(p->>'location_name', 'Main location'), p->>'city')
  returning id into v_location;

  for r in select key, name, permissions from role where business_id is null
  loop
    insert into role (business_id, key, name, permissions)
    values (v_business, r.key, r.name, r.permissions)
    on conflict (business_id, key) do nothing;
  end loop;

  select id into v_owner_role from role where business_id = v_business and key = 'owner';

  insert into business_membership (business_id, person_id, role_id, status)
  values (v_business, v_person, v_owner_role, 'active')
  returning id into v_membership;

  insert into entitlement (business_id, product_set_key, source, status, grant_reason)
  values (v_business, v_entry, 'free_start', 'active', 'start_free_entry');

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, payload, business_date
  ) values (
    'business.created', v_business, v_membership, 'business_web', v_entry,
    'business', v_business,
    jsonb_build_object('archetype', p->>'archetype', 'entry_product_set', v_entry),
    current_date
  );

  insert into audit_log (business_id, actor_person_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_person, v_membership, 'business.created', 'business', v_business,
          jsonb_build_object('entry_product_set', v_entry));

  return jsonb_build_object(
    'business_id', v_business,
    'location_id', v_location,
    'membership_id', v_membership,
    'shop_slug', v_slug
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- place_shop_order: atomic, idempotent order placement from Customer Web.
-- Prices come from the shared catalogue on the server; the client's cart is
-- a claim, never the source of truth. Tracked items get reservation
-- movements released or converted at fulfilment (SHP-018).
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

  -- One shared customer record per business and phone (CAP-003).
  select id into v_customer
  from customer
  where business_id = v_business and phone_e164 = p->>'customer_phone';

  if v_customer is null then
    insert into customer (business_id, display_name, phone_e164, created_via)
    values (v_business, p->>'customer_name', p->>'customer_phone', 'shop')
    returning id into v_customer;
  end if;

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
