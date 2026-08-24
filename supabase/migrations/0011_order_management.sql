-- AscendSME Connected Platform. Migration 0011: Shop order management.
-- Owners confirm, progress, fulfil and cancel orders (SHP-010). Stock
-- reservations are released or converted at the right transition so the
-- inventory ledger stays truthful (SHP-018, POS-INV-012), and each
-- transition publishes its own business event.

-- Allowed transitions. Anything not listed is rejected by the service.
create or replace function shop_order_can_transition(p_from order_status, p_to order_status)
returns boolean
language sql immutable
as $$
  select (p_from, p_to) in (
    ('pending', 'confirmed'),
    ('pending', 'cancelled'),
    ('confirmed', 'preparing'),
    ('confirmed', 'cancelled'),
    ('preparing', 'ready'),
    ('preparing', 'cancelled'),
    ('ready', 'out_for_delivery'),
    ('ready', 'fulfilled'),
    ('ready', 'cancelled'),
    ('out_for_delivery', 'fulfilled'),
    ('out_for_delivery', 'cancelled'),
    ('fulfilled', 'refunded')
  );
$$;

-- ---------------------------------------------------------------------------
-- advance_shop_order: one atomic, idempotent transition.
--
-- Reservation handling:
--   fulfilled  -> release the reservation and commit a real sale movement,
--                 so stock on hand finally drops for the goods that left.
--   cancelled  -> release the reservation only; nothing left the shelf.
--   refunded   -> return the goods to stock via a customer_return movement.
-- Movements carry deterministic client_refs so a retried call is a no-op.
-- ---------------------------------------------------------------------------
create or replace function advance_shop_order(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_order shop_order%rowtype;
  v_to order_status := (p->>'to_status')::order_status;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_line record;
  v_event text;
  v_verification text := 'merchant_declared';
begin
  select * into v_order from shop_order where id = (p->>'order_id')::uuid for update;
  if not found then
    raise exception 'order not found';
  end if;

  -- Idempotent: a repeated call that lands on the current state is accepted.
  if v_order.status = v_to then
    return jsonb_build_object('order_id', v_order.id, 'status', v_to, 'unchanged', true);
  end if;

  if not shop_order_can_transition(v_order.status, v_to) then
    raise exception 'illegal transition: % to %', v_order.status, v_to;
  end if;

  update shop_order set status = v_to, updated_at = now() where id = v_order.id;

  -- Stock consequences per destination state.
  if v_to in ('fulfilled', 'cancelled', 'refunded') then
    for v_line in
      select l.item_id, l.variant_id, l.quantity, ci.track_stock
      from shop_order_line l
      join catalogue_item ci on ci.id = l.item_id
      where l.order_id = v_order.id
    loop
      if not v_line.track_stock or v_order.location_id is null then
        continue;
      end if;

      if v_to in ('fulfilled', 'cancelled') then
        -- Release the hold in both cases; the goods either leave for real
        -- (below) or return to being sellable.
        insert into stock_movement (
          client_ref, business_id, location_id, item_id, variant_id,
          kind, quantity, source_entity_type, source_entity_id,
          actor_membership_id, occurred_at
        ) values (
          v_order.id::text || ':rel:' || v_line.item_id,
          v_order.business_id, v_order.location_id, v_line.item_id, v_line.variant_id,
          'reservation_release', v_line.quantity,
          'shop_order', v_order.id, v_actor, now()
        ) on conflict (client_ref) do nothing;
      end if;

      if v_to = 'fulfilled' then
        insert into stock_movement (
          client_ref, business_id, location_id, item_id, variant_id,
          kind, quantity, source_entity_type, source_entity_id,
          actor_membership_id, occurred_at
        ) values (
          v_order.id::text || ':sale:' || v_line.item_id,
          v_order.business_id, v_order.location_id, v_line.item_id, v_line.variant_id,
          'sale', -1 * v_line.quantity,
          'shop_order', v_order.id, v_actor, now()
        ) on conflict (client_ref) do nothing;
      elsif v_to = 'refunded' then
        insert into stock_movement (
          client_ref, business_id, location_id, item_id, variant_id,
          kind, quantity, source_entity_type, source_entity_id,
          reason, actor_membership_id, occurred_at
        ) values (
          v_order.id::text || ':ret:' || v_line.item_id,
          v_order.business_id, v_order.location_id, v_line.item_id, v_line.variant_id,
          'customer_return', v_line.quantity,
          'shop_order', v_order.id,
          coalesce(p->>'reason', 'order refunded'), v_actor, now()
        ) on conflict (client_ref) do nothing;
      end if;
    end loop;
  end if;

  -- Financial consequence: fulfilment recognises revenue, refund reverses it.
  if v_to = 'fulfilled' then
    insert into ledger_entry (
      business_id, location_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_order.business_id, v_order.location_id, 'sale_revenue',
      v_order.total, v_order.currency_code, 'shop_order', v_order.id, current_date
    );
  elsif v_to = 'refunded' then
    insert into ledger_entry (
      business_id, location_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_order.business_id, v_order.location_id, 'refund',
      -1 * v_order.total, v_order.currency_code, 'shop_order', v_order.id, current_date
    );
  end if;

  v_event := case v_to
    when 'fulfilled' then 'shop.order.fulfilled'
    when 'cancelled' then 'shop.order.cancelled'
    when 'refunded' then 'shop.order.refunded'
    else 'shop.order.progressed'
  end;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, payload, business_date
  ) values (
    v_event, v_order.business_id, v_order.location_id, v_actor,
    'business_web', 'shop', 'shop_order', v_order.id,
    v_order.total, v_order.currency_code, v_verification,
    jsonb_build_object('from', v_order.status, 'to', v_to),
    current_date
  );

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_order.business_id, v_actor, 'shop_order.' || v_to, 'shop_order', v_order.id,
    jsonb_build_object('from', v_order.status, 'to', v_to, 'reason', p->>'reason')
  );

  return jsonb_build_object('order_id', v_order.id, 'status', v_to, 'unchanged', false);
end;
$$;
