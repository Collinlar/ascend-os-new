-- ---------------------------------------------------------------------------
-- 0144  The customer's shop: sizes, where to collect, and offers
--       (Modules round 2, R4)
--
-- Three things the improved storefront asks of an order that it could not
-- carry:
--
-- 1. Sizes (decision 6). The catalogue has had item_variant since 0002, a
--    name and a price difference, but nothing let an owner make one and an
--    order could not name one. set_item_variants lets the owner keep a
--    product's sizes; place_shop_order takes the size on each line, prices
--    it as the item's price plus the size's difference, and refuses a line
--    for a product with sizes that names none. Sizes share the product's
--    stock for now: counting each size separately is an Inventory change of
--    its own.
--
-- 2. Where to collect. A shop with more than one place lets the customer
--    pick. The order belongs to that place, and stock is checked and held
--    there, which is where the goods will leave from. Without a choice it
--    is the first place, as before.
--
-- 3. Offers. Checkout asks, unticked, whether the customer wants offers on
--    WhatsApp. A tick is recorded through record_consent (0066), with the
--    order as the evidence. Nothing is recorded when it is not ticked.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- set_item_variants: the owner keeps a product's sizes.
-- p: business_id, item_id, actor_membership_id,
--    sizes: [{ id?, name, price_delta }]
-- Sizes left out are switched off, never deleted: an order may name them.
-- ---------------------------------------------------------------------------
create or replace function set_item_variants(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_item catalogue_item%rowtype;
  v_size jsonb;
  v_id uuid;
  v_name text;
  v_delta numeric(14,2);
  v_keep uuid[] := '{}';
  v_names text[] := '{}';
begin
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business;
  if not found then raise exception 'item_not_found'; end if;
  perform require_permission(v_actor, v_business, array['catalogue.manage']);

  if jsonb_typeof(coalesce(p->'sizes', '[]'::jsonb)) <> 'array' then
    raise exception 'sizes_invalid';
  end if;
  if jsonb_array_length(coalesce(p->'sizes', '[]'::jsonb)) > 12 then
    raise exception 'too_many_sizes';
  end if;

  for v_size in select * from jsonb_array_elements(coalesce(p->'sizes', '[]'::jsonb))
  loop
    v_name := btrim(coalesce(v_size->>'name', ''));
    if v_name = '' then continue; end if;
    if length(v_name) > 40 then raise exception 'size_name_too_long'; end if;
    if lower(v_name) = any (v_names) then raise exception 'size_repeated|%', v_name; end if;
    v_names := v_names || lower(v_name);
    v_delta := coalesce(nullif(v_size->>'price_delta', '')::numeric, 0);
    if coalesce(v_item.base_price, 0) + v_delta < 0 then raise exception 'size_price_negative|%', v_name; end if;

    v_id := nullif(v_size->>'id', '')::uuid;
    if v_id is not null then
      update item_variant
         set name = v_name, price_delta = v_delta, active = true
       where id = v_id and item_id = v_item.id
      returning id into v_id;
    end if;
    if v_id is null then
      insert into item_variant (item_id, name, price_delta, active)
      values (v_item.id, v_name, v_delta, true)
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  update item_variant set active = false
   where item_id = v_item.id and active and not (id = any (v_keep));

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'catalogue.sizes.changed', 'catalogue_item', v_item.id,
          jsonb_build_object('item', v_item.name, 'sizes', to_jsonb(v_names)));

  return jsonb_build_object('item_id', v_item.id, 'sizes', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price_delta', price_delta) order by name), '[]'::jsonb)
      from item_variant where item_id = v_item.id and active));
end
$fn$;

revoke all on function set_item_variants(jsonb) from public, anon, authenticated;
grant execute on function set_item_variants(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- place_shop_order: as 0143, with a size per line, the pickup place, and
-- the offers opt-in.
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
  v_variant item_variant%rowtype;
  v_variant_id uuid;
  v_description text;
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

  -- How it reaches the customer, by the shop's own settings (0143).
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

  -- The place it is collected from, when the customer picked one; it must
  -- be one of this business's open places. Otherwise the first place.
  if v_fulfilment = 'pickup' and nullif(p->>'location_id', '') is not null then
    select id into v_location from location
     where id = (p->>'location_id')::uuid and business_id = v_business and active;
    if v_location is null then
      raise exception 'pickup_place_unknown';
    end if;
  else
    select id into v_location
      from location where business_id = v_business and active order by created_at limit 1;
  end if;

  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business,
    'name', p->>'customer_name',
    'phone', p->>'customer_phone',
    'email', p->>'customer_email',
    'created_via', 'shop'
  ))->>'customer_id', '')::uuid;

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

    -- The size: one of this item's own, switched on. A product with sizes
    -- needs one named (decision 6).
    v_variant_id := nullif(v_line->>'variant_id', '')::uuid;
    v_description := v_item.name;
    if v_variant_id is not null then
      select * into v_variant from item_variant where id = v_variant_id and item_id = v_item.id and active;
      if not found then
        raise exception 'size_unavailable|%', v_item.name;
      end if;
      v_unit := v_unit + v_variant.price_delta;
      v_description := v_item.name || ', ' || v_variant.name;
    elsif exists (select 1 from item_variant where item_id = v_item.id and active) then
      raise exception 'size_required|%', v_item.name;
    end if;

    -- Never sell what is not there (Inventory Core decision 4). Sizes share
    -- the item's stock, so every line of the item in this order counts.
    if v_item.track_stock and v_location is not null then
      perform 1 from catalogue_item where id = v_item.id for update;
      select coalesce(sum(quantity), 0) into v_available
        from stock_movement
       where business_id = v_business and location_id = v_location and item_id = v_item.id;
      if v_available < v_qty then
        raise exception 'not_enough_stock|%|%', trim_scale(greatest(v_available, 0)), v_item.name;
      end if;
    end if;

    insert into shop_order_line (order_id, item_id, variant_id, description, quantity, unit_price, line_total)
    values (v_order, v_item.id, v_variant_id, v_description, v_qty, v_unit, round(v_unit * v_qty, 2));

    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
    v_line_count := v_line_count + 1;

    if v_item.track_stock and v_location is not null then
      insert into stock_movement (
        client_ref, business_id, location_id, item_id, kind, quantity,
        source_entity_type, source_entity_id, occurred_at
      ) values (
        v_client_ref || ':rsv:' || v_item.id || coalesce(':' || v_variant_id::text, ''),
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

  -- Offers on WhatsApp, only when the customer ticked it at checkout.
  if coalesce((p->>'marketing_opt_in')::boolean, false) and v_customer is not null then
    perform record_consent(jsonb_build_object(
      'customer_id', v_customer,
      'business_id', v_business,
      'purpose', 'marketing',
      'granted', true,
      'channel', 'whatsapp',
      'source', 'shop_checkout',
      'evidence', jsonb_build_object('shop_order_id', v_order, 'asked', 'Send me offers on WhatsApp. You can stop anytime.')
    ));
  end if;

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
