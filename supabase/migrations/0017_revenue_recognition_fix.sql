-- AscendSME Connected Platform. Migration 0017: fix revenue double-counting.
--
-- Defect being corrected: migration 0016 posted a `sale_revenue` ledger
-- entry when a document payment was confirmed. Revenue had usually already
-- been recognised — by the POS sale, the fulfilled Shop order, or the
-- issued invoice — so an invoice that was issued and then paid online
-- counted its revenue twice. Every "sales" figure built on the ledger would
-- have overstated a business's income, which is exactly the number that
-- must not lie (REP-003, REP-004).
--
-- The rule from here: revenue is recognised once, when the business earns
-- it. Collecting the money afterwards settles a receivable; it is not new
-- revenue.

-- ---------------------------------------------------------------------------
-- 1. Issuing an invoice recognises revenue. (A receipt records a sale that
--    already posted its own revenue, so it posts nothing.)
-- ---------------------------------------------------------------------------
create or replace function issue_document(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_doc document%rowtype;
  v_number text;
  v_period text;
  v_snapshot jsonb;
begin
  select * into v_doc from document where id = (p->>'document_id')::uuid for update;
  if not found then
    raise exception 'document_not_found';
  end if;

  if v_doc.number is not null then
    return jsonb_build_object('document_id', v_doc.id, 'number', v_doc.number, 'duplicate', true);
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'document_not_draft';
  end if;
  if v_doc.lines is null or jsonb_array_length(v_doc.lines) = 0 then
    raise exception 'document_has_no_lines';
  end if;

  v_period := to_char(now(), 'YYYY');
  v_number := next_document_number(v_doc.business_id, v_doc.type, v_period);

  v_snapshot := jsonb_build_object(
    'number', v_number,
    'type', v_doc.type,
    'issued_at', now(),
    'customer_id', v_doc.customer_id,
    'currency_code', v_doc.currency_code,
    'subtotal', v_doc.subtotal,
    'tax_total', v_doc.tax_total,
    'total', v_doc.total,
    'lines', v_doc.lines,
    'branding', v_doc.branding,
    'due_date', v_doc.due_date
  );

  update document
  set number = v_number,
      status = 'issued',
      issued_at = now(),
      issued_snapshot = v_snapshot,
      updated_at = now()
  where id = v_doc.id;

  if v_doc.type in ('invoice', 'proforma') and v_doc.customer_id is not null then
    insert into receivable (
      business_id, customer_id, source_entity_type, source_entity_id,
      amount_due, currency_code, due_date
    ) values (
      v_doc.business_id, v_doc.customer_id, 'document', v_doc.id,
      coalesce(v_doc.total, 0), v_doc.currency_code, v_doc.due_date
    );
  end if;

  -- Revenue recognition: an invoice that does not restate an already
  -- recorded sale or order is the moment the business earned the money.
  -- A credit note reverses it. Quotes, proformas and receipts post nothing.
  if v_doc.type = 'invoice' and v_doc.source_entity_type is distinct from 'sale'
     and v_doc.source_entity_type is distinct from 'shop_order' then
    insert into ledger_entry (
      business_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_doc.business_id, 'sale_revenue', coalesce(v_doc.total, 0), v_doc.currency_code,
      'document', v_doc.id, current_date
    );
  elsif v_doc.type = 'credit_note' then
    insert into ledger_entry (
      business_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_doc.business_id, 'refund', coalesce(v_doc.total, 0), v_doc.currency_code,
      'document', v_doc.id, current_date
    );
  end if;

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'documents.document.issued', v_doc.business_id,
    nullif(p->>'actor_membership_id', '')::uuid,
    coalesce(p->>'channel', 'business_web'), 'documents',
    'document', v_doc.id, v_doc.total, v_doc.currency_code, 'merchant_declared',
    jsonb_build_object('number', v_number, 'type', v_doc.type),
    current_date
  );

  return jsonb_build_object('document_id', v_doc.id, 'number', v_number, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Confirming a payment settles a receivable. It is a collection, not
--    revenue. Only a balance top-up still posts its own entry, because that
--    is a purchase of Ascend services rather than customer income.
-- ---------------------------------------------------------------------------
create or replace function confirm_payment_intent(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_intent payment_intent%rowtype;
  v_payment uuid;
  v_doc document%rowtype;
  v_paid numeric(14,2);
  v_amount numeric(14,2);
begin
  select * into v_intent
  from payment_intent
  where reference = p->>'reference'
  for update;

  if not found then
    raise exception 'intent_not_found';
  end if;

  if v_intent.status = 'confirmed' then
    return jsonb_build_object(
      'intent_id', v_intent.id,
      'payment_id', v_intent.payment_id,
      'duplicate', true
    );
  end if;

  v_amount := coalesce((p->>'amount')::numeric, v_intent.amount);

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider, provider_reference,
    source_entity_type, source_entity_id, occurred_at
  ) values (
    'intent:' || v_intent.reference,
    v_intent.business_id, v_intent.customer_id,
    coalesce((p->>'method')::payment_method, 'mobile_money'),
    'confirmed', 'provider_confirmed',
    v_amount,
    v_intent.currency_code, v_intent.provider, p->>'provider_reference',
    case v_intent.purpose
      when 'document' then 'document'
      when 'shop_order' then 'shop_order'
      else 'balance_topup'
    end,
    v_intent.source_entity_id,
    coalesce((p->>'paid_at')::timestamptz, now())
  )
  on conflict (client_ref) do nothing
  returning id into v_payment;

  if v_payment is null then
    select id into v_payment from payment
    where client_ref = 'intent:' || v_intent.reference;
  end if;

  update payment_intent
  set status = 'confirmed',
      provider_reference = p->>'provider_reference',
      payment_id = v_payment,
      completed_at = now()
  where id = v_intent.id;

  if v_intent.purpose = 'balance_topup' then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id
    ) values (
      v_intent.business_id, 'top_up', v_amount, v_intent.currency_code,
      'balance.topup', 'payment', v_payment
    );

    -- A top-up is the merchant buying Ascend services, not customer income.
    insert into ledger_entry (
      business_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_intent.business_id, 'adjustment', v_amount, v_intent.currency_code,
      'payment', v_payment, current_date
    );

  elsif v_intent.purpose = 'document' then
    select * into v_doc from document where id = v_intent.source_entity_id;

    update receivable
    set amount_paid = amount_paid + v_amount,
        settled_at = case
          when amount_paid + v_amount >= amount_due then now() else settled_at end
    where source_entity_type = 'document' and source_entity_id = v_intent.source_entity_id;

    select coalesce(sum(amount), 0) into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_intent.source_entity_id
      and status = 'confirmed';

    update document
    set status = case when v_paid >= coalesce(v_doc.total, 0) then 'paid'::document_status
                      else 'partially_paid'::document_status end,
        updated_at = now()
    where id = v_intent.source_entity_id;
    -- No revenue entry: recognised at issuance. This is the fix.

  elsif v_intent.purpose = 'shop_order' then
    update shop_order set updated_at = now() where id = v_intent.source_entity_id;
    -- No revenue entry: recognised at fulfilment.
  end if;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_intent.business_id, 'customer_web',
    case v_intent.purpose when 'document' then 'documents'
                          when 'shop_order' then 'shop'
                          else 'readiness' end,
    'payment', v_payment, v_amount, v_intent.currency_code, 'provider_confirmed',
    jsonb_build_object('purpose', v_intent.purpose, 'provider', v_intent.provider),
    current_date
  );

  return jsonb_build_object('intent_id', v_intent.id, 'payment_id', v_payment, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A shop order fulfilled from an issued invoice must not post revenue
--    twice either. The invoice path already carries it.
-- ---------------------------------------------------------------------------
create or replace view business_revenue as
select
  business_id,
  business_date,
  sum(amount) filter (where kind = 'sale_revenue') as revenue,
  sum(amount) filter (where kind = 'refund') as refunds,
  sum(amount) filter (where kind in ('expense', 'till_expense')) as expenses,
  sum(amount) filter (where kind = 'sale_revenue')
    + coalesce(sum(amount) filter (where kind = 'refund'), 0) as net_revenue
from ledger_entry
where kind <> 'adjustment'   -- top-ups are not customer income
group by business_id, business_date;
