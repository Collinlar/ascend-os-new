-- 0122: who allowed a discount at the till.
--
-- D4d lets a till take a discount off a sale. A cashier cannot give one on
-- their own: an owner or manager signed in at the till can, or types their
-- PIN on it to allow the cashier's. The sale records who that was, because
-- a discount is money the business chose not to take and the owner should
-- be able to see who chose.
--
-- complete_pos_sale is 0070's, with three things added: the column filled
-- in (only for someone who belongs to this business, and only when there is
-- a discount), and a refusal of a negative discount or one larger than the
-- sale. Nothing else changes.

alter table sale
  add column if not exists discount_approved_by uuid references business_membership(id);

create or replace function complete_pos_sale(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_existing sale%rowtype;
  v_sale_id uuid;
  v_line jsonb;
  v_pay jsonb;
  v_business uuid := (p->>'business_id')::uuid;
  v_location uuid := (p->>'location_id')::uuid;
  v_client_ref text := p->>'client_ref';
  v_shift uuid := nullif(p->>'shift_id', '')::uuid;
  v_discount numeric := coalesce((p->>'discount_total')::numeric, 0);
  v_approver uuid := nullif(p->>'discount_approved_by', '')::uuid;
begin
  if v_client_ref is null then
    raise exception 'client_ref is required for idempotent completion';
  end if;

  select * into v_existing from sale where client_ref = v_client_ref and business_id = v_business;
  if found then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'receipt_number', v_existing.receipt_number,
      'duplicate', true
    );
  end if;

  -- A discount is never negative and never more than the sale. The till
  -- refuses both before it gets here; this is the backstop.
  if v_discount < 0 or v_discount > (p->>'subtotal')::numeric then
    raise exception 'invalid_discount';
  end if;

  -- Who allowed the discount, kept only if they belong to this business.
  -- A till cannot vouch for somebody else's staff.
  if v_approver is not null and not exists (
    select 1 from business_membership where id = v_approver and business_id = v_business
  ) then
    v_approver := null;
  end if;
  if v_discount = 0 then
    v_approver := null;
  end if;

  if v_shift is null and nullif(p->>'shift_client_ref', '') is not null then
    select id into v_shift from pos_shift where client_ref = p->>'shift_client_ref' and business_id = v_business;
    if v_shift is null then
      -- The shift has not arrived yet. Temporary by nature: the device will
      -- retry after its earlier outbox item lands.
      raise exception 'shift_not_yet_synced';
    end if;
  end if;

  insert into sale (
    client_ref, business_id, location_id, device_id, shift_id,
    cashier_membership_id, customer_id, status,
    subtotal, discount_total, tax_total, total, currency_code,
    note, receipt_number, occurred_at, business_date, discount_approved_by
  ) values (
    v_client_ref, v_business, v_location,
    nullif(p->>'device_id', '')::uuid,
    v_shift,
    nullif(p->>'cashier_membership_id', '')::uuid,
    nullif(p->>'customer_id', '')::uuid,
    'completed',
    (p->>'subtotal')::numeric,
    coalesce((p->>'discount_total')::numeric, 0),
    coalesce((p->>'tax_total')::numeric, 0),
    (p->>'total')::numeric,
    coalesce(p->>'currency_code', 'GHS'),
    p->>'note',
    p->>'receipt_number',
    (p->>'occurred_at')::timestamptz,
    coalesce((p->>'business_date')::date, ((p->>'occurred_at')::timestamptz)::date),
    v_approver
  )
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p->'lines')
  loop
    insert into sale_line (
      sale_id, item_id, variant_id, description,
      quantity, unit_price, discount, tax, line_total
    ) values (
      v_sale_id,
      (v_line->>'item_id')::uuid,
      nullif(v_line->>'variant_id', '')::uuid,
      v_line->>'description',
      (v_line->>'quantity')::numeric,
      (v_line->>'unit_price')::numeric,
      coalesce((v_line->>'discount')::numeric, 0),
      coalesce((v_line->>'tax')::numeric, 0),
      (v_line->>'line_total')::numeric
    );

    if coalesce((v_line->>'track_stock')::boolean, false) then
      insert into stock_movement (
        client_ref, business_id, location_id, item_id, variant_id,
        kind, quantity, source_entity_type, source_entity_id,
        actor_membership_id, device_id, occurred_at
      ) values (
        v_client_ref || ':mv:' || (v_line->>'item_id'),
        v_business, v_location,
        (v_line->>'item_id')::uuid,
        nullif(v_line->>'variant_id', '')::uuid,
        'sale',
        -1 * (v_line->>'quantity')::numeric,
        'sale', v_sale_id,
        nullif(p->>'cashier_membership_id', '')::uuid,
        nullif(p->>'device_id', '')::uuid,
        (p->>'occurred_at')::timestamptz
      ) on conflict (business_id, client_ref) do nothing;
    end if;
  end loop;

  for v_pay in select * from jsonb_array_elements(p->'payments')
  loop
    insert into payment (
      client_ref, business_id, location_id, customer_id,
      method, status, verification, amount, currency_code, tendered,
      provider, provider_reference,
      source_entity_type, source_entity_id,
      actor_membership_id, device_id, occurred_at
    ) values (
      v_client_ref || ':pay:' || coalesce(v_pay->>'seq', '0'),
      v_business, v_location,
      nullif(p->>'customer_id', '')::uuid,
      (v_pay->>'method')::payment_method,
      coalesce((v_pay->>'status')::payment_status, 'confirmed'),
      'merchant_declared',
      (v_pay->>'amount')::numeric,
      coalesce(p->>'currency_code', 'GHS'),
      nullif(v_pay->>'tendered', '')::numeric,
      v_pay->>'provider',
      v_pay->>'provider_reference',
      'sale', v_sale_id,
      nullif(p->>'cashier_membership_id', '')::uuid,
      nullif(p->>'device_id', '')::uuid,
      (p->>'occurred_at')::timestamptz
    ) on conflict (business_id, client_ref) do nothing;
  end loop;

  insert into ledger_entry (
    business_id, location_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, business_date
  ) values (
    v_business, v_location, 'sale_revenue',
    (p->>'total')::numeric,
    coalesce(p->>'currency_code', 'GHS'),
    'sale', v_sale_id,
    coalesce((p->>'business_date')::date, ((p->>'occurred_at')::timestamptz)::date)
  );

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, payload, business_date, occurred_at
  ) values (
    'pos.sale.completed', v_business, v_location,
    nullif(p->>'cashier_membership_id', '')::uuid,
    'pos_terminal', 'pos', 'sale', v_sale_id,
    (p->>'total')::numeric,
    coalesce(p->>'currency_code', 'GHS'),
    'merchant_declared',
    jsonb_build_object('client_ref', v_client_ref, 'line_count', jsonb_array_length(p->'lines')),
    coalesce((p->>'business_date')::date, ((p->>'occurred_at')::timestamptz)::date),
    (p->>'occurred_at')::timestamptz
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', p->>'receipt_number',
    'duplicate', false
  );
end;
$$;
