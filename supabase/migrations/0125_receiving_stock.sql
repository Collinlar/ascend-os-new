-- ---------------------------------------------------------------------------
-- 0125  Inventory Core I1: receiving stock
--
-- INVENTORY_CORE_PLAN.md, step I1 and decisions 2, 3 and 9 (approved 21 Nov
-- 2026). Goods in from a supplier stop being anonymous: a receipt names the
-- supplier (optional, free text), their reference, and the cost of each
-- line. It writes one restock movement per line, keeps a moving average cost
-- on each item, and when the merchant says it was paid, records the money
-- out under "Stock and goods for resale" in the same step.
--
-- stock_receipt, stock_receipt_line   the receipt and its lines
-- catalogue_item.average_cost         moving average cost per unit, across
--                                     every place (decision 3)
-- receive_stock(p jsonb)              the one way in; idempotent by client_ref
-- stock_movement_sale_cost            a sale or return movement written
--                                     without a cost takes the item's average
--                                     cost at that moment, so margin can be
--                                     worked out later for every way of
--                                     selling without touching each one
--
-- Money out uses the existing 'expense' kind with category stock_purchases,
-- so the Money page's money out by category shows it with nothing else
-- changed. It is merchant_declared, carries the method, and has
-- source_type 'stock_receipt'. Not paid yet: only the goods are recorded
-- (what is owed to suppliers waits for the Finance experience).
--
-- Supplier records and purchase orders belong to Advanced Inventory
-- (decision 9). A receipt keeps the name as typed, and links supplier_id
-- only when an active supplier of that name already exists (0054).
--
-- Tables and columns read: business (id, country_code), country_config
-- (code, currency_code), location (id,
-- business_id), business_membership (id, business_id, status),
-- catalogue_item (id, business_id, name, track_stock), stock_movement (all
-- columns in 0002), supplier (id, business_id, name, active),
-- financial_event (0100, kinds from 0101), event_outbox (as written by
-- record_stock_movement in 0070), financial_category (key stock_purchases,
-- 0101).
-- ---------------------------------------------------------------------------

alter table catalogue_item add column if not exists average_cost numeric(14,4);

create table if not exists stock_receipt (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  client_ref text not null,
  supplier_name text,
  supplier_id uuid references supplier(id),
  reference text,                                   -- their invoice or waybill number
  note text,
  total_cost numeric(14,2),                         -- sum of the lines that carry a cost
  costed_lines int not null default 0,
  paid boolean not null default false,
  payment_method text check (payment_method in ('cash', 'mobile_money', 'bank_transfer', 'card')),
  currency_code text not null default 'GHS',
  actor_membership_id uuid references business_membership(id),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (not paid or payment_method is not null)
);
create unique index if not exists stock_receipt_client_ref on stock_receipt (business_id, client_ref);
create index if not exists stock_receipt_business_at on stock_receipt (business_id, received_at desc);
alter table stock_receipt enable row level security;
revoke all on stock_receipt from anon, authenticated;

create table if not exists stock_receipt_line (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references stock_receipt(id),
  item_id uuid not null references catalogue_item(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  movement_id uuid references stock_movement(id)
);
create index if not exists stock_receipt_line_receipt on stock_receipt_line (receipt_id);
alter table stock_receipt_line enable row level security;
revoke all on stock_receipt_line from anon, authenticated;

-- A receipt is a record of what arrived. Corrections are new movements
-- (a count, a write-off), never an edit to what was received.
drop trigger if exists stock_receipt_append_only on stock_receipt;
create trigger stock_receipt_append_only before update or delete on stock_receipt
  for each row execute function refuse_history_change();
drop trigger if exists stock_receipt_line_append_only on stock_receipt_line;
create trigger stock_receipt_line_append_only before update or delete on stock_receipt_line
  for each row execute function refuse_history_change();

-- ---------------------------------------------------------------------------
-- Sales carry the cost of what was sold
-- ---------------------------------------------------------------------------
create or replace function stock_movement_sale_cost()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.unit_cost is null and new.kind in ('sale', 'customer_return') then
    select average_cost into new.unit_cost from catalogue_item where id = new.item_id;
  end if;
  return new;
end
$fn$;

drop trigger if exists stock_movement_sale_cost on stock_movement;
create trigger stock_movement_sale_cost before insert on stock_movement
  for each row execute function stock_movement_sale_cost();

-- ---------------------------------------------------------------------------
-- Receiving
-- ---------------------------------------------------------------------------
create or replace function receive_stock(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_location uuid := (p->>'location_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_client_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_supplier text := nullif(btrim(coalesce(p->>'supplier_name', '')), '');
  v_paid boolean := coalesce((p->>'paid')::boolean, false);
  v_method text := nullif(p->>'payment_method', '');
  v_existing stock_receipt%rowtype;
  v_receipt uuid;
  v_supplier_id uuid;
  v_currency text;
  v_line jsonb;
  v_item catalogue_item%rowtype;
  v_qty numeric(14,3);
  v_cost numeric(14,2);
  v_on_hand numeric(14,3);
  v_movement uuid;
  v_total numeric(14,2) := 0;
  v_costed int := 0;
  v_lines int := 0;
  v_event uuid;
begin
  if v_client_ref is null then raise exception 'client_ref_required'; end if;

  -- The same receipt sent twice (a tap on a bad connection) is one receipt.
  select * into v_existing from stock_receipt where business_id = v_business and client_ref = v_client_ref;
  if found then
    return jsonb_build_object('receipt_id', v_existing.id, 'duplicate', true,
      'total_cost', v_existing.total_cost, 'paid', v_existing.paid);
  end if;

  perform 1 from location where id = v_location and business_id = v_business;
  if not found then raise exception 'location_not_found'; end if;
  if v_actor is not null then
    perform 1 from business_membership where id = v_actor and business_id = v_business and status = 'active';
    if not found then raise exception 'actor_not_member'; end if;
  end if;

  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'lines_required';
  end if;
  if jsonb_array_length(p->'lines') > 200 then raise exception 'too_many_lines'; end if;
  if v_paid and v_method is null then raise exception 'payment_method_required'; end if;
  if v_method is not null and v_method not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'payment_method_invalid';
  end if;

  if v_supplier is not null then
    select id into v_supplier_id from supplier
     where business_id = v_business and active and lower(btrim(name)) = lower(v_supplier)
     limit 1;
  end if;
  select c.currency_code into v_currency
    from business b join country_config c on c.code = b.country_code
   where b.id = v_business;

  -- First pass: check every line and add up the cost, so the receipt is
  -- written once, whole, and never edited afterwards.
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid;
    if not found or v_item.business_id <> v_business then raise exception 'item_not_found'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_required'; end if;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;
    if v_cost is not null and v_cost < 0 then raise exception 'cost_invalid'; end if;
    if v_cost is not null then
      v_total := v_total + round(v_qty * v_cost, 2);
      v_costed := v_costed + 1;
    end if;
  end loop;
  if v_paid and v_total <= 0 then raise exception 'cost_required_when_paid'; end if;

  insert into stock_receipt (business_id, location_id, client_ref, supplier_name, supplier_id, reference, note,
                             total_cost, costed_lines, paid, payment_method, currency_code, actor_membership_id)
  values (v_business, v_location, v_client_ref, v_supplier, v_supplier_id,
          nullif(btrim(coalesce(p->>'reference', '')), ''), nullif(btrim(coalesce(p->>'note', '')), ''),
          case when v_costed > 0 then v_total end, v_costed, v_paid, case when v_paid then v_method end,
          coalesce(v_currency, 'GHS'), v_actor)
  returning id into v_receipt;

  -- Second pass: the stock lands, and the average cost moves.
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid for update;
    v_qty := (v_line->>'quantity')::numeric;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;

    -- Moving average across every place, before this delivery lands. Stock
    -- already below zero (sold offline before it was received) counts as
    -- none, so the new cost is not dragged by a figure that never existed.
    if v_cost is not null then
      select coalesce(sum(quantity), 0) into v_on_hand from stock_movement
       where business_id = v_business and item_id = v_item.id
         and kind not in ('reservation', 'reservation_release');
      if v_item.average_cost is null or v_on_hand <= 0 then
        update catalogue_item set average_cost = v_cost, updated_at = now() where id = v_item.id;
      else
        update catalogue_item
           set average_cost = round((v_on_hand * v_item.average_cost + v_qty * v_cost) / (v_on_hand + v_qty), 4),
               updated_at = now()
         where id = v_item.id;
      end if;
    end if;

    insert into stock_movement (business_id, location_id, item_id, kind, quantity, unit_cost, reason,
                                source_entity_type, source_entity_id, actor_membership_id, occurred_at)
    values (v_business, v_location, v_item.id, 'restock', v_qty, v_cost,
            case when v_supplier is not null then 'From ' || v_supplier end,
            'stock_receipt', v_receipt, v_actor, now())
    returning id into v_movement;

    insert into stock_receipt_line (receipt_id, item_id, quantity, unit_cost, movement_id)
    values (v_receipt, v_item.id, v_qty, v_cost, v_movement);

    -- Receiving is the moment an item becomes worth counting (as in 0035).
    if not v_item.track_stock then
      update catalogue_item set track_stock = true, updated_at = now() where id = v_item.id;
    end if;
    v_lines := v_lines + 1;
  end loop;

  if v_paid then
    insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                                 currency_code, category, location_id, counterparty, method, verification,
                                 occurred_at, detail)
    values (v_business, 'inventory', 'stock_receipt', v_receipt, 'expense', 'cash', 'out', v_total,
            coalesce(v_currency, 'GHS'), 'stock_purchases', v_location, v_supplier, v_method, 'merchant_declared',
            now(), jsonb_strip_nulls(jsonb_build_object(
              'reference', nullif(btrim(coalesce(p->>'reference', '')), ''),
              'lines', v_lines, 'costed_lines', v_costed, 'recorded_by', v_actor)))
    on conflict (source_type, source_id, kind) do nothing
    returning id into v_event;
  end if;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    verification, payload, business_date
  ) values (
    'inventory.stock.received', v_business, v_location, v_actor,
    'business_mobile', 'pos', 'stock_receipt', v_receipt,
    'merchant_declared',
    jsonb_strip_nulls(jsonb_build_object('lines', v_lines, 'total_cost', case when v_costed > 0 then v_total end,
      'paid', v_paid, 'supplier', v_supplier)),
    current_date
  );

  return jsonb_build_object('receipt_id', v_receipt, 'duplicate', false, 'lines', v_lines,
    'total_cost', case when v_costed > 0 then v_total end, 'paid', v_paid, 'money_out_event', v_event);
end
$fn$;

revoke all on function receive_stock(jsonb) from public, anon, authenticated;
grant execute on function receive_stock(jsonb) to service_role;
revoke all on function stock_movement_sale_cost() from public, anon, authenticated;
