-- ---------------------------------------------------------------------------
-- 0143  Shop settings for the customer side (Modules round 2, R3)
--
-- The improved storefront tells a customer, before they order, how they get
-- it and what it costs: "Free pickup, ready in 2 hours", "Accra delivery,
-- same day, GHS 30, order before 3pm", "7-day returns". None of that was a
-- setting, and a delivery order was charged no delivery fee at all
-- (decision 1). The owner also writes one promotion for the storefront
-- (decision 5).
--
-- One row per business. A business with no row keeps exactly what it had:
-- pickup and delivery both offered, no fee. Nothing changes for a shop
-- until its owner saves settings.
--
-- The fee is decided here, never by the browser: the order names an area,
-- the area's fee comes from the settings, and the order's total is the
-- items plus that fee. The commerce core (0083) and the receipt (0052)
-- already carry delivery_fee through.
-- ---------------------------------------------------------------------------

create table if not exists shop_settings (
  business_id uuid primary key references business(id),

  -- Pickup
  pickup_enabled boolean not null default true,
  -- "Ready in 2 hours". Null when the shop does not promise a time.
  pickup_ready_minutes int check (pickup_ready_minutes is null or pickup_ready_minutes between 5 and 10080),

  -- Delivery
  delivery_enabled boolean not null default true,
  -- [{"name": "Accra", "fee": 30}, {"name": "Tema", "fee": 50}]
  delivery_areas jsonb not null default '[]'::jsonb,
  -- Orders before this time are delivered the same day. Null: no promise.
  delivery_cutoff time,
  -- Who delivers and anything else the customer should know.
  delivery_note text check (delivery_note is null or length(delivery_note) <= 160),

  -- Returns. Days null means no returns line is shown.
  returns_days int check (returns_days is null or returns_days between 0 and 90),
  returns_note text check (returns_note is null or length(returns_note) <= 200),

  -- How to reach the shop, said on the storefront.
  contact_line text check (contact_line is null or length(contact_line) <= 160),

  -- The one promotion on the storefront (decision 5).
  promo_headline text check (promo_headline is null or length(promo_headline) <= 60),
  promo_body text check (promo_body is null or length(promo_body) <= 160),
  promo_item_id uuid references catalogue_item(id),
  promo_until date,

  updated_at timestamptz not null default now(),

  constraint shop_settings_areas_check check (
    jsonb_typeof(delivery_areas) = 'array' and jsonb_array_length(delivery_areas) <= 20
  )
);

alter table shop_settings enable row level security;

drop policy if exists shop_settings_member_read on shop_settings;
create policy shop_settings_member_read on shop_settings
  for select using (is_business_member(business_id));

-- The fee for an area, or null when the shop does not deliver there.
create or replace function shop_delivery_fee(p_business uuid, p_area text)
returns numeric
language sql stable
as $$
  select round((a->>'fee')::numeric, 2)
    from shop_settings s, jsonb_array_elements(s.delivery_areas) a
   where s.business_id = p_business
     and lower(btrim(a->>'name')) = lower(btrim(coalesce(p_area, '')))
     and (a->>'fee') ~ '^[0-9]+(\.[0-9]{1,2})?$'
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- place_shop_order: as 0127, with how the order is fulfilled checked
-- against the shop's settings and the delivery fee added.
-- ---------------------------------------------------------------------------
create or replace function place_shop_order(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_client_ref text := p->>'client_ref';
  v_existing shop_order%rowtype;
  v_settings shop_settings%rowtype;
  v_fulfilment fulfilment_method := coalesce((p->>'fulfilment')::fulfilment_method, 'pickup');
  v_detail jsonb := coalesce(p->'delivery_detail', '{}'::jsonb);
  v_fee numeric(14,2) := 0;
  v_customer uuid;
  v_location uuid;
  v_order uuid;
  v_line jsonb;
  v_item record;
  v_unit numeric(14,2);
  v_qty numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_line_count int := 0;
  v_available numeric(14,3);
begin
  if v_client_ref is null then
    raise exception 'client_ref is required';
  end if;

  select * into v_existing from shop_order where client_ref = v_client_ref and business_id = v_business;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'duplicate', true);
  end if;

  -- How it reaches the customer, by the shop's own settings (R3). No row:
  -- both offered, no fee, as before.
  select * into v_settings from shop_settings where business_id = v_business;
  if found then
    if v_fulfilment = 'pickup' and not v_settings.pickup_enabled then
      raise exception 'pickup_unavailable';
    end if;
    if v_fulfilment <> 'pickup' then
      if not v_settings.delivery_enabled then
        raise exception 'delivery_unavailable';
      end if;
      if jsonb_array_length(v_settings.delivery_areas) > 0 then
        v_fee := shop_delivery_fee(v_business, v_detail->>'area');
        if v_fee is null then
          raise exception 'delivery_area_unknown';
        end if;
        v_detail := v_detail || jsonb_build_object('area',
          (select a->>'name' from jsonb_array_elements(v_settings.delivery_areas) a
            where lower(btrim(a->>'name')) = lower(btrim(v_detail->>'area')) limit 1),
          'fee', v_fee);
      end if;
    end if;
  end if;

  -- One shared customer record per business, matched on the normalised
  -- number rather than the raw one (CAP-003, 0064).
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
    v_fulfilment, v_detail,
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

    -- Never sell what is not there (Inventory Core decision 4).
    if v_item.track_stock and v_location is not null then
      perform 1 from catalogue_item where id = v_item.id for update;
      select coalesce(sum(quantity), 0) into v_available
        from stock_movement
       where business_id = v_business and location_id = v_location and item_id = v_item.id;
      if v_available < v_qty then
        raise exception 'not_enough_stock|%|%', trim_scale(greatest(v_available, 0)), v_item.name;
      end if;
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
      ) on conflict (business_id, client_ref) do nothing;
    end if;
  end loop;

  if v_line_count = 0 then
    raise exception 'order has no lines';
  end if;

  update shop_order
     set subtotal = v_subtotal, delivery_fee = v_fee, total = v_subtotal + v_fee
   where id = v_order;

  -- Customer placed this order themselves: customer-confirmed evidence (RDY-008).
  insert into event_outbox (
    event_type, business_id, location_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'shop.order.placed', v_business, v_location, 'customer_web', 'shop',
    'shop_order', v_order, v_subtotal + v_fee, 'GHS', 'customer_confirmed',
    jsonb_build_object('line_count', v_line_count, 'source', coalesce(p->>'source', 'shop_link'),
                       'delivery_fee', v_fee),
    current_date
  );

  return jsonb_build_object('order_id', v_order, 'total', v_subtotal + v_fee,
                            'delivery_fee', v_fee, 'duplicate', false);
end;
$$;
