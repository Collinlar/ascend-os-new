-- AscendSME Connected Platform. Migration 0140: paying an invoice by hand,
-- and asking for it now.
--
-- Modules M3 gives every invoice its own page: the document, what has been
-- paid against it, what is left, and its evidence. Two things that page has
-- to do had no function behind them.
--
-- 1. record_document_payment. Until now only a pay link (confirm_payment_
--    intent, 0086) put a payment against an invoice. A customer who paid in
--    cash at the counter, or sent MoMo straight to the merchant's number,
--    had no way onto the invoice: "Mark paid, make a receipt" converted the
--    invoice into a draft receipt but recorded no payment, so the invoice
--    stayed owed and kept being chased. This records the payment the same
--    way a pay link does, marked as the merchant's word
--    (merchant_declared) rather than the provider's. Everything that
--    follows a payment follows this one too: the receipt is issued by the
--    payment trigger (0052), the commerce core allocates it (0083), the
--    financial event is written (0100), and the invoice's status is worked
--    out from what is paid and credited (0086, 0105).
--
-- 2. send_invoice_reminder. Reminders already go out on their own: every
--    week while an invoice is overdue, at most six (queue_payment_reminders,
--    latest in 0105). This sends one now, when the merchant asks, under the
--    same rules and counted with the same reminders: something still owed,
--    a customer to reach, six at most, and not twice within 20 hours. The
--    route passes the customer's link to the invoice, which the weekly run
--    cannot make.
--
-- Tables and columns touched (checked against the live schema):
--   document: id, business_id, type, status, number, customer_id, total,
--     due_date, updated_at
--   payment: client_ref, business_id, customer_id, method, status,
--     verification, amount, currency_code, provider_reference,
--     source_entity_type, source_entity_id, actor_membership_id, occurred_at
--   receivable: amount_paid, amount_due, settled_at, source_entity_type,
--     source_entity_id
--   document_reminder: document_id, business_id, message_id, sequence, sent_at
--   customer: display_name, phone_e164, email
--   event_outbox: event_type, business_id, actor_membership_id, channel,
--     product_set, entity_type, entity_id, amount, currency_code,
--     verification, payload, business_date

-- ---------------------------------------------------------------------------
-- record_document_payment
-- ---------------------------------------------------------------------------
create or replace function record_document_payment(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_doc document%rowtype;
  v_amount numeric(14,2);
  v_method payment_method;
  v_paid_at timestamptz;
  v_outstanding numeric(14,2);
  v_payment uuid;
  v_existing payment%rowtype;
begin
  perform require_permission(v_actor, v_business, array['documents.create']);

  if v_ref is null then
    raise exception 'client_ref_required';
  end if;

  -- The same tap twice is one payment.
  select * into v_existing from payment where business_id = v_business and client_ref = v_ref;
  if found then
    return jsonb_build_object('payment_id', v_existing.id, 'duplicate', true);
  end if;

  select * into v_doc from document
   where id = (p->>'document_id')::uuid and business_id = v_business
   for update;
  if not found then
    raise exception 'document_not_found';
  end if;
  if v_doc.type <> 'invoice' then
    raise exception 'not_an_invoice';
  end if;
  if v_doc.number is null
     or v_doc.status in ('draft', 'pending_approval', 'change_requested', 'cancelled', 'superseded',
                         'rejected', 'expired', 'archived', 'refunded') then
    raise exception 'invoice_not_open';
  end if;

  begin
    v_amount := round((p->>'amount')::numeric, 2);
  exception when others then
    raise exception 'amount_invalid';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount_invalid';
  end if;

  -- Money the merchant took themselves. A pay link is recorded by the
  -- provider's confirmation, never by hand.
  if coalesce(p->>'method', '') not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'method_invalid';
  end if;
  v_method := (p->>'method')::payment_method;

  v_paid_at := coalesce(nullif(p->>'paid_at', '')::timestamptz, now());
  if v_paid_at > now() + interval '5 minutes' then
    raise exception 'paid_at_in_future';
  end if;

  select a.outstanding into v_outstanding from document_amounts(v_doc.id) a;
  if v_outstanding <= 0.005 then
    raise exception 'nothing_owed';
  end if;
  if v_amount > v_outstanding + 0.005 then
    raise exception 'payment_over_balance: %', v_outstanding;
  end if;

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider_reference,
    source_entity_type, source_entity_id, actor_membership_id, occurred_at
  ) values (
    v_ref, v_business, v_doc.customer_id, v_method, 'confirmed', 'merchant_declared',
    v_amount, v_doc.currency_code, nullif(btrim(coalesce(p->>'reference', '')), ''),
    'document', v_doc.id, v_actor, v_paid_at
  )
  returning id into v_payment;

  -- The older receivable record, kept in step as a pay link keeps it.
  update receivable
     set amount_paid = amount_paid + v_amount,
         settled_at = case when amount_paid + v_amount >= amount_due then now() else settled_at end
   where source_entity_type = 'document' and source_entity_id = v_doc.id;

  update document
     set status = document_settlement_status(v_doc.id), updated_at = now()
   where id = v_doc.id;

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_business, v_actor, 'business_web', 'documents',
    'payment', v_payment, v_amount, v_doc.currency_code, 'merchant_declared',
    jsonb_build_object('purpose', 'document', 'document_id', v_doc.id, 'method', v_method,
                       'recorded_by_hand', true),
    (v_paid_at at time zone 'Africa/Accra')::date
  );

  return jsonb_build_object(
    'payment_id', v_payment,
    'duplicate', false,
    'outstanding', greatest(v_outstanding - v_amount, 0),
    'status', document_settlement_status(v_doc.id)
  );
end;
$fn$;

revoke all on function record_document_payment(jsonb) from public, anon, authenticated;
grant execute on function record_document_payment(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- send_invoice_reminder
-- ---------------------------------------------------------------------------
create or replace function send_invoice_reminder(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_doc document%rowtype;
  v_customer customer%rowtype;
  v_outstanding numeric(14,2);
  v_count int;
  v_last timestamptz;
  v_sequence int;
  v_vars jsonb;
  v_result jsonb;
  v_message uuid;
  v_status text := null;
begin
  perform require_permission(v_actor, v_business, array['documents.create']);

  select * into v_doc from document
   where id = (p->>'document_id')::uuid and business_id = v_business
   for update;
  if not found then
    raise exception 'document_not_found';
  end if;
  if v_doc.type <> 'invoice' or v_doc.number is null
     or v_doc.status in ('draft', 'pending_approval', 'change_requested', 'cancelled', 'superseded',
                         'rejected', 'expired', 'archived', 'refunded', 'paid', 'credited') then
    raise exception 'invoice_not_open';
  end if;

  select a.outstanding into v_outstanding from document_amounts(v_doc.id) a;
  if v_outstanding <= 0.005 then
    raise exception 'nothing_owed';
  end if;

  select * into v_customer from customer where id = v_doc.customer_id;
  if not found or (v_customer.phone_e164 is null and v_customer.email is null) then
    raise exception 'no_way_to_reach';
  end if;

  select count(*)::int, max(sent_at) into v_count, v_last
    from document_reminder where document_id = v_doc.id;
  if v_count >= 6 then
    raise exception 'reminders_used_up';
  end if;
  if v_last is not null and v_last > now() - interval '20 hours' then
    raise exception 'reminded_recently: %', v_last;
  end if;

  v_sequence := v_count + 1;
  v_vars := jsonb_build_object(
    'customer_name', coalesce(v_customer.display_name, 'there'),
    'document_number', v_doc.number,
    'amount', to_char(v_outstanding, 'FM999,999,990.00'),
    'due_date', coalesce(to_char(v_doc.due_date, 'DD Mon YYYY'), 'today'),
    'link', coalesce(p->>'link', '')
  );

  -- The same key the weekly run uses for this reminder, so the two can
  -- never both send the same one.
  if v_customer.phone_e164 is not null then
    v_result := queue_message(jsonb_build_object(
      'business_id', v_business,
      'template_key', 'invoice.reminder',
      'customer_id', v_customer.id,
      'recipient', v_customer.phone_e164,
      'source_entity_type', 'document',
      'source_entity_id', v_doc.id,
      'client_ref', 'reminder:' || v_doc.id::text || ':' || v_sequence::text,
      'variables', v_vars
    ));
    v_message := (v_result->>'message_id')::uuid;
    v_status := v_result->>'status';
  end if;
  if v_customer.email is not null then
    v_result := queue_message(jsonb_build_object(
      'business_id', v_business,
      'template_key', 'invoice.reminder.email',
      'customer_id', v_customer.id,
      'recipient', v_customer.email,
      'source_entity_type', 'document',
      'source_entity_id', v_doc.id,
      'client_ref', 'reminder:' || v_doc.id::text || ':' || v_sequence::text || ':email',
      'variables', v_vars
    ));
    v_message := coalesce(v_message, (v_result->>'message_id')::uuid);
    -- Queued on either channel counts as sent.
    if v_status is distinct from 'queued' then
      v_status := v_result->>'status';
    end if;
  end if;

  -- Only a reminder that is really on its way counts toward the six. One
  -- held back for want of balance or consent is reported, not recorded.
  if v_status = 'queued' then
    insert into document_reminder (document_id, business_id, message_id, sequence)
    values (v_doc.id, v_business, v_message, v_sequence);

    insert into event_outbox (
      event_type, business_id, actor_membership_id, channel, product_set,
      entity_type, entity_id, amount, currency_code, payload, business_date
    ) values (
      'documents.reminder.sent', v_business, v_actor, 'business_web', 'documents',
      'document', v_doc.id, v_outstanding, v_doc.currency_code,
      jsonb_build_object('sequence', v_sequence, 'by_hand', true),
      current_date
    );
  end if;

  return jsonb_build_object('status', v_status, 'sequence', v_sequence, 'message_id', v_message, 'outstanding', v_outstanding);
end;
$fn$;

revoke all on function send_invoice_reminder(jsonb) from public, anon, authenticated;
grant execute on function send_invoice_reminder(jsonb) to service_role;
