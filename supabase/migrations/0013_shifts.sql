-- AscendSME Connected Platform. Migration 0013: shifts and cash
-- accountability (POS PRD §20). A shift groups staff activity and money:
-- opening float, sales taken, till expenses paid out, cash declared at the
-- end, and the difference between what should be in the drawer and what is.
--
-- Everything here works offline and syncs later (POS-SHF-007), so the
-- functions resolve shifts by the device's client_ref, not by a server id
-- the terminal could not have known when it was disconnected (POS-SYN-006).

-- Money paid out of the till during a shift, kept separate from sales so
-- neither distorts the other (POS-SHF-006).
create table till_expense (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  shift_id uuid not null references pos_shift(id),
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'GHS',
  reason text not null,
  actor_membership_id uuid references business_membership(id),
  occurred_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index till_expense_shift_idx on till_expense(shift_id);

-- What the device believed at close, kept alongside what the server
-- computes. A disagreement is a review signal, not something to overwrite.
alter table pos_shift
  add column device_expected_cash numeric(14,2),
  add column closing_note text;

alter table till_expense enable row level security;

-- ---------------------------------------------------------------------------
-- open_pos_shift: idempotent on the device's client_ref. One open shift per
-- device is enforced by the partial unique index from migration 0003
-- (POS-SHF-010); a second open attempt returns the existing shift rather
-- than failing the cashier mid-queue.
-- ---------------------------------------------------------------------------
create or replace function open_pos_shift(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_client_ref text := p->>'client_ref';
  v_device uuid := nullif(p->>'device_id', '')::uuid;
  v_existing pos_shift%rowtype;
  v_shift uuid;
begin
  if v_client_ref is null then
    raise exception 'client_ref is required';
  end if;

  select * into v_existing from pos_shift where client_ref = v_client_ref;
  if found then
    return jsonb_build_object('shift_id', v_existing.id, 'duplicate', true);
  end if;

  -- An already-open shift on this device wins: the cashier is mid-day and
  -- must not end up with two drawers.
  select * into v_existing
  from pos_shift
  where device_id = v_device and status = 'open'
  limit 1;
  if found then
    return jsonb_build_object('shift_id', v_existing.id, 'duplicate', true, 'reused', true);
  end if;

  insert into pos_shift (
    client_ref, business_id, location_id, device_id,
    cashier_membership_id, status, opening_cash, opened_at
  ) values (
    v_client_ref,
    (p->>'business_id')::uuid,
    (p->>'location_id')::uuid,
    v_device,
    nullif(p->>'cashier_membership_id', '')::uuid,
    'open',
    coalesce((p->>'opening_cash')::numeric, 0),
    coalesce((p->>'opened_at')::timestamptz, now())
  )
  returning id into v_shift;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id, payload, business_date, occurred_at
  ) values (
    'pos.shift.opened', (p->>'business_id')::uuid, (p->>'location_id')::uuid,
    nullif(p->>'cashier_membership_id', '')::uuid,
    'pos_terminal', 'pos', 'pos_shift', v_shift,
    jsonb_build_object('opening_cash', coalesce((p->>'opening_cash')::numeric, 0)),
    current_date,
    coalesce((p->>'opened_at')::timestamptz, now())
  );

  return jsonb_build_object('shift_id', v_shift, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- close_pos_shift: the reconciliation moment.
--
-- The server recomputes expected cash from its own records rather than
-- trusting the terminal's arithmetic, and stores the device's figure beside
-- it. Closed shifts are not editable by cashiers (POS-SHF-008): corrections
-- go through an authorised adjustment, not by reopening this row.
-- ---------------------------------------------------------------------------
create or replace function close_pos_shift(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_shift pos_shift%rowtype;
  v_cash_sales numeric(14,2);
  v_expenses numeric(14,2);
  v_expected numeric(14,2);
  v_declared numeric(14,2) := nullif(p->>'declared_cash', '')::numeric;
  v_difference numeric(14,2);
  v_expense jsonb;
begin
  -- Resolve by the device's own reference: offline, that is all it has.
  select * into v_shift
  from pos_shift
  where client_ref = p->>'shift_client_ref'
  for update;

  if not found then
    raise exception 'shift_not_found';
  end if;

  if v_shift.status = 'closed' then
    return jsonb_build_object(
      'shift_id', v_shift.id,
      'expected_cash', v_shift.expected_cash,
      'difference', v_shift.cash_difference,
      'duplicate', true
    );
  end if;

  -- Money taken out of the drawer during the shift arrives with the close,
  -- so the expected figure accounts for it rather than reading as a loss
  -- (POS-SHF-006). Deterministic refs make a retried close a no-op.
  for v_expense in select * from jsonb_array_elements(coalesce(p->'expenses', '[]'::jsonb))
  loop
    insert into till_expense (
      client_ref, business_id, location_id, shift_id,
      amount, currency_code, reason, actor_membership_id, occurred_at
    ) values (
      v_expense->>'client_ref',
      v_shift.business_id, v_shift.location_id, v_shift.id,
      (v_expense->>'amount')::numeric,
      'GHS',
      coalesce(v_expense->>'reason', 'till expense'),
      v_shift.cashier_membership_id,
      coalesce((v_expense->>'occurred_at')::timestamptz, now())
    ) on conflict (client_ref) do nothing;
  end loop;

  select coalesce(sum(pay.amount), 0) into v_cash_sales
  from payment pay
  join sale s on s.id = pay.source_entity_id and pay.source_entity_type = 'sale'
  where s.shift_id = v_shift.id
    and pay.method = 'cash'
    and pay.status = 'confirmed';

  select coalesce(sum(amount), 0) into v_expenses
  from till_expense where shift_id = v_shift.id;

  v_expected := coalesce(v_shift.opening_cash, 0) + v_cash_sales - v_expenses;
  v_difference := case when v_declared is null then null else v_declared - v_expected end;

  update pos_shift
  set status = 'closed',
      expected_cash = v_expected,
      device_expected_cash = nullif(p->>'device_expected_cash', '')::numeric,
      declared_cash = v_declared,
      cash_difference = v_difference,
      difference_note = p->>'difference_note',
      closing_note = p->>'closing_note',
      closed_at = coalesce((p->>'closed_at')::timestamptz, now())
  where id = v_shift.id;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, payload, business_date, occurred_at
  ) values (
    'pos.shift.closed', v_shift.business_id, v_shift.location_id,
    v_shift.cashier_membership_id,
    'pos_terminal', 'pos', 'pos_shift', v_shift.id,
    v_expected, 'GHS', 'merchant_declared',
    jsonb_build_object(
      'expected_cash', v_expected,
      'declared_cash', v_declared,
      'difference', v_difference,
      'cash_sales', v_cash_sales,
      'till_expenses', v_expenses
    ),
    current_date,
    coalesce((p->>'closed_at')::timestamptz, now())
  );

  return jsonb_build_object(
    'shift_id', v_shift.id,
    'expected_cash', v_expected,
    'declared_cash', v_declared,
    'difference', v_difference,
    'duplicate', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_pos_sale gains shift resolution by client_ref. A sale created
-- offline knows only the local shift reference; the server maps it to the
-- real shift once that shift has synced (POS-SYN-006). Ordering is the
-- terminal's job: the outbox is drained in creation order, so the shift
-- always lands before its sales.
-- ---------------------------------------------------------------------------
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
begin
  if v_client_ref is null then
    raise exception 'client_ref is required for idempotent completion';
  end if;

  select * into v_existing from sale where client_ref = v_client_ref;
  if found then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'receipt_number', v_existing.receipt_number,
      'duplicate', true
    );
  end if;

  if v_shift is null and nullif(p->>'shift_client_ref', '') is not null then
    select id into v_shift from pos_shift where client_ref = p->>'shift_client_ref';
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
    note, receipt_number, occurred_at, business_date
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
    coalesce((p->>'business_date')::date, ((p->>'occurred_at')::timestamptz)::date)
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
      ) on conflict (client_ref) do nothing;
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
    ) on conflict (client_ref) do nothing;
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
