-- ---------------------------------------------------------------------------
-- 0127  Inventory Core I2: available to sell, and the shortage rule
--
-- INVENTORY_CORE_PLAN.md, step I2 and decision 4 (approved 21 Nov 2026).
--
-- 1. place_shop_order refuses more than is available on a counted product:
--    on hand at the shop's place minus open holds. The error names how many
--    are left and the product, 'not_enough_stock|<left>|<name>', so the
--    shop can say it plainly. Unchanged from 0070 otherwise (latest
--    definition), generated from it with two counted substitutions.
-- 2. catalogue_item.stock_enforcement (0002, never read until now) is held
--    to its three values, and set_stock_rule(p) changes it: 'none' (keep
--    selling, the default), 'soft' (the till warns) or 'hard' (the till
--    stops at zero while online). Owners and managers only, written to the
--    audit log. The till applies the rule itself: a sale made offline is
--    always accepted, whatever the rule.
--
-- Tables and columns read: catalogue_item (id, business_id, name,
-- track_stock, stock_enforcement), stock_movement (business_id,
-- location_id, item_id, quantity), audit_log (0001), require_permission
-- (0081). Live: every product is 'none' today.
-- ---------------------------------------------------------------------------

-- place_shop_order (latest definition was 0070_idempotency_keys_per_business.sql)
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
  v_available numeric(14,3);
begin
  if v_client_ref is null then
    raise exception 'client_ref is required';
  end if;

  select * into v_existing from shop_order where client_ref = v_client_ref and business_id = v_business;
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

    -- Never sell what is not there (Inventory Core decision 4). Available is
    -- every movement at this place summed, holds included, so two open
    -- orders cannot both take the last one. The item row is locked first:
    -- two customers ordering it at the same moment are taken one at a time.
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

alter table catalogue_item drop constraint if exists catalogue_item_stock_enforcement_check;
alter table catalogue_item add constraint catalogue_item_stock_enforcement_check
  check (stock_enforcement in ('none', 'soft', 'hard'));

create or replace function set_stock_rule(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_rule text := p->>'rule';
  v_item catalogue_item%rowtype;
begin
  if v_rule is null or v_rule not in ('none', 'soft', 'hard') then
    raise exception 'rule_invalid';
  end if;
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid and business_id = v_business;
  if not found then raise exception 'item_not_found'; end if;
  perform require_permission(v_actor, v_business, array['inventory.manage']);

  if v_item.stock_enforcement = v_rule then
    return jsonb_build_object('item_id', v_item.id, 'rule', v_rule, 'changed', false);
  end if;
  update catalogue_item set stock_enforcement = v_rule, updated_at = now() where id = v_item.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'inventory.stock_rule.changed', 'catalogue_item', v_item.id,
          jsonb_build_object('item', v_item.name, 'from', v_item.stock_enforcement, 'to', v_rule));

  return jsonb_build_object('item_id', v_item.id, 'rule', v_rule, 'changed', true);
end
$fn$;

revoke all on function set_stock_rule(jsonb) from public, anon, authenticated;
grant execute on function set_stock_rule(jsonb) to service_role;
