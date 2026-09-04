-- ---------------------------------------------------------------------------
-- 0052  A confirmed payment produces a receipt, whatever it was paid against
--
-- 0051 connected the till. This connects everything else: a Shop order, a
-- Services booking, an invoice paid from a WhatsApp link. The Documents PRD
-- asks for a receipt at the same step in three different journeys (13.4.5,
-- 13.5.7, and every invoice settlement), and the honest reading is that
-- these are not three features. A receipt acknowledges a payment. There is
-- one payment ledger already, so there is one rule.
--
-- Where the boundary sits, and why:
--
--   A till sale keeps one receipt per sale, from 0051. A split tender is
--   two payments against one sale, and the customer walked out holding one
--   piece of paper, so two receipt documents for it would be a lie about
--   what happened at the counter.
--
--   Everything else gets one receipt per payment. An invoice settled in
--   two instalments earns two receipts, because each instalment is a
--   payment the customer is entitled to see acknowledged, and a deposit on
--   a service is exactly that case (13.5.5).
--
-- document.payment_id is what makes that rule enforceable rather than
-- merely intended.
-- ---------------------------------------------------------------------------

alter table document
  add column if not exists payment_id uuid references payment(id);

-- One receipt per payment, in the schema rather than in a convention. A
-- retried webhook, a double-fired trigger, or a future code path cannot
-- put two receipts against one payment.
create unique index if not exists document_receipt_one_per_payment
  on document (payment_id) where payment_id is not null;

create index if not exists document_payment_idx
  on document (payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- The receipt for one confirmed payment.
--
-- Lines come from whatever was paid for. A Shop order has its own lines, a
-- booking is a single service, and an invoice already carries the lines the
-- merchant wrote, so each is read from its own record rather than
-- reconstructed. In every case the catalogue link travels with the line, so
-- a receipt can still be joined back to what was sold (DOC-LIN-004).
-- ---------------------------------------------------------------------------
create or replace function issue_receipt_for_payment(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pay payment%rowtype;
  v_doc uuid;
  v_lines jsonb;
  v_customer uuid;
  v_existing document%rowtype;
  v_order shop_order%rowtype;
  v_booking service_booking%rowtype;
  v_source document%rowtype;
begin
  select * into v_pay from payment where id = (p->>'payment_id')::uuid;
  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_pay.status <> 'confirmed' then
    return jsonb_build_object('skipped', v_pay.status);
  end if;

  -- The till already issues one receipt for the whole sale.
  if v_pay.source_entity_type = 'sale' then
    return jsonb_build_object('skipped', 'sale_receipt_covers_it');
  end if;

  select * into v_existing from document where payment_id = v_pay.id limit 1;
  if found then
    return jsonb_build_object(
      'document_id', v_existing.id, 'number', v_existing.number, 'duplicate', true
    );
  end if;

  v_customer := v_pay.customer_id;

  if v_pay.source_entity_type = 'shop_order' then
    select * into v_order from shop_order where id = v_pay.source_entity_id;
    if not found then
      return jsonb_build_object('skipped', 'order_not_found');
    end if;
    v_customer := coalesce(v_customer, v_order.customer_id);

    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', l.item_id,
      'variant_id', l.variant_id,
      'description', l.description,
      'quantity', l.quantity,
      'unit_price', l.unit_price,
      'line_total', l.line_total
    ) order by l.id), '[]'::jsonb)
    into v_lines
    from shop_order_line l where l.order_id = v_order.id;

    -- Delivery is part of what the customer paid, so it belongs on the
    -- receipt rather than hiding inside a total that does not add up.
    if coalesce(v_order.delivery_fee, 0) > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'description', 'Delivery',
        'quantity', 1,
        'unit_price', v_order.delivery_fee,
        'line_total', v_order.delivery_fee
      ));
    end if;

  elsif v_pay.source_entity_type = 'service_booking' then
    select * into v_booking from service_booking where id = v_pay.source_entity_id;
    if not found then
      return jsonb_build_object('skipped', 'booking_not_found');
    end if;
    v_customer := coalesce(v_customer, v_booking.customer_id);

    -- A deposit is not the whole service, and the receipt should say which
    -- it is rather than implying the job is paid off (13.5.5).
    v_lines := jsonb_build_array(jsonb_build_object(
      'item_id', v_booking.item_id,
      'description',
        coalesce(
          (select ci.name from catalogue_item ci where ci.id = v_booking.item_id),
          'Service'
        )
        || case
             when v_pay.amount < coalesce(v_booking.price_quoted, v_pay.amount)
               then ' (deposit)'
             else ''
           end,
      'quantity', 1,
      'unit_price', v_pay.amount,
      'line_total', v_pay.amount
    ));

  elsif v_pay.source_entity_type = 'document' then
    select * into v_source from document where id = v_pay.source_entity_id;
    if not found then
      return jsonb_build_object('skipped', 'document_not_found');
    end if;
    v_customer := coalesce(v_customer, v_source.customer_id);

    -- What the customer is being receipted for is the payment, against the
    -- document it settles. The invoice keeps its own lines; the receipt
    -- states the amount and what it was for.
    v_lines := jsonb_build_array(jsonb_build_object(
      'description', 'Payment against ' || coalesce(v_source.number, v_source.type::text),
      'quantity', 1,
      'unit_price', v_pay.amount,
      'line_total', v_pay.amount
    ));

  else
    return jsonb_build_object('skipped', 'unsupported_source');
  end if;

  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    return jsonb_build_object('skipped', 'no_lines');
  end if;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines,
    source_entity_type, source_entity_id, payment_id, created_by
  ) values (
    v_pay.business_id, v_customer, 'receipt', 'draft', v_pay.currency_code,
    v_pay.amount, 0, v_pay.amount, v_lines,
    v_pay.source_entity_type, v_pay.source_entity_id, v_pay.id,
    v_pay.actor_membership_id
  )
  returning id into v_doc;

  return issue_document(jsonb_build_object(
    'document_id', v_doc,
    'channel', 'system',
    'actor_membership_id', v_pay.actor_membership_id
  ));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Fires when a payment becomes confirmed, whether it was confirmed on
-- insert or moved there later by a provider webhook.
--
-- Same rule as 0051: a receipt problem must never cost a payment. The
-- money landing is the fact that matters; the document is the record of it,
-- and a record that fails can be backfilled.
-- ---------------------------------------------------------------------------
create or replace function payment_receipt_document()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status <> 'confirmed' then
    return null;
  end if;

  -- Nested rather than "tg_op = 'UPDATE' and old.status = ...". SQL does
  -- not promise to stop evaluating an AND once the left side is false, and
  -- OLD does not exist on an insert, so the one-line version raises on
  -- every new payment. 0046 shipped that bug once already.
  if tg_op = 'UPDATE' then
    if old.status = 'confirmed' then
      return null;
    end if;
  end if;

  begin
    perform issue_receipt_for_payment(jsonb_build_object('payment_id', new.id));
  exception when others then
    insert into audit_log (business_id, action, entity_type, entity_id, detail)
    values (
      new.business_id, 'documents.receipt.failed', 'payment', new.id,
      jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate)
    );
  end;
  return null;
end;
$fn$;

drop trigger if exists payment_receipt_document_trg on payment;

create constraint trigger payment_receipt_document_trg
  after insert or update on payment
  deferrable initially deferred
  for each row
  execute function payment_receipt_document();

-- ---------------------------------------------------------------------------
-- Payments that have already been confirmed and never receipted.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r record;
  v_done int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_result jsonb;
begin
  for r in
    select p.id
    from payment p
    where p.status = 'confirmed'
      and p.source_entity_type <> 'sale'
      and not exists (select 1 from document d where d.payment_id = p.id)
    order by p.created_at
  loop
    begin
      v_result := issue_receipt_for_payment(jsonb_build_object('payment_id', r.id));
      if v_result ? 'skipped' then
        v_skipped := v_skipped + 1;
      else
        v_done := v_done + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'receipt backfill failed for payment %: %', r.id, sqlerrm;
    end;
  end loop;

  raise notice 'payment receipt backfill: % issued, % skipped, % failed',
    v_done, v_skipped, v_failed;
end
$backfill$;

revoke all on function issue_receipt_for_payment(jsonb) from public, anon, authenticated;
grant execute on function issue_receipt_for_payment(jsonb) to service_role;
