-- AscendSME Connected Platform. Migration 0035: putting stock in
-- (POS-INV-001, POS-INV-005, POS-INV-012).
--
-- Sales already write stock movements, and the balance view already derives
-- what is on the shelf. What was missing was every way stock arrives: an
-- opening count when a merchant starts, goods coming in from a supplier,
-- breakage and theft written down honestly, and a stocktake correcting the
-- record to what was actually counted.
--
-- Without these the balance could only ever fall, so a shop that turned
-- tracking on watched its stock go negative and its low stock warnings
-- fire on everything.
--
-- Nothing here overwrites a balance. A stocktake posts the difference
-- between what the system believed and what was counted, so the history
-- still shows what happened and when (POS-INV-012).

-- ---------------------------------------------------------------------------
-- record_stock_movement: one way in, for every kind of arrival.
-- ---------------------------------------------------------------------------
create or replace function record_stock_movement(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_kind movement_kind := (p->>'kind')::movement_kind;
  v_item catalogue_item%rowtype;
  v_business uuid := (p->>'business_id')::uuid;
  v_location uuid := (p->>'location_id')::uuid;
  v_reason text := nullif(trim(coalesce(p->>'reason', '')), '');
  v_counted numeric(14,3);
  v_current numeric(14,3);
  v_quantity numeric(14,3);
  v_client_ref text := nullif(p->>'client_ref', '');
  v_id uuid;
begin
  select * into v_item from catalogue_item where id = (p->>'item_id')::uuid;
  if not found or v_item.business_id <> v_business then
    raise exception 'item_not_found';
  end if;

  -- Only these arrive through this door. Sales, returns and transfers are
  -- written by the flows that own them.
  if v_kind not in ('opening_balance', 'restock', 'damage_loss', 'count_correction') then
    raise exception 'unsupported_movement_kind';
  end if;

  -- Writing stock off, or overriding a count, needs a stated reason: these
  -- are the two movements that hide theft if left unexplained (POS-INV-005).
  if v_kind in ('damage_loss', 'count_correction') and v_reason is null then
    raise exception 'reason_required';
  end if;

  if v_kind = 'count_correction' then
    -- The caller sends what they counted, not a delta. The difference is
    -- computed here so the balance lands exactly on the counted figure
    -- without the record ever being overwritten.
    v_counted := (p->>'counted_quantity')::numeric;
    if v_counted is null or v_counted < 0 then
      raise exception 'counted_quantity_required';
    end if;
    select coalesce(sum(quantity), 0) into v_current
    from stock_movement
    where business_id = v_business and location_id = v_location
      and item_id = v_item.id
      and kind not in ('reservation', 'reservation_release');
    v_quantity := v_counted - v_current;

    -- A count that agrees with the record is worth nothing to store.
    if v_quantity = 0 then
      return jsonb_build_object('movement_id', null, 'quantity', 0, 'no_change', true);
    end if;
  else
    v_quantity := (p->>'quantity')::numeric;
    if v_quantity is null or v_quantity = 0 then
      raise exception 'quantity_required';
    end if;
    -- Loss is always a reduction, however the caller phrased it.
    if v_kind = 'damage_loss' then
      v_quantity := -abs(v_quantity);
    else
      v_quantity := abs(v_quantity);
    end if;
  end if;

  insert into stock_movement (
    client_ref, business_id, location_id, item_id,
    kind, quantity, unit_cost, reason,
    actor_membership_id, occurred_at
  ) values (
    v_client_ref, v_business, v_location, v_item.id,
    v_kind, v_quantity, nullif(p->>'unit_cost', '')::numeric, v_reason,
    nullif(p->>'actor_membership_id', '')::uuid, now()
  )
  on conflict (client_ref) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from stock_movement where client_ref = v_client_ref;
    return jsonb_build_object('movement_id', v_id, 'duplicate', true);
  end if;

  -- Receiving stock is the moment an item becomes worth tracking. A
  -- merchant who counts their goods in should not also have to find a
  -- switch before the till shows the number.
  if v_kind in ('opening_balance', 'restock') and not v_item.track_stock then
    update catalogue_item set track_stock = true, updated_at = now()
    where id = v_item.id;
  end if;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    verification, payload, business_date
  ) values (
    'inventory.movement.recorded', v_business, v_location,
    nullif(p->>'actor_membership_id', '')::uuid,
    'business_mobile', 'pos', 'stock_movement', v_id,
    'merchant_declared',
    jsonb_build_object('kind', v_kind, 'quantity', v_quantity, 'item', v_item.name),
    current_date
  );

  return jsonb_build_object('movement_id', v_id, 'quantity', v_quantity, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- business_stock_levels: what the products screen shows.
--
-- Every active item with its price, barcode and what is on the shelf at
-- one location, including the items nobody is tracking yet.
-- ---------------------------------------------------------------------------
create or replace function business_stock_levels(p_business uuid, p_location uuid)
returns table (
  item_id uuid,
  name text,
  category text,
  base_price numeric,
  barcode text,
  track_stock boolean,
  active boolean,
  low_stock_threshold numeric,
  quantity_on_hand numeric,
  last_movement_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    ci.id, ci.name, ci.category, ci.base_price, ci.barcode,
    ci.track_stock, ci.active, ci.low_stock_threshold,
    coalesce(sb.quantity_on_hand, 0),
    sb.last_movement_at
  from catalogue_item ci
  left join stock_balance sb
    on sb.item_id = ci.id
   and sb.location_id = p_location
   and sb.variant_id is null
  where ci.business_id = p_business
  order by ci.active desc, ci.name;
$$;

-- ---------------------------------------------------------------------------
-- update_catalogue_item: price, barcode, tracking and whether it still sells.
--
-- A barcode has to be unique inside a business, or a scan is ambiguous and
-- the till rings up whichever row it happened to find first.
-- ---------------------------------------------------------------------------
create or replace function update_catalogue_item(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
begin
  select * into v_item from catalogue_item
  where id = (p->>'item_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'item_not_found';
  end if;

  if v_barcode is not null and exists (
    select 1 from catalogue_item
    where business_id = v_item.business_id
      and id <> v_item.id
      and barcode = v_barcode
  ) then
    raise exception 'barcode_taken';
  end if;

  update catalogue_item
  set base_price = coalesce(nullif(p->>'base_price', '')::numeric, base_price),
      barcode = case when p ? 'barcode' then v_barcode else barcode end,
      track_stock = coalesce((p->>'track_stock')::boolean, track_stock),
      active = coalesce((p->>'active')::boolean, active),
      low_stock_threshold = case
        when p ? 'low_stock_threshold'
        then nullif(p->>'low_stock_threshold', '')::numeric
        else low_stock_threshold
      end,
      updated_at = now()
  where id = v_item.id;

  return jsonb_build_object('item_id', v_item.id);
end;
$$;

-- Barcodes are looked up on every scan, and must not collide in a business.
create unique index if not exists catalogue_barcode_unique
  on catalogue_item(business_id, barcode)
  where barcode is not null;

-- Keep the posture set by migration 0034 for these new functions.
revoke all on function record_stock_movement(jsonb) from public, anon, authenticated;
revoke all on function business_stock_levels(uuid, uuid) from public, anon, authenticated;
revoke all on function update_catalogue_item(jsonb) from public, anon, authenticated;
grant execute on function record_stock_movement(jsonb) to service_role;
grant execute on function business_stock_levels(uuid, uuid) to service_role;
grant execute on function update_catalogue_item(jsonb) to service_role;
