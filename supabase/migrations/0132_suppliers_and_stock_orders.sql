-- ---------------------------------------------------------------------------
-- 0132  Advanced Inventory A2: suppliers and stock orders
--
-- INVENTORY_CORE_PLAN.md, decision 9: supplier records and purchase orders
-- are Advanced Inventory. Nothing here starts over. Suppliers have been a
-- table since 0054 and a purchase order a document type since 0003; Office
-- turns an approved purchase into one (0063), and Documents can write one
-- by hand. What none of them can do is say which products were ordered, how
-- many have arrived, and what is still owed.
--
-- A stock order
--   is an issued purchase_order document (numbered like every other, with
--   its PDF), plus a stock_order row saying where it is to be delivered and
--   whether it is open, and a line per product: ordered, expected cost,
--   received so far. Receiving against it (receive_stock, below) counts
--   what arrives onto those lines; the order is received when every line
--   has arrived in full. "Nothing more is coming" closes an order that came
--   short, or cancels one where nothing came (and its document with it).
--
-- Paying later
--   0125 records money out when a delivery is received paid. One received
--   on credit stayed unpaid for good. pay_stock_receipt records the money
--   out later, the same single expense under "Stock and goods for resale",
--   so the receipt itself is never edited (it is history). What is owed to
--   a supplier is their deliveries with a cost and no money out yet.
--
-- Everything is behind inventory.purchasing, a second capability in the
-- Advanced Inventory set (0131). Owners and managers (inventory.manage)
-- add suppliers, place and close orders and pay deliveries.
--
-- Tables and columns read: supplier (0054), document (0003, supplier_id from
-- 0054), issue_document (0017), stock_receipt and stock_receipt_line,
-- receive_stock (0125), financial_event (0100, unique on source_type,
-- source_id, kind), location, catalogue_item, business, country_config,
-- business_capabilities (0044), require_permission (0081), audit_log.
-- ---------------------------------------------------------------------------

insert into capability (key, name, owning_domain, class, description) values
  ('inventory.purchasing', 'Suppliers and stock orders', 'inventory', 'advanced', 'Keep suppliers, order stock from them and track what is owed')
on conflict (key) do update
  set name = excluded.name, owning_domain = excluded.owning_domain,
      class = excluded.class, description = excluded.description;

insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('advanced_inventory', 'inventory.purchasing', false)
on conflict (product_set_key, capability_key) do update set embedded = excluded.embedded;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists stock_order (
  document_id uuid primary key references document(id),
  business_id uuid not null references business(id),
  supplier_id uuid not null references supplier(id),
  location_id uuid not null references location(id),
  client_ref text not null,
  status text not null check (status in ('open', 'received', 'closed', 'cancelled')),
  expected_on date,
  note text,
  ordered_by uuid references business_membership(id),
  ordered_at timestamptz not null default now(),
  received_at timestamptz,
  closed_by uuid references business_membership(id),
  closed_at timestamptz,
  close_note text
);
create unique index if not exists stock_order_client_ref on stock_order (business_id, client_ref);
create index if not exists stock_order_business_at on stock_order (business_id, ordered_at desc);
create index if not exists stock_order_supplier on stock_order (supplier_id);
alter table stock_order enable row level security;
revoke all on stock_order from anon, authenticated;

create table if not exists stock_order_line (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references stock_order(document_id),
  item_id uuid not null references catalogue_item(id),
  ordered numeric(14,3) not null check (ordered > 0),
  unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0),
  received numeric(14,3) not null default 0 check (received >= 0),
  unique (document_id, item_id)
);
create index if not exists stock_order_line_order on stock_order_line (document_id);
alter table stock_order_line enable row level security;
revoke all on stock_order_line from anon, authenticated;

-- What was ordered is never edited. Only what arrived, and the closing,
-- are written later, by the functions here, which set ascend.order_step.
create or replace function stock_order_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('ascend.history_erasure', true), '') = '' then
      raise exception 'stock orders are history: they cannot be deleted';
    end if;
    return old;
  end if;
  if coalesce(current_setting('ascend.order_step', true), '') = '' then
    raise exception 'stock orders are history: only what arrived and the closing can be recorded';
  end if;
  return new;
end
$fn$;

drop trigger if exists stock_order_guard on stock_order;
create trigger stock_order_guard before update or delete on stock_order
  for each row execute function stock_order_guard();
drop trigger if exists stock_order_line_guard on stock_order_line;
create trigger stock_order_line_guard before update or delete on stock_order_line
  for each row execute function stock_order_guard();

-- A delivery may be received against an order.
alter table stock_receipt add column if not exists purchase_order_id uuid references document(id);
create index if not exists stock_receipt_order on stock_receipt (purchase_order_id) where purchase_order_id is not null;

-- receive_stock as in 0125, with seven counted substitutions: an optional
-- purchase_order_id, received against the order's lines.
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
  v_order uuid := nullif(p->>'purchase_order_id', '')::uuid;
  v_so stock_order%rowtype;
  v_order_status text;
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
  -- Against an order (0132): the order's own supplier, at the place it was
  -- to be delivered to, and only while it is still open.
  if v_order is not null then
    select * into v_so from stock_order where document_id = v_order and business_id = v_business for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_so.status <> 'open' then raise exception 'order_not_open'; end if;
    if v_so.location_id <> v_location then raise exception 'order_other_place'; end if;
    v_supplier_id := v_so.supplier_id;
    select coalesce(v_supplier, name) into v_supplier from supplier where id = v_so.supplier_id;
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
                             total_cost, costed_lines, paid, payment_method, currency_code, actor_membership_id,
                             purchase_order_id)
  values (v_business, v_location, v_client_ref, v_supplier, v_supplier_id,
          nullif(btrim(coalesce(p->>'reference', '')), ''), nullif(btrim(coalesce(p->>'note', '')), ''),
          case when v_costed > 0 then v_total end, v_costed, v_paid, case when v_paid then v_method end,
          coalesce(v_currency, 'GHS'), v_actor, v_order)
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

    -- What arrived counts against the order. Something not on the order
    -- (the supplier sent extra) is received all the same.
    if v_order is not null then
      perform set_config('ascend.order_step', 'receive', true);
      update stock_order_line set received = received + v_qty where document_id = v_order and item_id = v_item.id;
      perform set_config('ascend.order_step', '', true);
    end if;

    -- Receiving is the moment an item becomes worth counting (as in 0035).
    if not v_item.track_stock then
      update catalogue_item set track_stock = true, updated_at = now() where id = v_item.id;
    end if;
    v_lines := v_lines + 1;
  end loop;

  if v_order is not null then
    perform 1 from stock_order_line where document_id = v_order and received < ordered;
    v_order_status := case when found then 'open' else 'received' end;
    perform set_config('ascend.order_step', 'receive', true);
    update stock_order set status = v_order_status,
           received_at = case when v_order_status = 'received' then now() end
     where document_id = v_order;
    perform set_config('ascend.order_step', '', true);
  end if;

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
    'total_cost', case when v_costed > 0 then v_total end, 'paid', v_paid, 'money_out_event', v_event,
    'order_status', v_order_status);
end
$fn$;

revoke all on function receive_stock(jsonb) from public, anon, authenticated;
grant execute on function receive_stock(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The gate every purchasing function shares
-- ---------------------------------------------------------------------------
create or replace function require_purchasing(p_actor uuid, p_business uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  perform require_permission(p_actor, p_business, array['inventory.manage']);
  perform 1 from business_capabilities(p_business) where capability_key = 'inventory.purchasing';
  if not found then raise exception 'not_entitled'; end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Suppliers: add one, or change one
-- ---------------------------------------------------------------------------
create or replace function save_supplier(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_id uuid := nullif(p->>'supplier_id', '')::uuid;
  v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
  v_new boolean := false;
begin
  perform require_purchasing(v_actor, v_business);
  if v_name is null then raise exception 'name_required'; end if;
  if length(v_name) > 120 then raise exception 'name_too_long'; end if;

  perform 1 from supplier
   where business_id = v_business and active and lower(btrim(name)) = lower(v_name)
     and (v_id is null or id <> v_id);
  if found then raise exception 'supplier_exists'; end if;

  if v_id is null then
    insert into supplier (business_id, name, contact_name, phone_e164, payment_terms, notes)
    values (v_business, v_name,
            nullif(btrim(coalesce(p->>'contact_name', '')), ''),
            nullif(btrim(coalesce(p->>'phone', '')), ''),
            nullif(btrim(coalesce(p->>'payment_terms', '')), ''),
            nullif(btrim(coalesce(p->>'notes', '')), ''))
    returning id into v_id;
    v_new := true;
  else
    update supplier
       set name = v_name,
           contact_name = nullif(btrim(coalesce(p->>'contact_name', '')), ''),
           phone_e164 = nullif(btrim(coalesce(p->>'phone', '')), ''),
           payment_terms = nullif(btrim(coalesce(p->>'payment_terms', '')), ''),
           notes = nullif(btrim(coalesce(p->>'notes', '')), ''),
           updated_at = now()
     where id = v_id and business_id = v_business and active;
    if not found then raise exception 'supplier_not_found'; end if;
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, case when v_new then 'inventory.supplier.added' else 'inventory.supplier.changed' end,
          'supplier', v_id, jsonb_build_object('name', v_name));

  return jsonb_build_object('supplier_id', v_id, 'created', v_new);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Placing an order
-- ---------------------------------------------------------------------------
create or replace function place_stock_order(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'ordered_by', '')::uuid;
  v_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_location uuid := nullif(p->>'location_id', '')::uuid;
  v_supplier uuid := nullif(p->>'supplier_id', '')::uuid;
  v_supplier_name text := nullif(btrim(coalesce(p->>'supplier_name', '')), '');
  v_existing stock_order%rowtype;
  v_currency text;
  v_line jsonb;
  v_item catalogue_item%rowtype;
  v_qty numeric(14,3);
  v_cost numeric(14,2);
  v_seen uuid[] := '{}';
  v_doc_lines jsonb := '[]'::jsonb;
  v_total numeric(14,2) := 0;
  v_doc uuid;
  v_issued jsonb;
begin
  if v_ref is null then raise exception 'client_ref_required'; end if;
  select * into v_existing from stock_order where business_id = v_business and client_ref = v_ref;
  if found then
    return jsonb_build_object('document_id', v_existing.document_id, 'duplicate', true,
      'number', (select number from document where id = v_existing.document_id));
  end if;

  perform require_purchasing(v_actor, v_business);

  perform 1 from location where id = v_location and business_id = v_business and active;
  if not found then raise exception 'location_not_found'; end if;

  if v_supplier is not null then
    perform 1 from supplier where id = v_supplier and business_id = v_business and active;
    if not found then raise exception 'supplier_not_found'; end if;
  elsif v_supplier_name is not null then
    select id into v_supplier from supplier
     where business_id = v_business and active and lower(btrim(name)) = lower(v_supplier_name) limit 1;
    if v_supplier is null then
      insert into supplier (business_id, name) values (v_business, v_supplier_name) returning id into v_supplier;
    end if;
  else
    raise exception 'supplier_required';
  end if;

  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'lines_required'; end if;
  if jsonb_array_length(p->'lines') > 200 then raise exception 'too_many_lines'; end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_item from catalogue_item where id = (v_line->>'item_id')::uuid;
    if not found or v_item.business_id <> v_business then raise exception 'item_not_found'; end if;
    if v_item.id = any(v_seen) then raise exception 'item_ordered_twice'; end if;
    v_seen := v_seen || v_item.id;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_required'; end if;
    v_cost := nullif(v_line->>'unit_cost', '')::numeric;
    if v_cost is not null and v_cost < 0 then raise exception 'cost_invalid'; end if;
    v_total := v_total + round(v_qty * coalesce(v_cost, 0), 2);
    v_doc_lines := v_doc_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'item_id', v_item.id, 'description', v_item.name, 'quantity', v_qty,
      'unit_price', coalesce(v_cost, 0), 'line_total', round(v_qty * coalesce(v_cost, 0), 2))));
  end loop;

  select c.currency_code into v_currency
    from business b join country_config c on c.code = b.country_code where b.id = v_business;

  insert into document (business_id, type, status, currency_code, subtotal, tax_total, total,
                        lines, supplier_id, due_date, source_entity_type, created_by)
  values (v_business, 'purchase_order', 'draft', coalesce(v_currency, 'GHS'), v_total, 0, v_total,
          v_doc_lines, v_supplier, nullif(p->>'expected_on', '')::date, 'stock_order', v_actor)
  returning id into v_doc;

  insert into stock_order (document_id, business_id, supplier_id, location_id, client_ref, status,
                           expected_on, note, ordered_by)
  values (v_doc, v_business, v_supplier, v_location, v_ref, 'open',
          nullif(p->>'expected_on', '')::date, nullif(btrim(coalesce(p->>'note', '')), ''), v_actor);

  insert into stock_order_line (document_id, item_id, ordered, unit_cost)
  select v_doc, (l->>'item_id')::uuid, (l->>'quantity')::numeric, nullif(l->>'unit_cost', '')::numeric
    from jsonb_array_elements(p->'lines') l;

  v_issued := issue_document(jsonb_build_object('document_id', v_doc, 'channel', 'business_web',
                                                'actor_membership_id', coalesce(v_actor::text, '')));

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'inventory.order.placed', 'document', v_doc,
          jsonb_build_object('number', v_issued->>'number', 'supplier_id', v_supplier,
            'lines', jsonb_array_length(v_doc_lines), 'total', v_total));

  return jsonb_build_object('document_id', v_doc, 'number', v_issued->>'number', 'total', v_total,
    'supplier_id', v_supplier, 'duplicate', false);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Nothing more is coming: close what came short, cancel what never came
-- ---------------------------------------------------------------------------
create or replace function close_stock_order(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := nullif(p->>'closed_by', '')::uuid;
  v_so stock_order%rowtype;
  v_any boolean;
  v_status text;
begin
  select * into v_so from stock_order
   where document_id = (p->>'document_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_so.status <> 'open' then
    return jsonb_build_object('document_id', v_so.document_id, 'status', v_so.status, 'unchanged', true);
  end if;
  perform require_purchasing(v_actor, v_so.business_id);

  select bool_or(received > 0) into v_any from stock_order_line where document_id = v_so.document_id;
  v_status := case when coalesce(v_any, false) then 'closed' else 'cancelled' end;

  perform set_config('ascend.order_step', 'close', true);
  update stock_order set status = v_status, closed_by = v_actor, closed_at = now(),
         close_note = nullif(btrim(coalesce(p->>'note', '')), '')
   where document_id = v_so.document_id;
  perform set_config('ascend.order_step', '', true);
  if v_status = 'cancelled' then
    update document set status = 'cancelled', updated_at = now() where id = v_so.document_id;
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_so.business_id, v_actor, 'inventory.order.' || v_status, 'document', v_so.document_id,
          jsonb_build_object('note', nullif(btrim(coalesce(p->>'note', '')), '')));

  return jsonb_build_object('document_id', v_so.document_id, 'status', v_status, 'unchanged', false);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Paying for a delivery that came on credit
-- ---------------------------------------------------------------------------
create or replace function pay_stock_receipt(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_method text := nullif(p->>'payment_method', '');
  v_r stock_receipt%rowtype;
  v_event uuid;
begin
  select * into v_r from stock_receipt
   where id = (p->>'receipt_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'receipt_not_found'; end if;
  perform require_purchasing(v_actor, v_r.business_id);
  if v_method is null or v_method not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'payment_method_required';
  end if;
  if coalesce(v_r.total_cost, 0) <= 0 then raise exception 'cost_required_when_paid'; end if;

  select id into v_event from financial_event
   where source_type = 'stock_receipt' and source_id = v_r.id and kind = 'expense';
  if found then
    return jsonb_build_object('receipt_id', v_r.id, 'money_out_event', v_event, 'already', true);
  end if;

  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, category, location_id, counterparty, method, verification,
                               occurred_at, detail)
  values (v_r.business_id, 'inventory', 'stock_receipt', v_r.id, 'expense', 'cash', 'out', v_r.total_cost,
          v_r.currency_code, 'stock_purchases', v_r.location_id, v_r.supplier_name, v_method, 'merchant_declared',
          now(), jsonb_strip_nulls(jsonb_build_object('reference', v_r.reference, 'paid_later', true,
            'received_at', v_r.received_at, 'recorded_by', v_actor)))
  on conflict (source_type, source_id, kind) do nothing
  returning id into v_event;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_r.business_id, v_actor, 'inventory.receipt.paid', 'stock_receipt', v_r.id,
          jsonb_build_object('amount', v_r.total_cost, 'method', v_method, 'supplier', v_r.supplier_name));

  return jsonb_build_object('receipt_id', v_r.id, 'money_out_event', v_event, 'already', false, 'amount', v_r.total_cost);
end
$fn$;

-- What each supplier is owed, on order and has delivered: one read for the
-- Suppliers tab.
create or replace function supplier_ledger(p_business uuid)
returns table (
  supplier_id uuid,
  open_orders int,
  on_order_value numeric,
  owed numeric,
  unpaid_deliveries int,
  delivered_90d numeric,
  last_delivery_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select s.id,
         (select count(*)::int from stock_order o where o.supplier_id = s.id and o.status = 'open'),
         (select coalesce(sum(greatest(l.ordered - l.received, 0) * coalesce(l.unit_cost, 0)), 0)
            from stock_order o join stock_order_line l on l.document_id = o.document_id
           where o.supplier_id = s.id and o.status = 'open'),
         (select coalesce(sum(r.total_cost), 0) from stock_receipt r
           where r.supplier_id = s.id and r.total_cost > 0
             and not exists (select 1 from financial_event f where f.source_type = 'stock_receipt' and f.source_id = r.id and f.kind = 'expense')),
         (select count(*)::int from stock_receipt r
           where r.supplier_id = s.id and r.total_cost > 0
             and not exists (select 1 from financial_event f where f.source_type = 'stock_receipt' and f.source_id = r.id and f.kind = 'expense')),
         (select coalesce(sum(r.total_cost), 0) from stock_receipt r
           where r.supplier_id = s.id and r.received_at >= now() - interval '90 days'),
         (select max(r.received_at) from stock_receipt r where r.supplier_id = s.id)
    from supplier s
   where s.business_id = p_business and s.active;
$fn$;

revoke all on function require_purchasing(uuid, uuid) from public, anon, authenticated;
revoke all on function save_supplier(jsonb) from public, anon, authenticated;
revoke all on function place_stock_order(jsonb) from public, anon, authenticated;
revoke all on function close_stock_order(jsonb) from public, anon, authenticated;
revoke all on function pay_stock_receipt(jsonb) from public, anon, authenticated;
revoke all on function supplier_ledger(uuid) from public, anon, authenticated;
revoke all on function stock_order_guard() from public, anon, authenticated;
grant execute on function save_supplier(jsonb) to service_role;
grant execute on function place_stock_order(jsonb) to service_role;
grant execute on function close_stock_order(jsonb) to service_role;
grant execute on function pay_stock_receipt(jsonb) to service_role;
grant execute on function supplier_ledger(uuid) to service_role;

-- erase_history (0131) learns the two order tables. Lines before orders.
-- erase_history as in 0131, with two counted substitutions.
create or replace function erase_history(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_table text := p->>'table';
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_by text := nullif(btrim(coalesce(p->>'requested_by', '')), '');
  v_ids text[];
  v_count int;
  v_scope text;
begin
  if v_table is null or v_table not in (
    'stock_movement', 'ledger_entry', 'balance_entry', 'evidence_record',
    'score_result', 'audit_log', 'report_access_log',
    'transaction_line', 'commerce_adjustment', 'financial_event',
    'financial_period_change', 'risk_case_event',
    'stock_receipt', 'stock_receipt_line',
    'stock_count', 'stock_count_line',
    'stock_transfer', 'stock_transfer_line',
    'stock_order', 'stock_order_line'
  ) then
    raise exception 'erase_history: not a protected history table: %', coalesce(v_table, '(none)');
  end if;
  if v_business is null then
    raise exception 'erase_history: business_id is required';
  end if;
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'erase_history: say why, in at least 10 characters';
  end if;
  if v_by is null then
    raise exception 'erase_history: requested_by is required';
  end if;

  if jsonb_typeof(p->'ids') = 'array' then
    select array_agg(x) into v_ids from jsonb_array_elements_text(p->'ids') x;
  end if;

  -- Lasts until this transaction ends, and only this function sets it.
  perform set_config('ascend.history_erasure', v_reason, true);

  -- report_access_log has no business_id; it belongs to a business through
  -- the share that was viewed.
  if v_table = 'report_access_log' then
    v_scope := 'share_id in (select id from public.report_share where business_id = $1)';
  -- A receipt line belongs to a business through its receipt (0125).
  elsif v_table = 'stock_receipt_line' then
    v_scope := 'receipt_id in (select id from public.stock_receipt where business_id = $1)';
  -- A count line belongs to a business through its count (0129).
  elsif v_table = 'stock_count_line' then
    v_scope := 'count_id in (select id from public.stock_count where business_id = $1)';
  -- A transfer line belongs to a business through its transfer (0131).
  elsif v_table = 'stock_transfer_line' then
    v_scope := 'transfer_id in (select id from public.stock_transfer where business_id = $1)';
  -- An order line belongs to a business through its order (0132).
  elsif v_table = 'stock_order_line' then
    v_scope := 'document_id in (select document_id from public.stock_order where business_id = $1)';
  else
    v_scope := 'business_id = $1';
  end if;

  if v_ids is null then
    execute format('delete from public.%I where %s', v_table, v_scope)
      using v_business;
  else
    execute format('delete from public.%I where %s and id::text = any($2)', v_table, v_scope)
      using v_business, v_ids;
  end if;
  get diagnostics v_count = row_count;

  perform set_config('ascend.history_erasure', '', true);

  insert into audit_log (business_id, action, entity_type, detail)
  values (
    null, 'history.erased', v_table,
    jsonb_build_object(
      'business_id', v_business,
      'table', v_table,
      'rows', v_count,
      'ids', coalesce(to_jsonb(v_ids), 'null'::jsonb),
      'reason', v_reason,
      'requested_by', v_by
    )
  );

  return jsonb_build_object('table', v_table, 'erased', v_count);
end;
$$;

revoke all on function erase_history(jsonb) from public, anon, authenticated;
grant execute on function erase_history(jsonb) to service_role;
