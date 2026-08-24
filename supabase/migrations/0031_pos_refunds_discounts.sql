-- AscendSME Connected Platform. Migration 0031: till-side refunds and
-- discount approval (POS-009, POS-017).
--
-- The design makes an important distinction that a naive build gets wrong:
-- a cashier *requests* a refund, they do not perform one. The same is true
-- of a discount beyond the owner's limit. Money leaving the drawer, or a
-- price being cut, is the owner's decision even when the customer is
-- standing there.
--
-- Corrections go through reversal and reissue, never destructive editing
-- (POS-017): the original sale stays exactly as it was.

-- The owner's own limits. Below the discount threshold a cashier may act;
-- at or above it, someone else decides.
insert into approval_rule (business_id, kind, threshold_amount, approver_role)
select id, 'refund', 0, 'manager' from business
on conflict (business_id, kind, location_id) do nothing;

insert into approval_rule (business_id, kind, threshold_amount, approver_role)
select id, 'discount', 10, 'manager' from business
on conflict (business_id, kind, location_id) do nothing;

-- ---------------------------------------------------------------------------
-- request_sale_refund: raise it, do not do it.
-- ---------------------------------------------------------------------------
create or replace function request_sale_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sale sale%rowtype;
  v_existing approval_request%rowtype;
  v_approval uuid;
begin
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
    source_entity_type, source_entity_id, requested_by, status, note
  ) values (
    v_sale.business_id, 'refund', v_sale.total, v_sale.currency_code,
    'sale', v_sale.id,
    nullif(p->>'requested_by', '')::uuid, 'requested',
    p->>'reason'
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
    jsonb_build_object('sale', v_sale.receipt_number, 'reason', p->>'reason'),
    current_date
  );

  return jsonb_build_object('approval_id', v_approval, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- execute_sale_reversal: what an approved refund actually does.
--
-- The original sale is never edited. A reversing sale is written against
-- it, stock comes back, and the money is posted as a refund rather than as
-- negative revenue.
-- ---------------------------------------------------------------------------
create or replace function execute_sale_reversal(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sale sale%rowtype;
  v_reversal uuid;
  v_line record;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
begin
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
  on conflict (client_ref) do nothing
  returning id into v_reversal;

  if v_reversal is null then
    select id into v_reversal from sale where client_ref = 'reversal:' || v_sale.id::text;
    return jsonb_build_object('sale_id', v_sale.id, 'reversal_id', v_reversal, 'duplicate', true);
  end if;

  -- The original is marked reversed but its content is untouched.
  update sale set status = 'reversed' where id = v_sale.id;

  -- Goods come back to the shelf.
  for v_line in
    select l.item_id, l.variant_id, l.quantity, l.description, ci.track_stock
    from sale_line l
    join catalogue_item ci on ci.id = l.item_id
    where l.sale_id = v_sale.id
  loop
    if v_line.track_stock then
      insert into stock_movement (
        client_ref, business_id, location_id, item_id, variant_id,
        kind, quantity, reason, source_entity_type, source_entity_id,
        actor_membership_id, occurred_at
      ) values (
        'reversal:' || v_sale.id::text || ':' || v_line.item_id,
        v_sale.business_id, v_sale.location_id, v_line.item_id, v_line.variant_id,
        'customer_return', v_line.quantity,
        'sale reversed', 'sale', v_reversal, v_actor, now()
      ) on conflict (client_ref) do nothing;
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
    jsonb_build_object('reversal_of', v_sale.receipt_number),
    current_date
  );

  return jsonb_build_object('sale_id', v_sale.id, 'reversal_id', v_reversal, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_approval learns about refunds: approving one performs the reversal
-- in the same transaction, so an approval can never be recorded without the
-- money actually going back.
-- ---------------------------------------------------------------------------
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
      'actor_membership_id', v_decider
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
