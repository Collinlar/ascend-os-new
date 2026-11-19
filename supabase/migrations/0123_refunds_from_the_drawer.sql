-- 0123: refunds handed back from the drawer.
--
-- Collins decided on 19 November 2026 that a refund approved for a till
-- sale is paid from the drawer, across the counter. Until now an approved
-- refund reversed the sale (and the Financial Foundation counted the cash
-- as handed back), but the drawer was still expected to hold it: a cashier
-- who handed the money over closed short by exactly that much, and the till
-- was never told the refund had been approved.
--
-- Now the till learns the decision. For a sale paid in cash it tells the
-- cashier to hand the money back, and when they say they have, it records
-- the payout here, against the shift it came out of. close_pos_shift takes
-- those payouts off what the drawer should hold. A refund on a MoMo or card
-- sale is not paid from the drawer, and nothing is recorded here for it.
--
-- close_pos_shift is 0070's with the payouts subtracted and named in the
-- shift-closed event. Nothing else about it changes.

create table if not exists till_refund_payout (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  approval_id uuid not null references approval_request(id),
  sale_id uuid not null references sale(id),
  amount numeric(14,2) not null check (amount > 0),
  shift_id uuid not null references pos_shift(id),
  device_id uuid references device_registration(id),
  paid_by uuid references business_membership(id),
  client_ref text not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One payout per approved refund, however many times the till sends it.
  unique (approval_id),
  unique (business_id, client_ref)
);
create index if not exists till_refund_payout_shift_idx on till_refund_payout (shift_id);

alter table till_refund_payout enable row level security;
revoke all on till_refund_payout from anon, authenticated;

-- Recording one. The amount is the cash the sale took, worked out here, not
-- taken from the till: a till can say a refund was handed back, but not how
-- much it was.
create or replace function record_till_refund_payout(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_request approval_request%rowtype;
  v_shift pos_shift%rowtype;
  v_cash numeric(14,2);
  v_existing till_refund_payout%rowtype;
  v_id uuid;
begin
  select * into v_existing from till_refund_payout where approval_id = (p->>'approval_id')::uuid;
  if found then
    if v_existing.business_id <> v_business then
      raise exception 'refund_not_found';
    end if;
    return jsonb_build_object('payout_id', v_existing.id, 'amount', v_existing.amount, 'duplicate', true);
  end if;

  select * into v_request from approval_request
  where id = (p->>'approval_id')::uuid and business_id = v_business;
  if not found or v_request.kind <> 'refund' or v_request.source_entity_type <> 'sale' then
    raise exception 'refund_not_found';
  end if;
  if v_request.status <> 'approved' then
    raise exception 'refund_not_approved';
  end if;

  select coalesce(sum(amount), 0) into v_cash
  from payment
  where source_entity_type = 'sale' and source_entity_id = v_request.source_entity_id
    and business_id = v_business and method = 'cash' and status = 'confirmed';
  if v_cash <= 0 then
    raise exception 'refund_not_from_the_drawer';
  end if;

  select * into v_shift from pos_shift
  where client_ref = p->>'shift_client_ref' and business_id = v_business;
  if not found then
    -- The shift is earlier in the till's queue. Temporary by nature.
    raise exception 'shift_not_yet_synced';
  end if;

  insert into till_refund_payout (
    business_id, approval_id, sale_id, amount, shift_id, device_id, paid_by, client_ref, paid_at
  ) values (
    v_business, v_request.id, v_request.source_entity_id, v_cash, v_shift.id,
    nullif(p->>'device_id', '')::uuid,
    case when exists (
      select 1 from business_membership
      where id = nullif(p->>'paid_by', '')::uuid and business_id = v_business
    ) then nullif(p->>'paid_by', '')::uuid end,
    p->>'client_ref',
    coalesce((p->>'paid_at')::timestamptz, now())
  )
  returning id into v_id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_business, nullif(p->>'paid_by', '')::uuid, 'pos.refund.paid_from_drawer', 'approval_request', v_request.id,
    jsonb_build_object('amount', v_cash, 'shift_id', v_shift.id, 'payout_id', v_id)
  );

  return jsonb_build_object('payout_id', v_id, 'amount', v_cash, 'duplicate', false);
end;
$$;

revoke all on function record_till_refund_payout(jsonb) from public, anon, authenticated;
grant execute on function record_till_refund_payout(jsonb) to service_role;

create or replace function close_pos_shift(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_shift pos_shift%rowtype;
  v_cash_sales numeric(14,2);
  v_expenses numeric(14,2);
  v_refunds numeric(14,2);
  v_expected numeric(14,2);
  v_declared numeric(14,2) := nullif(p->>'declared_cash', '')::numeric;
  v_difference numeric(14,2);
  v_expense jsonb;
begin
  -- Resolve by the device's own reference: offline, that is all it has.
  -- A shift reference is unique within a business, not across them. A
  -- caller that does not say which business is only safe while exactly one
  -- shift carries the reference, so an ambiguous one is refused rather than
  -- closing somebody else's drawer.
  if nullif(p->>'business_id', '') is null
     and (select count(*) from pos_shift where client_ref = p->>'shift_client_ref') > 1 then
    raise exception 'ambiguous_shift_reference';
  end if;

  select * into v_shift
  from pos_shift
  where client_ref = p->>'shift_client_ref'
    and (nullif(p->>'business_id', '') is null
         or business_id = (p->>'business_id')::uuid)
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
    ) on conflict (business_id, client_ref) do nothing;
  end loop;

  select coalesce(sum(pay.amount), 0) into v_cash_sales
  from payment pay
  join sale s on s.id = pay.source_entity_id and pay.source_entity_type = 'sale'
  where s.shift_id = v_shift.id
    and pay.method = 'cash'
    and pay.status = 'confirmed';

  select coalesce(sum(amount), 0) into v_expenses
  from till_expense where shift_id = v_shift.id;

  -- Refunds handed back across this counter during the shift (0123).
  select coalesce(sum(amount), 0) into v_refunds
  from till_refund_payout where shift_id = v_shift.id;

  v_expected := coalesce(v_shift.opening_cash, 0) + v_cash_sales - v_expenses - v_refunds;
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
      'till_expenses', v_expenses,
      'refunds_paid', v_refunds
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
