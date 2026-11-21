-- ---------------------------------------------------------------------------
-- 0128  Inventory Core I3: returns with a condition
--
-- INVENTORY_CORE_PLAN.md, step I3 and decision 5 (approved 21 Nov 2026).
-- Every return used to go back on the shelf, so spoiled rice refunded at the
-- counter came back as sellable stock. Now what came back decides:
--
--   restock        back on the shelf (the default, and what every till that
--                  has not been updated still sends)
--   damaged        recorded as returned and written off in the same moment,
--                  'Returned damaged: <reason>', so the loss is visible to
--                  the owner and later to the Risk desk (I5)
--   not_returned   nothing came back: no stock movement at all
--
-- The cashier holding the goods says which, so it travels with the refund
-- request (approval_request.return_condition), and decide_approval hands it
-- to execute_sale_reversal when the owner approves. A refunded shop order
-- takes the same choice through advance_shop_order (no screen sends one
-- yet; refunds on shop orders arrive with Paystack).
--
-- Each function is its latest definition with counted substitutions:
-- request_sale_refund (0031), execute_sale_reversal (0070), decide_approval
-- (0077), advance_shop_order (0070).
--
-- Tables and columns read: approval_request (0004, + return_condition),
-- sale, sale_line, catalogue_item (track_stock), stock_movement, shop_order,
-- shop_order_line, as in the definitions named above.
-- ---------------------------------------------------------------------------

alter table approval_request add column if not exists return_condition text;
alter table approval_request drop constraint if exists approval_request_return_condition_check;
alter table approval_request add constraint approval_request_return_condition_check
  check (return_condition is null or return_condition in ('restock', 'damaged', 'not_returned'));

-- request_sale_refund (latest definition was 0031_pos_refunds_discounts.sql)
create or replace function request_sale_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sale sale%rowtype;
  v_existing approval_request%rowtype;
  v_approval uuid;
  v_condition text := coalesce(nullif(p->>'return_condition', ''), 'restock');
begin
  if v_condition not in ('restock', 'damaged', 'not_returned') then
    raise exception 'return_condition_invalid';
  end if;
  select * into v_sale from sale where id = (p->>'sale_id')::uuid;
  if not found then
    raise exception 'sale_not_found';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'sale_not_refundable';
  end if;

  -- One open request per sale. A cashier tapping twice under pressure must
  -- not queue two refunds of the same money.
  select * into v_existing from approval_request
  where source_entity_type = 'sale' and source_entity_id = v_sale.id
    and kind = 'refund' and status = 'requested';
  if found then
    return jsonb_build_object('approval_id', v_existing.id, 'duplicate', true);
  end if;

  insert into approval_request (
    business_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, requested_by, status, note, return_condition
  ) values (
    v_sale.business_id, 'refund', v_sale.total, v_sale.currency_code,
    'sale', v_sale.id,
    nullif(p->>'requested_by', '')::uuid, 'requested',
    p->>'reason', v_condition
  )
  returning id into v_approval;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, payload, business_date
  ) values (
    'pos.refund.requested', v_sale.business_id, v_sale.location_id,
    nullif(p->>'requested_by', '')::uuid,
    'pos_terminal', 'pos', 'approval_request', v_approval,
    v_sale.total, v_sale.currency_code,
    jsonb_build_object('sale', v_sale.receipt_number, 'reason', p->>'reason', 'return_condition', v_condition),
    current_date
  );

  return jsonb_build_object('approval_id', v_approval, 'duplicate', false);
end;
$$;

-- execute_sale_reversal (latest definition was 0070_idempotency_keys_per_business.sql)
create or replace function execute_sale_reversal(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sale sale%rowtype;
  v_reversal uuid;
  v_line record;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_condition text := coalesce(nullif(p->>'return_condition', ''), 'restock');
  v_note text := nullif(btrim(coalesce(p->>'reason', '')), '');
begin
  if v_condition not in ('restock', 'damaged', 'not_returned') then
    raise exception 'return_condition_invalid';
  end if;
  select * into v_sale from sale where id = (p->>'sale_id')::uuid for update;
  if not found then
    raise exception 'sale_not_found';
  end if;
  if v_sale.status = 'reversed' then
    return jsonb_build_object('sale_id', v_sale.id, 'duplicate', true);
  end if;

  insert into sale (
    client_ref, business_id, location_id, device_id, shift_id,
    cashier_membership_id, customer_id, status,
    subtotal, discount_total, tax_total, total, currency_code,
    note, receipt_number, reversal_of, occurred_at, business_date
  ) values (
    'reversal:' || v_sale.id::text,
    v_sale.business_id, v_sale.location_id, v_sale.device_id, v_sale.shift_id,
    v_actor, v_sale.customer_id, 'completed',
    -1 * v_sale.subtotal, -1 * v_sale.discount_total, -1 * v_sale.tax_total,
    -1 * v_sale.total, v_sale.currency_code,
    'Reversal of ' || v_sale.receipt_number,
    v_sale.receipt_number || '-R',
    v_sale.id,
    now(), current_date
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_reversal;

  if v_reversal is null then
    select id into v_reversal from sale where client_ref = 'reversal:' || v_sale.id::text and business_id = v_sale.business_id;
    return jsonb_build_object('sale_id', v_sale.id, 'reversal_id', v_reversal, 'duplicate', true);
  end if;

  -- The original is marked reversed but its content is untouched.
  update sale set status = 'reversed' where id = v_sale.id;

  -- Goods follow what came back (Inventory Core I3): back on the shelf;
  -- damaged, recorded as returned and written off in the same moment so the
  -- loss is visible; or nothing came back, and the stock does not move.
  for v_line in
    select l.item_id, l.variant_id, l.quantity, l.description, ci.track_stock
    from sale_line l
    join catalogue_item ci on ci.id = l.item_id
    where l.sale_id = v_sale.id
  loop
    if v_line.track_stock and v_condition <> 'not_returned' then
      insert into stock_movement (
        client_ref, business_id, location_id, item_id, variant_id,
        kind, quantity, reason, source_entity_type, source_entity_id,
        actor_membership_id, occurred_at
      ) values (
        'reversal:' || v_sale.id::text || ':' || v_line.item_id,
        v_sale.business_id, v_sale.location_id, v_line.item_id, v_line.variant_id,
        'customer_return', v_line.quantity,
        'sale reversed', 'sale', v_reversal, v_actor, now()
      ) on conflict (business_id, client_ref) do nothing;
      if v_condition = 'damaged' then
        insert into stock_movement (
          client_ref, business_id, location_id, item_id, variant_id,
          kind, quantity, reason, source_entity_type, source_entity_id,
          actor_membership_id, occurred_at
        ) values (
          'reversal:' || v_sale.id::text || ':' || v_line.item_id || ':damaged',
          v_sale.business_id, v_sale.location_id, v_line.item_id, v_line.variant_id,
          'damage_loss', -1 * v_line.quantity,
          'Returned damaged' || coalesce(': ' || v_note, ''), 'sale', v_reversal, v_actor, now()
        ) on conflict (business_id, client_ref) do nothing;
      end if;
    end if;
  end loop;

  insert into ledger_entry (
    business_id, location_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, business_date
  ) values (
    v_sale.business_id, v_sale.location_id, 'refund',
    -1 * v_sale.total, v_sale.currency_code, 'sale', v_reversal, current_date
  );

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, correction_of, payload, business_date
  ) values (
    'pos.sale.reversed', v_sale.business_id, v_sale.location_id, v_actor,
    'business_mobile', 'pos', 'sale', v_reversal,
    v_sale.total, v_sale.currency_code, 'merchant_declared', null,
    jsonb_build_object('reversal_of', v_sale.receipt_number, 'return_condition', v_condition),
    current_date
  );

  return jsonb_build_object('sale_id', v_sale.id, 'reversal_id', v_reversal, 'duplicate', false);
end;
$$;

-- decide_approval (latest definition was 0077_high_risk_actions_checked_in_the_database.sql)
create or replace function decide_approval(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_request approval_request%rowtype;
  v_decider uuid := (p->>'decider_membership_id')::uuid;
  v_approved boolean := coalesce((p->>'approved')::boolean, false);
  v_expense expense%rowtype;
begin
  select * into v_request from approval_request
  where id = (p->>'approval_id')::uuid
  for update;

  if not found then
    raise exception 'approval_not_found';
  end if;

  -- 0077: deciding is a permission, checked here as well as at the route.
  -- Refunds, voids and discounts move money and need refunds.approve; everything
  -- else needs approvals.decide.
  perform require_permission(
    v_decider, v_request.business_id,
    case when v_request.kind in ('refund', 'void', 'discount')
         then array['refunds.approve']
         else array['approvals.decide'] end
  );
  if v_request.status <> 'requested' then
    raise exception 'already_decided';
  end if;
  if v_request.requested_by = v_decider then
    raise exception 'cannot_approve_own_request';
  end if;

  update approval_request
  set status = case when v_approved then 'approved'::approval_status else 'rejected'::approval_status end,
      decided_by = v_decider,
      decided_at = now(),
      note = coalesce(p->>'note', note)
  where id = v_request.id;

  if v_approved and v_request.kind = 'expense' then
    select * into v_expense from expense where approval_id = v_request.id;
    if found then
      insert into ledger_entry (
        business_id, location_id, kind, amount, currency_code,
        source_entity_type, source_entity_id, business_date
      ) values (
        v_expense.business_id, v_expense.location_id, 'expense',
        -1 * v_expense.amount, v_expense.currency_code,
        'expense', v_expense.id, v_expense.business_date
      );
    end if;
  end if;

  -- An approved refund is performed here, not left as a note for someone to
  -- action later and forget.
  if v_approved and v_request.kind = 'refund'
     and v_request.source_entity_type = 'sale' then
    perform execute_sale_reversal(jsonb_build_object(
      'sale_id', v_request.source_entity_id,
      'actor_membership_id', v_decider,
      'return_condition', coalesce(v_request.return_condition, 'restock'),
      'reason', v_request.note
    ));
  end if;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_request.business_id, v_decider,
    case when v_approved then 'approval.approved' else 'approval.rejected' end,
    'approval_request', v_request.id,
    jsonb_build_object('kind', v_request.kind, 'amount', v_request.amount)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'office.approval.decided', v_request.business_id, v_decider,
    'business_mobile', 'office', 'approval_request', v_request.id,
    v_request.amount, v_request.currency_code, 'merchant_declared',
    jsonb_build_object('kind', v_request.kind, 'approved', v_approved),
    current_date
  );

  return jsonb_build_object('approval_id', v_request.id, 'approved', v_approved);
end;
$$;

-- advance_shop_order (latest definition was 0070_idempotency_keys_per_business.sql)
create or replace function advance_shop_order(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_order shop_order%rowtype;
  v_to order_status := (p->>'to_status')::order_status;
  v_condition text := coalesce(nullif(p->>'return_condition', ''), 'restock');
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
  if v_condition not in ('restock', 'damaged', 'not_returned') then
    raise exception 'return_condition_invalid';
  end if;

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
        ) on conflict (business_id, client_ref) do nothing;
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
        ) on conflict (business_id, client_ref) do nothing;
      elsif v_to = 'refunded' and v_condition <> 'not_returned' then
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
        ) on conflict (business_id, client_ref) do nothing;
        if v_condition = 'damaged' then
          insert into stock_movement (
            client_ref, business_id, location_id, item_id, variant_id,
            kind, quantity, source_entity_type, source_entity_id,
            reason, actor_membership_id, occurred_at
          ) values (
            v_order.id::text || ':dmg:' || v_line.item_id,
            v_order.business_id, v_order.location_id, v_line.item_id, v_line.variant_id,
            'damage_loss', -1 * v_line.quantity,
            'shop_order', v_order.id,
            'Returned damaged' || coalesce(': ' || nullif(btrim(coalesce(p->>'reason', '')), ''), ''), v_actor, now()
          ) on conflict (business_id, client_ref) do nothing;
        end if;
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
