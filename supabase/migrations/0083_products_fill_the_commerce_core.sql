-- ---------------------------------------------------------------------------
-- 0083  Phase 2, step 2b: the products fill the commerce core
--
-- Every sale, shop order, booking, invoice and payment is now copied into
-- the commerce core (0082) by a trigger, inside the same database
-- transaction as the product's own write. Then every existing record is
-- copied in once (the backfill at the end). PHASE_2_PLAN.md section 4 and
-- decisions 1 to 4, approved 14 Nov 2026.
--
-- NO PRODUCT CHANGES. No product function, table or screen is edited. The
-- products keep writing exactly what they wrote before; the core follows.
--
-- A PROJECTION NEVER BLOCKS A SALE. Each trigger catches its own failure,
-- records it in commerce_projection_error, and lets the product's write
-- finish. The core is then missing that record, which the reconciliation
-- (step 2c) reports. A bug here costs a gap in a report, never a sale.
--
-- HOW EACH PRODUCT MAPS
--   Till sale      one transaction (pos / sale). Its lines, one obligation
--                  for the total once it is no longer held, and its
--                  payments allocated to it. A reversal row (reversal_of
--                  set, negative amounts) is not a transaction: the
--                  original becomes reversed.
--   Shop order     one transaction (shop / order), owed from the moment it
--                  is placed (decision 3). Delivery fee is a charge.
--   Booking        one transaction (services / booking). A deposit
--                  obligation when the service asks for one, and the
--                  balance once the service is completed (decision 4). Its
--                  line is written at completion, when the price is final.
--   Invoice, proforma raised on their own: one transaction (documents),
--                  owed once issued. Draft lines follow the draft until it
--                  is issued.
--   Documents raised from something else join that thing's transaction
--                  (decision 2): a receipt for a sale joins the sale; a
--                  credit note joins its invoice; an invoice converted from
--                  a proforma takes over the proforma's transaction. The
--                  link is in commerce_document_link. Quotations are not
--                  transactions.
--   Payment        allocated to the obligations of the transaction it pays,
--                  deposit first, then oldest first. Refund payments and
--                  'credit' tenders (sold on account: nothing was paid) are
--                  not allocated; refunds become adjustments in step 2e.
--
-- A cancellation always has a reason in the core. Where the product did
-- not record one, the core says so in words ("no reason recorded") rather
-- than leaving it blank. Shop orders and till sales have nowhere to keep a
-- reason today; that is a product gap for Phase 6.
--
-- erase_history (0072) now also covers transaction_line, so test data can
-- still be removed, audited, now that recorded lines cannot be deleted.
--
-- Tables and columns read: sale (id, business_id, location_id, customer_id,
-- cashier_membership_id, status, subtotal, discount_total, tax_total, total,
-- currency_code, note, reversal_of, occurred_at), sale_line (all), shop_order
-- (id, business_id, location_id, customer_id, status, subtotal, delivery_fee,
-- total, currency_code, placed_at), shop_order_line (all), service_booking
-- (id, business_id, location_id, customer_id, item_id, status,
-- deposit_required, price_quoted, currency_code, cancellation_reason,
-- created_at), document (id, business_id, customer_id, type, status,
-- currency_code, subtotal, tax_total, total, lines, source_entity_type,
-- source_entity_id, converted_from, payment_id, reason, due_date,
-- created_by, created_at), payment (id, status, method, amount,
-- source_entity_type, source_entity_id, reversal_of, occurred_at),
-- catalogue_item (id, name, base_price), item_variant (id, price_delta).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Which documents belong to which transaction
-- ---------------------------------------------------------------------------
create table if not exists commerce_document_link (
  document_id uuid primary key references document(id),
  business_id uuid not null references business(id),
  transaction_id uuid not null references commercial_transaction(id),
  role text not null check (role in ('origin', 'superseded', 'attached', 'receipt', 'credit_note')),
  created_at timestamptz not null default now()
);
create index if not exists commerce_document_link_transaction on commerce_document_link (transaction_id);

-- Projection failures: operational, so the reconciliation can name them.
create table if not exists commerce_projection_error (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  origin_type text not null,
  origin_id uuid,
  business_id uuid,
  error text not null
);
create index if not exists commerce_projection_error_at on commerce_projection_error (at desc);

alter table commerce_document_link enable row level security;
alter table commerce_projection_error enable row level security;
revoke all on commerce_document_link, commerce_projection_error from anon, authenticated;

-- Recorded lines may now be removed only by the audited erase_history.
create or replace function transaction_line_delete_kept()
returns trigger language plpgsql as $$
declare v_status commerce_status;
begin
  if coalesce(current_setting('ascend.history_erasure', true), '') <> '' then
    return old;
  end if;
  select status into v_status from commercial_transaction where id = old.transaction_id;
  if v_status is distinct from 'draft' and v_status is not null then
    raise exception 'transaction_line_price_kept: a line cannot be removed once the sale is recorded; record an adjustment instead';
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- Building blocks
-- ---------------------------------------------------------------------------

-- The transaction a product record or document belongs to, if any.
create or replace function commerce_transaction_for(p_type text, p_id uuid)
returns uuid language sql stable as $$
  select case
    when p_id is null then null
    when p_type = 'document' then
      (select transaction_id from commerce_document_link where document_id = p_id)
    when p_type = 'sale' then
      (select t.id from commercial_transaction t
        where t.origin_type = 'sale'
          and t.origin_id = coalesce((select reversal_of from sale where id = p_id), p_id))
    when p_type in ('shop_order', 'service_booking') then
      (select id from commercial_transaction where origin_type = p_type and origin_id = p_id)
    when p_type = 'payment' then
      (select commerce_transaction_for(source_entity_type, source_entity_id) from payment where id = p_id)
  end
$$;

-- Insert or bring up to date the transaction for one product record.
create or replace function commerce_put_transaction(
  p_business uuid, p_customer uuid, p_location uuid,
  p_channel text, p_product text, p_type text,
  p_origin_type text, p_origin_id uuid, p_currency text,
  p_subtotal numeric, p_discount numeric, p_tax numeric, p_charges numeric, p_total numeric,
  p_status commerce_status, p_product_status text, p_reason text,
  p_actor uuid, p_occurred timestamptz
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into commercial_transaction (
    business_id, customer_id, location_id, channel, originating_product, transaction_type,
    origin_type, origin_id, currency_code, subtotal, discount_total, tax_total, charges_total,
    total, status, product_status, cancellation_reason, actor_membership_id, occurred_at
  ) values (
    p_business, p_customer, p_location, p_channel, p_product, p_type,
    p_origin_type, p_origin_id, coalesce(p_currency, 'GHS'),
    coalesce(p_subtotal, 0), coalesce(p_discount, 0), coalesce(p_tax, 0), coalesce(p_charges, 0),
    coalesce(p_total, 0), p_status, p_product_status,
    case when p_status = 'cancelled' then p_reason end,
    p_actor, coalesce(p_occurred, now())
  )
  on conflict (origin_type, origin_id) do update set
    customer_id = excluded.customer_id,
    location_id = excluded.location_id,
    transaction_type = excluded.transaction_type,
    currency_code = excluded.currency_code,
    subtotal = excluded.subtotal,
    discount_total = excluded.discount_total,
    tax_total = excluded.tax_total,
    charges_total = excluded.charges_total,
    total = excluded.total,
    status = excluded.status,
    product_status = excluded.product_status,
    cancellation_reason = excluded.cancellation_reason,
    updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Make sure the transaction has an obligation of this kind for this amount.
create or replace function commerce_put_obligation(p_tx uuid, p_kind text, p_amount numeric, p_due date)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from payment_obligation
   where transaction_id = p_tx and kind = p_kind and status not in ('cancelled', 'written_off')
   order by created_at limit 1;
  if v_id is null then
    insert into payment_obligation (business_id, transaction_id, kind, amount_due, currency_code, due_date)
    select business_id, id, p_kind, greatest(coalesce(p_amount, 0), 0), currency_code, p_due
      from commercial_transaction where id = p_tx
    returning id into v_id;
  else
    update payment_obligation
       set amount_due = greatest(coalesce(p_amount, 0), 0),
           due_date = coalesce(p_due, due_date),
           updated_at = now()
     where id = v_id
       and (amount_due is distinct from greatest(coalesce(p_amount, 0), 0)
            or (p_due is not null and due_date is distinct from p_due));
  end if;
  return v_id;
end $$;

-- A cancelled or reversed transaction no longer owes what nobody has paid.
create or replace function commerce_close_obligations(p_tx uuid, p_reason text)
returns void language sql as $$
  update payment_obligation o
     set status = 'cancelled', status_reason = p_reason, updated_at = now()
   where o.transaction_id = p_tx
     and o.status = 'open'
     and not exists (
       select 1 from payment_allocation a join payment p on p.id = a.payment_id
        where a.obligation_id = o.id and p.status in ('confirmed', 'pending', 'initiated'))
$$;

-- Each obligation's status follows its confirmed allocations.
create or replace function commerce_refresh_obligations(p_tx uuid)
returns void language sql as $$
  update payment_obligation o
     set status = case
           when x.paid >= o.amount_due and o.amount_due > 0 then 'paid'
           when x.paid > 0 then 'partially_paid'
           else 'open' end,
         settled_at = case when x.paid >= o.amount_due and o.amount_due > 0
                           then coalesce(o.settled_at, now()) end,
         updated_at = now()
    from (
      select o2.id, coalesce(sum(a.amount) filter (where p.status = 'confirmed'), 0) as paid
        from payment_obligation o2
        left join payment_allocation a on a.obligation_id = o2.id
        left join payment p on p.id = a.payment_id
       where o2.transaction_id = p_tx
       group by o2.id
    ) x
   where o.id = x.id
     and o.status not in ('cancelled', 'written_off')
     and o.status is distinct from (case
           when x.paid >= o.amount_due and o.amount_due > 0 then 'paid'
           when x.paid > 0 then 'partially_paid'
           else 'open' end)
$$;

-- After the header changes: close what is no longer owed, refresh the rest.
create or replace function commerce_settle_state(p_tx uuid)
returns void language plpgsql as $$
declare v_t commercial_transaction%rowtype;
begin
  select * into v_t from commercial_transaction where id = p_tx;
  if v_t.status in ('cancelled', 'reversed') then
    perform commerce_close_obligations(p_tx,
      coalesce(v_t.cancellation_reason, 'the ' || v_t.transaction_type || ' was ' || v_t.status::text));
  end if;
  perform commerce_refresh_obligations(p_tx);
end $$;

-- ---------------------------------------------------------------------------
-- Till sale
-- ---------------------------------------------------------------------------
create or replace function commerce_sync_sale(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  s sale%rowtype;
  v_status commerce_status;
  v_tx uuid;
  v_next int;
begin
  select * into s from sale where id = p_id;
  if not found or s.reversal_of is not null or s.total < 0 then return; end if;
  v_status := commerce_status('sale', s.status::text);
  v_tx := commerce_put_transaction(
    s.business_id, s.customer_id, s.location_id, 'pos', 'pos', 'sale', 'sale', s.id, s.currency_code,
    s.subtotal, s.discount_total, s.tax_total, 0, s.total, v_status, s.status::text,
    coalesce(nullif(btrim(s.note), ''), 'cancelled at the till (no reason recorded)'),
    s.cashier_membership_id, s.occurred_at);

  select coalesce(max(line_number), 0) into v_next from transaction_line where transaction_id = v_tx;
  insert into transaction_line (
    business_id, transaction_id, line_number, origin_line_id, item_id, variant_id, description,
    quantity, unit_price, discount, tax, line_total, price_source, price_overridden_by)
  select s.business_id, v_tx, v_next + row_number() over (order by sl.id), sl.id, sl.item_id, sl.variant_id,
         coalesce(sl.description, ci.name), sl.quantity, sl.unit_price, coalesce(sl.discount, 0), coalesce(sl.tax, 0), sl.line_total,
         x.src, case when x.src = 'manual_override' then s.cashier_membership_id end
    from sale_line sl
    left join catalogue_item ci on ci.id = sl.item_id
    left join item_variant iv on iv.id = sl.variant_id
    cross join lateral (select case
        when p_backfill then 'unknown'
        when sl.item_id is null then 'manual_override'
        when sl.unit_price = ci.base_price + coalesce(iv.price_delta, 0) then 'catalogue'
        else 'manual_override' end as src) x
   where sl.sale_id = s.id
     and not exists (select 1 from transaction_line t where t.transaction_id = v_tx and t.origin_line_id = sl.id);

  if v_status <> 'draft' then
    perform commerce_put_obligation(v_tx, 'full', s.total, null);
  end if;
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- Shop order
-- ---------------------------------------------------------------------------
create or replace function commerce_sync_shop_order(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  o shop_order%rowtype;
  v_status commerce_status;
  v_tx uuid;
  v_next int;
begin
  select * into o from shop_order where id = p_id;
  if not found then return; end if;
  v_status := commerce_status('shop_order', o.status::text);
  v_tx := commerce_put_transaction(
    o.business_id, o.customer_id, o.location_id, 'shop', 'shop', 'order', 'shop_order', o.id, o.currency_code,
    o.subtotal, 0, 0, coalesce(o.delivery_fee, 0), o.total, v_status, o.status::text,
    'cancelled in Shop (no reason recorded)', null, o.placed_at);

  select coalesce(max(line_number), 0) into v_next from transaction_line where transaction_id = v_tx;
  insert into transaction_line (
    business_id, transaction_id, line_number, origin_line_id, item_id, variant_id, description,
    quantity, unit_price, line_total, price_source)
  select o.business_id, v_tx, v_next + row_number() over (order by ol.id), ol.id, ol.item_id, ol.variant_id,
         coalesce(ol.description, ci.name), ol.quantity, ol.unit_price, ol.line_total,
         case
           when p_backfill then 'unknown'
           when ol.unit_price = ci.base_price + coalesce(iv.price_delta, 0) then 'catalogue'
           else 'shop_override' end
    from shop_order_line ol
    left join catalogue_item ci on ci.id = ol.item_id
    left join item_variant iv on iv.id = ol.variant_id
   where ol.order_id = o.id
     and not exists (select 1 from transaction_line t where t.transaction_id = v_tx and t.origin_line_id = ol.id);

  -- Owed from the moment it is placed (decision 3).
  perform commerce_put_obligation(v_tx, 'full', o.total, null);
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
create or replace function commerce_sync_service_booking(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  b service_booking%rowtype;
  v_status commerce_status;
  v_tx uuid;
  v_total numeric := 0;
  v_final uuid;
  v_others numeric;
  v_item catalogue_item%rowtype;
begin
  select * into b from service_booking where id = p_id;
  if not found then return; end if;
  v_status := commerce_status('service_booking', b.status::text);
  v_total := coalesce(b.price_quoted, 0);
  v_tx := commerce_put_transaction(
    b.business_id, b.customer_id, b.location_id, 'services', 'services', 'booking', 'service_booking', b.id,
    b.currency_code, v_total, 0, 0, 0, v_total, v_status, b.status::text,
    coalesce(nullif(btrim(b.cancellation_reason), ''),
             case when b.status = 'no_show' then 'the customer did not come'
                  else 'cancelled in Services (no reason recorded)' end),
    null, b.created_at);

  -- A deposit when the service asks for one (decision 4).
  if coalesce(b.deposit_required, 0) > 0 then
    perform commerce_put_obligation(v_tx, 'deposit', b.deposit_required, null);
  end if;

  if b.status = 'completed' then
    -- The line is written once, at completion, when the price is final.
    if not exists (select 1 from transaction_line where transaction_id = v_tx) and v_total > 0 then
      select * into v_item from catalogue_item where id = b.item_id;
      insert into transaction_line (business_id, transaction_id, line_number, item_id, description,
                                    quantity, unit_price, line_total, price_source)
      values (b.business_id, v_tx, 1, b.item_id, coalesce(v_item.name, 'Service'), 1, v_total, v_total,
              case when p_backfill then 'unknown'
                   when v_total = v_item.base_price then 'catalogue' else 'quote' end);
    end if;
    -- The balance: whatever the other obligations do not already cover.
    select id into v_final from payment_obligation
     where transaction_id = v_tx and kind in ('balance', 'full') and status not in ('cancelled', 'written_off')
     order by created_at limit 1;
    select coalesce(sum(amount_due), 0) into v_others from payment_obligation
     where transaction_id = v_tx and status not in ('cancelled', 'written_off') and id is distinct from v_final;
    if v_final is not null then
      update payment_obligation set amount_due = greatest(v_total - v_others, 0), updated_at = now()
       where id = v_final and amount_due <> greatest(v_total - v_others, 0);
    elsif v_total - v_others > 0 then
      perform commerce_put_obligation(v_tx, case when v_others > 0 then 'balance' else 'full' end,
                                      v_total - v_others, null);
    end if;
  end if;
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create or replace function commerce_link_document(p_doc uuid, p_business uuid, p_tx uuid, p_role text)
returns void language sql as $$
  insert into commerce_document_link (document_id, business_id, transaction_id, role)
  values (p_doc, p_business, p_tx, p_role)
  on conflict (document_id) do update set transaction_id = excluded.transaction_id, role = excluded.role
$$;

create or replace function commerce_sync_document(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  d document%rowtype;
  v_link commerce_document_link%rowtype;
  v_from commerce_document_link%rowtype;
  v_from_type document_type;
  v_tx uuid;
  v_status commerce_status;
  v_existing commercial_transaction%rowtype;
begin
  select * into d from document where id = p_id;
  if not found then return; end if;
  select * into v_link from commerce_document_link where document_id = d.id;

  -- Already linked as something other than the origin: nothing to project.
  if found and v_link.role <> 'origin' then return; end if;

  if v_link.document_id is null then
    -- Raised from a sale, order or booking: join that transaction (decision 2).
    if d.source_entity_type in ('sale', 'shop_order', 'service_booking') then
      v_tx := commerce_transaction_for(d.source_entity_type, d.source_entity_id);
      if v_tx is not null then
        perform commerce_link_document(d.id, d.business_id, v_tx,
          case d.type when 'receipt' then 'receipt' when 'credit_note' then 'credit_note' else 'attached' end);
        return;
      end if;
    end if;

    if d.type not in ('invoice', 'proforma') then
      -- Receipts and credit notes join whatever they were raised from.
      v_tx := coalesce(
        commerce_transaction_for('document', d.converted_from),
        commerce_transaction_for(d.source_entity_type, d.source_entity_id),
        commerce_transaction_for('payment', d.payment_id));
      if v_tx is not null and d.type in ('receipt', 'credit_note') then
        perform commerce_link_document(d.id, d.business_id, v_tx, d.type::text);
      end if;
      return;   -- quotations, purchase orders and the rest are not transactions
    end if;

    -- An invoice converted from a proforma takes over its transaction.
    if d.converted_from is not null then
      select * into v_from from commerce_document_link where document_id = d.converted_from;
      select type into v_from_type from document where id = d.converted_from;
      if v_from.role = 'origin' and v_from_type = 'proforma' and d.type = 'invoice' then
        update commercial_transaction
           set origin_id = d.id, transaction_type = 'invoice', updated_at = now()
         where id = v_from.transaction_id;
        perform commerce_link_document(d.converted_from, d.business_id, v_from.transaction_id, 'superseded');
        perform commerce_link_document(d.id, d.business_id, v_from.transaction_id, 'origin');
        -- While the invoice is still a draft, the proforma's terms stand.
        if d.status in ('draft', 'pending_approval', 'change_requested') then return; end if;
      end if;
    end if;
  end if;

  v_status := commerce_status('document', d.status::text);
  select * into v_existing from commercial_transaction where origin_type = 'document' and origin_id = d.id;

  -- Draft lines follow the draft; once issued they are kept.
  if v_existing.id is not null and v_existing.status = 'draft' then
    delete from transaction_line where transaction_id = v_existing.id;
  end if;

  v_tx := commerce_put_transaction(
    d.business_id, d.customer_id, null, 'documents', 'documents', d.type::text, 'document', d.id,
    d.currency_code, coalesce(d.subtotal, d.total), 0, coalesce(d.tax_total, 0), 0, coalesce(d.total, 0),
    v_status, d.status::text,
    coalesce(nullif(btrim(d.reason), ''),
             case d.status when 'rejected' then 'rejected by the customer'
                           when 'expired' then 'expired before it was paid'
                           else 'cancelled in Documents (no reason recorded)' end),
    d.created_by, coalesce(d.issued_at, d.created_at));
  perform commerce_link_document(d.id, d.business_id, v_tx, 'origin');

  if not exists (select 1 from transaction_line where transaction_id = v_tx) then
    insert into transaction_line (business_id, transaction_id, line_number, item_id, variant_id, description,
                                  quantity, unit_price, discount, tax, line_total, price_source)
    select d.business_id, v_tx, l.n, nullif(l.v->>'item_id', '')::uuid, nullif(l.v->>'variant_id', '')::uuid,
           l.v->>'description', (l.v->>'quantity')::numeric, (l.v->>'unit_price')::numeric,
           coalesce(nullif(l.v->>'discount', '')::numeric, 0), coalesce(nullif(l.v->>'tax', '')::numeric, 0),
           (l.v->>'line_total')::numeric, 'document'
      from jsonb_array_elements(coalesce(d.lines, '[]'::jsonb)) with ordinality as l(v, n);
  end if;

  -- Owed once issued.
  if v_status <> 'draft' then
    perform commerce_put_obligation(v_tx, 'full', coalesce(d.total, 0), d.due_date);
  end if;
  perform commerce_settle_state(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- Payment
-- ---------------------------------------------------------------------------
create or replace function commerce_sync_payment(p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
declare
  pay payment%rowtype;
  v_tx uuid;
  v_t commercial_transaction%rowtype;
  v_left numeric;
  v_take numeric;
  v_last uuid;
  r record;
begin
  select * into pay from payment where id = p_id;
  if not found then return; end if;
  v_tx := commerce_transaction_for(pay.source_entity_type, pay.source_entity_id);
  if v_tx is null then return; end if;

  if pay.amount > 0 and pay.reversal_of is null and pay.method <> 'credit'
     and pay.status in ('confirmed', 'pending', 'initiated')
     and not exists (select 1 from payment_allocation where payment_id = pay.id) then
    v_left := pay.amount;
    for r in
      select o.id, o.amount_due - coalesce((
               select sum(a.amount) from payment_allocation a join payment p2 on p2.id = a.payment_id
                where a.obligation_id = o.id and p2.status in ('confirmed', 'pending', 'initiated')), 0) as outstanding
        from payment_obligation o
       where o.transaction_id = v_tx and o.status not in ('cancelled', 'written_off')
       order by (o.kind = 'deposit') desc, o.created_at
    loop
      v_last := r.id;
      v_take := least(v_left, greatest(r.outstanding, 0));
      if v_take > 0 then
        insert into payment_allocation (business_id, payment_id, obligation_id, amount)
        values (pay.business_id, pay.id, r.id, v_take);
        v_left := v_left - v_take;
      end if;
      exit when v_left <= 0;
    end loop;

    if v_left > 0 then
      if v_last is null then
        -- Paid before anything was owed (an advance on a booking, say).
        select * into v_t from commercial_transaction where id = v_tx;
        v_last := commerce_put_obligation(v_tx,
          case when v_t.origin_type = 'service_booking' and v_t.status <> 'completed' then 'deposit' else 'full' end,
          v_left, null);
      end if;
      -- Paid more than was owed: kept against the last obligation, visible
      -- as overpaid rather than lost.
      insert into payment_allocation (business_id, payment_id, obligation_id, amount)
      values (pay.business_id, pay.id, v_last, v_left)
      on conflict (payment_id, obligation_id) do update set amount = payment_allocation.amount + excluded.amount;
    end if;
  end if;
  perform commerce_refresh_obligations(v_tx);
end $$;

-- ---------------------------------------------------------------------------
-- One entry point, and the failure net
-- ---------------------------------------------------------------------------
create or replace function commerce_sync(p_kind text, p_id uuid, p_backfill boolean default false)
returns void language plpgsql as $$
begin
  case p_kind
    when 'sale' then perform commerce_sync_sale(p_id, p_backfill);
    when 'shop_order' then perform commerce_sync_shop_order(p_id, p_backfill);
    when 'service_booking' then perform commerce_sync_service_booking(p_id, p_backfill);
    when 'document' then perform commerce_sync_document(p_id, p_backfill);
    when 'payment' then perform commerce_sync_payment(p_id, p_backfill);
    else raise exception 'commerce_sync: unknown kind %', p_kind;
  end case;
end $$;

-- Never lets a failure reach the product's write. Returns false if it failed.
create or replace function commerce_sync_logged(p_kind text, p_id uuid, p_business uuid, p_backfill boolean default false)
returns boolean language plpgsql as $$
begin
  begin
    perform commerce_sync(p_kind, p_id, p_backfill);
    return true;
  exception when others then
    insert into commerce_projection_error (origin_type, origin_id, business_id, error)
    values (p_kind, p_id, p_business, sqlerrm);
    return false;
  end;
end $$;

-- Trigger: argument 1 is the kind, argument 2 the column holding its id.
create or replace function commerce_project()
returns trigger language plpgsql as $$
declare v jsonb := to_jsonb(new);
begin
  perform commerce_sync_logged(tg_argv[0], (v->>tg_argv[1])::uuid, nullif(v->>'business_id', '')::uuid, false);
  return null;
end $$;

drop trigger if exists commerce_project on sale;
create trigger commerce_project after insert or update on sale
  for each row execute function commerce_project('sale', 'id');
drop trigger if exists commerce_project on sale_line;
create trigger commerce_project after insert on sale_line
  for each row execute function commerce_project('sale', 'sale_id');
drop trigger if exists commerce_project on shop_order;
create trigger commerce_project after insert or update on shop_order
  for each row execute function commerce_project('shop_order', 'id');
drop trigger if exists commerce_project on shop_order_line;
create trigger commerce_project after insert on shop_order_line
  for each row execute function commerce_project('shop_order', 'order_id');
drop trigger if exists commerce_project on service_booking;
create trigger commerce_project after insert or update on service_booking
  for each row execute function commerce_project('service_booking', 'id');
drop trigger if exists commerce_project on document;
create trigger commerce_project after insert or update on document
  for each row execute function commerce_project('document', 'id');
drop trigger if exists commerce_project on payment;
create trigger commerce_project after insert or update on payment
  for each row execute function commerce_project('payment', 'id');

do $$
declare f text;
begin
  foreach f in array array[
    'commerce_transaction_for(text, uuid)',
    'commerce_put_transaction(uuid, uuid, uuid, text, text, text, text, uuid, text, numeric, numeric, numeric, numeric, numeric, commerce_status, text, text, uuid, timestamp with time zone)',
    'commerce_put_obligation(uuid, text, numeric, date)',
    'commerce_close_obligations(uuid, text)',
    'commerce_refresh_obligations(uuid)',
    'commerce_settle_state(uuid)',
    'commerce_sync_sale(uuid, boolean)',
    'commerce_sync_shop_order(uuid, boolean)',
    'commerce_sync_service_booking(uuid, boolean)',
    'commerce_link_document(uuid, uuid, uuid, text)',
    'commerce_sync_document(uuid, boolean)',
    'commerce_sync_payment(uuid, boolean)',
    'commerce_sync(text, uuid, boolean)',
    'commerce_sync_logged(text, uuid, uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- erase_history (0072), unchanged except that transaction_line joins the
-- protected tables it may erase from. Generated from the 0072 definition.
-- ---------------------------------------------------------------------------
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
    'transaction_line'
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

-- ---------------------------------------------------------------------------
-- Backfill: every existing record, once, in the order it happened.
-- Failures are recorded, not raised, exactly as for live writes.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_fail int := 0; v_done int := 0;
begin
  for r in select 'sale' k, id, business_id from sale where reversal_of is null order by occurred_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'shop_order' k, id, business_id from shop_order order by placed_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'service_booking' k, id, business_id from service_booking order by created_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'document' k, id, business_id from document order by created_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  for r in select 'payment' k, id, business_id from payment order by occurred_at, id loop
    v_done := v_done + 1; if not commerce_sync_logged(r.k, r.id, r.business_id, true) then v_fail := v_fail + 1; end if; end loop;
  raise notice 'commerce backfill: % records read, % could not be copied (see commerce_projection_error)', v_done, v_fail;
end $$;
