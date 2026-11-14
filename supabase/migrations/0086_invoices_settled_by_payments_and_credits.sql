-- ---------------------------------------------------------------------------
-- 0086  Documents: an invoice settled by payments and credits says so
--
-- Documents worked out an invoice's status, and what is still owed on it,
-- from confirmed payments alone. Credit notes never counted, and (until
-- 0085) neither did refunds. So:
--   * an invoice part paid and part credited stayed "partially paid" though
--     nothing was owed;
--   * an invoice credited in full stayed "issued", and could go overdue;
--   * an overdue reminder told the customer to pay money that had been
--     credited (queue_payment_reminders);
--   * the list of what customers owe counted it too (outstanding_receivables).
-- The status "credited" existed for exactly this (mark_overdue_documents,
-- 0056, already treats it as settled) but nothing ever set it.
--
-- ONE FIGURE, ONE RULE
--   document_amounts(document) what an invoice's money adds up to: paid
--                              (confirmed payments less refunds), credited
--                              (its issued credit notes), and outstanding.
--   document_settlement_status(document) the status that follows:
--     paid and credited cover the total   -> paid, or credited if nothing
--                                            was paid (all of it credited)
--     some paid, not all                  -> partially_paid
--     nothing paid                        -> unchanged (issued, sent,
--                                            viewed, overdue), or back to
--                                            issued if it read paid before
--   A draft, cancelled, superseded, rejected, expired, archived or refunded
--   document is never changed by it.
--
-- WHERE IT IS USED (generated from the current definitions; each edit
-- counted, nothing else in them changes)
--   confirm_payment_intent (0085)  a payment lands
--   complete_refund (0085)         a refund completes
--   issue_credit_note (0053)       a credit note is issued: the invoice it
--                                  credits is brought up to date
--   queue_payment_reminders (0057) reminds only for what is still owed, and
--                                  says that amount
--   outstanding_receivables (0056) lists only what is still owed
--
-- Existing invoices and proformas are brought up to date once at the end.
-- On live that is one invoice: 400 GHS, credited in full, reads "credited".
--
-- Tables and columns read: document (id, type, status, number, total,
-- converted_from), payment (amount, status, reversal_of,
-- source_entity_type, source_entity_id).
-- ---------------------------------------------------------------------------

create or replace function document_amounts(p_document uuid)
returns table (total numeric, paid numeric, credited numeric, outstanding numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(d.total, 0)::numeric(14,2),
         x.paid::numeric(14,2),
         x.credited::numeric(14,2),
         greatest(coalesce(d.total, 0) - x.paid - x.credited, 0)::numeric(14,2)
    from document d
    cross join lateral (
      select coalesce((select sum(p.amount) filter (where p.status = 'confirmed')
                            - coalesce(sum(p.amount) filter (where p.status = 'refunded' and p.reversal_of is not null), 0)
                         from payment p
                        where p.source_entity_type = 'document' and p.source_entity_id = d.id), 0) as paid,
             coalesce((select sum(abs(coalesce(c.total, 0)))
                         from document c
                        where c.converted_from = d.id and c.type = 'credit_note'
                          and c.status not in ('draft', 'pending_approval', 'change_requested', 'cancelled')), 0) as credited
    ) x
   where d.id = p_document
$fn$;

create or replace function document_settlement_status(p_document uuid)
returns document_status
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc document%rowtype;
  a record;
begin
  select * into v_doc from document where id = p_document;
  if not found then return null; end if;
  if v_doc.number is null
     or v_doc.type not in ('invoice', 'proforma')
     or v_doc.status in ('draft', 'pending_approval', 'change_requested', 'cancelled', 'superseded',
                         'rejected', 'expired', 'archived', 'refunded') then
    return v_doc.status;
  end if;
  select * into a from document_amounts(p_document);
  if a.total > 0 and a.paid + a.credited >= a.total - 0.005 then
    return case when a.paid > 0.005 then 'paid' else 'credited' end::document_status;
  end if;
  if a.paid > 0.005 then
    return 'partially_paid';
  end if;
  if v_doc.status in ('paid', 'partially_paid', 'credited') then
    return 'issued';
  end if;
  return v_doc.status;
end
$fn$;

revoke all on function document_amounts(uuid) from public, anon, authenticated;
revoke all on function document_settlement_status(uuid) from public, anon, authenticated;
grant execute on function document_amounts(uuid) to service_role;
grant execute on function document_settlement_status(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The five functions that decide or report what an invoice owes.
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
      when 'service_booking' then 'service_booking'
      else 'balance_topup'
    end,
    v_intent.source_entity_id,
    coalesce((p->>'paid_at')::timestamptz, now())
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_payment;

  if v_payment is null then
    select id into v_payment from payment
    where client_ref = 'intent:' || v_intent.reference
      and business_id = v_intent.business_id;
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

    -- Paid less refunded (0085), as in complete_refund.
    select coalesce(sum(amount) filter (where status = 'confirmed'), 0)
         - coalesce(sum(amount) filter (where status = 'refunded' and reversal_of is not null), 0)
    into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_intent.source_entity_id;

    -- Paid and credited together decide the status (0086).
    update document
    set status = document_settlement_status(v_intent.source_entity_id),
        updated_at = now()
    where id = v_intent.source_entity_id;

  elsif v_intent.purpose = 'service_booking' then
    -- The deposit landed: the slot is theirs, and the hold no longer
    -- applies. Revenue waits for completion, as it does for every service.
    update service_booking
    set deposit_paid = deposit_paid + v_amount,
        hold_expires_at = null,
        updated_at = now()
    where id = v_intent.source_entity_id;

  elsif v_intent.purpose = 'shop_order' then
    update shop_order set updated_at = now() where id = v_intent.source_entity_id;
  end if;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_intent.business_id, 'customer_web',
    case v_intent.purpose when 'document' then 'documents'
                          when 'shop_order' then 'shop'
                          when 'service_booking' then 'services'
                          else 'readiness' end,
    'payment', v_payment, v_amount, v_intent.currency_code, 'provider_confirmed',
    jsonb_build_object('purpose', v_intent.purpose, 'provider', v_intent.provider),
    current_date
  );

  return jsonb_build_object('intent_id', v_intent.id, 'payment_id', v_payment, 'duplicate', false);
end;
$$;

create or replace function complete_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_request refund_request%rowtype;
  v_original payment%rowtype;
  v_refund_payment uuid;
  v_paid numeric(14,2);
  v_doc document%rowtype;
begin
  select * into v_request from refund_request
  where provider_reference = p->>'provider_reference'
     or id = nullif(p->>'refund_id', '')::uuid
  for update;

  if not found then
    raise exception 'refund_not_found';
  end if;
  if v_request.status = 'completed' then
    return jsonb_build_object('refund_id', v_request.id, 'duplicate', true);
  end if;

  select * into v_original from payment where id = v_request.payment_id;

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider, provider_reference,
    source_entity_type, source_entity_id, reversal_of, occurred_at
  ) values (
    'refund:' || v_request.id::text,
    v_request.business_id, v_original.customer_id, v_original.method,
    'refunded', 'provider_confirmed',
    v_request.amount, v_request.currency_code, v_original.provider,
    p->>'provider_reference',
    v_original.source_entity_type, v_original.source_entity_id,
    v_original.id,
    now()
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_refund_payment;

  if v_refund_payment is null then
    select id into v_refund_payment from payment
    where client_ref = 'refund:' || v_request.id::text
      and business_id = v_request.business_id;
  end if;

  update refund_request
  set status = 'completed',
      provider_reference = coalesce(p->>'provider_reference', provider_reference),
      refund_payment_id = v_refund_payment,
      completed_at = now()
  where id = v_request.id;

  -- Money leaving is a refund, not negative revenue.
  insert into ledger_entry (
    business_id, kind, amount, currency_code,
    source_entity_type, source_entity_id, business_date
  ) values (
    v_request.business_id, 'refund', -1 * v_request.amount, v_request.currency_code,
    'payment', v_refund_payment, current_date
  );

  -- Unwind whatever the original payment settled.
  if v_original.source_entity_type = 'document' then
    update receivable
    set amount_paid = greatest(amount_paid - v_request.amount, 0),
        settled_at = null
    where source_entity_type = 'document'
      and source_entity_id = v_original.source_entity_id;

    select * into v_doc from document where id = v_original.source_entity_id;
    -- Paid less refunded (0085): the refund row is 'refunded', never
    -- 'confirmed', so counting only confirmed payments left a refunded
    -- invoice marked paid.
    select coalesce(sum(amount) filter (where status = 'confirmed'), 0)
         - coalesce(sum(amount) filter (where status = 'refunded' and reversal_of is not null), 0)
    into v_paid
    from payment
    where source_entity_type = 'document'
      and source_entity_id = v_original.source_entity_id;

    -- Paid and credited together decide the status (0086).
    update document
    set status = document_settlement_status(v_original.source_entity_id),
        updated_at = now()
    where id = v_original.source_entity_id;

  elsif v_original.source_entity_type = 'service_booking' then
    update service_booking
    set deposit_paid = greatest(deposit_paid - v_request.amount, 0),
        updated_at = now()
    where id = v_original.source_entity_id;
  end if;

  insert into event_outbox (
    event_type, business_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    correction_of, payload, business_date
  ) values (
    'finance.payment.refunded', v_request.business_id, 'system',
    case v_original.source_entity_type
      when 'document' then 'documents'
      when 'shop_order' then 'shop'
      when 'service_booking' then 'services'
      else 'readiness' end,
    'payment', v_refund_payment, v_request.amount, v_request.currency_code,
    'provider_confirmed',
    null,
    jsonb_build_object('refund_of', v_original.id, 'reason', v_request.reason),
    current_date
  );

  return jsonb_build_object(
    'refund_id', v_request.id,
    'refund_payment_id', v_refund_payment,
    'duplicate', false
  );
end;
$$;

create or replace function issue_credit_note(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_result jsonb;
  v_invoice document%rowtype;
  v_reason text := btrim(coalesce(p->>'reason', ''));
  v_requested numeric(14,2);
  v_already numeric(14,2);
  v_eligible numeric(14,2);
  v_lines jsonb;
  v_new uuid;
begin
  select * into v_invoice from document where id = (p->>'document_id')::uuid for update;
  if not found then
    raise exception 'document_not_found';
  end if;
  if v_invoice.type <> 'invoice' then
    raise exception 'credit_note_needs_an_invoice';
  end if;
  -- An unissued invoice is still a draft. Editing it is the correction.
  if v_invoice.number is null then
    raise exception 'credit_note_needs_an_issued_invoice';
  end if;

  -- DOC-CRE-003. Four characters is not a high bar, but it stops an empty
  -- string and a stray keystroke from passing as an explanation.
  if length(v_reason) < 4 then
    raise exception 'credit_note_needs_a_reason';
  end if;

  -- What has already been credited against this invoice.
  select coalesce(sum(abs(coalesce(total, 0))), 0)
  into v_already
  from document
  where converted_from = v_invoice.id
    and type = 'credit_note'
    and status <> 'cancelled';

  v_eligible := round(coalesce(v_invoice.total, 0) - v_already, 2);
  if v_eligible <= 0 then
    raise exception 'invoice_already_fully_credited';
  end if;

  v_requested := round(coalesce((p->>'amount')::numeric, v_eligible), 2);
  if v_requested <= 0 then
    raise exception 'credit_must_be_positive';
  end if;

  -- DOC-CRE-008. The override the requirement allows for is deliberately
  -- not implemented here: nobody has defined who may authorise it, and a
  -- cap that anyone can lift is not a cap.
  if v_requested > v_eligible then
    raise exception 'credit_exceeds_eligible_amount: % of % remaining',
      v_requested, v_eligible;
  end if;

  if v_requested = v_eligible and v_already = 0 then
    -- Crediting the whole invoice: the credit note mirrors what was
    -- charged, line for line, so the customer can see it reversed.
    v_lines := v_invoice.lines;
  else
    -- A partial credit is one stated amount against a named invoice.
    -- Inventing line splits the merchant did not ask for would put words
    -- in their mouth about what was returned.
    v_lines := jsonb_build_array(jsonb_build_object(
      'description', 'Credit against ' || v_invoice.number || ' · ' || v_reason,
      'quantity', 1,
      'unit_price', v_requested,
      'line_total', v_requested
    ));
  end if;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines, branding, reason,
    source_entity_type, source_entity_id, converted_from, created_by
  ) values (
    v_invoice.business_id, v_invoice.customer_id, 'credit_note', 'draft',
    v_invoice.currency_code,
    -1 * v_requested, 0, -1 * v_requested,
    v_lines, v_invoice.branding, v_reason,
    v_invoice.source_entity_type, v_invoice.source_entity_id,
    v_invoice.id,
    nullif(p->>'actor_membership_id', '')::uuid
  )
  returning id into v_new;

  -- Issued immediately. A credit note is a decision that has been taken,
  -- and a draft one sitting unissued tells the customer nothing while the
  -- money it represents is already gone from the merchant's expectations.
  v_result := issue_document(jsonb_build_object(
    'document_id', v_new,
    'channel', 'business_web',
    'actor_membership_id', p->>'actor_membership_id'
  ));

  -- The invoice it credits now reads what its payments and credits add up
  -- to: paid, credited, or still part paid (0086).
  update document
     set status = document_settlement_status(v_invoice.id), updated_at = now()
   where id = v_invoice.id
     and status is distinct from document_settlement_status(v_invoice.id);

  return v_result || jsonb_build_object(
    'credited', v_requested,
    'remaining', round(v_eligible - v_requested, 2)
  );
end;
$fn$;

create or replace function queue_payment_reminders(p_limit int default 50)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_sent int := 0;
  v_skipped int := 0;
  v_any boolean;
  v_result jsonb;
  v_sequence int;
  v_vars jsonb;
  v_message uuid;
begin
  for r in
    select d.id, d.business_id, d.customer_id, d.number, d.total, d.due_date,
           c.display_name, c.phone_e164, c.email,
           coalesce(paid.amount, 0) as paid,
           coalesce(rem.n, 0) as reminders,
           rem.last_sent
    from document d
    join customer c on c.id = d.customer_id
    left join lateral (
      -- Paid less refunded, plus what was credited (0086): the reminder asks
      -- only for what is really still owed.
      select a.paid + a.credited as amount from document_amounts(d.id) a
    ) paid on true
    left join lateral (
      select count(*)::int as n, max(sent_at) as last_sent
      from document_reminder dr
      where dr.document_id = d.id
    ) rem on true
    where d.type = 'invoice'
      and d.status = 'overdue'
      and (c.phone_e164 is not null or c.email is not null)
      and coalesce(d.total, 0) - coalesce(paid.amount, 0) > 0.005
      and coalesce(rem.n, 0) < 6
      and (rem.last_sent is null or rem.last_sent < now() - interval '7 days')
    order by d.due_date
    limit p_limit
  loop
    v_sequence := r.reminders + 1;
    v_any := false;
    v_message := null;

    v_vars := jsonb_build_object(
      'customer_name', coalesce(r.display_name, 'there'),
      'document_number', coalesce(r.number, ''),
      'amount', to_char(coalesce(r.total, 0) - r.paid, 'FM999,999,990.00'),
      'due_date', to_char(r.due_date, 'DD Mon YYYY'),
      'link', ''
    );

    begin
      if r.phone_e164 is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder',
          'customer_id', r.customer_id,
          'recipient', r.phone_e164,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text,
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := (v_result->>'message_id')::uuid;
        end if;
      end if;

      if r.email is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder.email',
          'customer_id', r.customer_id,
          'recipient', r.email,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text || ':email',
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := coalesce(v_message, (v_result->>'message_id')::uuid);
        end if;
      end if;

      if v_any then
        insert into document_reminder (document_id, business_id, message_id, sequence)
        values (r.id, r.business_id, v_message, v_sequence);
        v_sent := v_sent + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      insert into audit_log (business_id, action, entity_type, entity_id, detail)
      values (r.business_id, 'documents.reminder.failed', 'document', r.id,
              jsonb_build_object('error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('queued', v_sent, 'skipped', v_skipped);
end;
$fn$;

create or replace function outstanding_receivables(p_business uuid)
returns table (
  document_id uuid,
  number text,
  customer_name text,
  customer_phone text,
  total numeric,
  paid numeric,
  outstanding numeric,
  due_date date,
  days_overdue int,
  reminders int,
  status document_status
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.number, c.display_name, c.phone_e164,
         coalesce(d.total, 0),
         coalesce(paid.amount, 0),
         round(coalesce(d.total, 0) - coalesce(paid.amount, 0) - coalesce(paid.credited, 0), 2),
         d.due_date,
         greatest(0, (current_date - d.due_date))::int,
         coalesce(rem.n, 0),
         d.status
  from document d
  left join customer c on c.id = d.customer_id
  left join lateral (
    -- Paid less refunded; credits counted separately (0086).
    select a.paid as amount, a.credited from document_amounts(d.id) a
  ) paid on true
  left join lateral (
    select count(*)::int as n from document_reminder dr where dr.document_id = d.id
  ) rem on true
  where d.business_id = p_business
    and d.type = 'invoice'
    and d.number is not null
    and d.status in ('issued', 'sent', 'delivered', 'viewed', 'partially_paid', 'overdue')
    and coalesce(d.total, 0) - coalesce(paid.amount, 0) - coalesce(paid.credited, 0) > 0.005
  order by d.due_date nulls last;
$fn$;

-- ---------------------------------------------------------------------------
-- Existing invoices and proformas, once.
-- ---------------------------------------------------------------------------
do $$
declare v_changed int;
begin
  with moved as (
    update document d
       set status = document_settlement_status(d.id), updated_at = now()
     where d.type in ('invoice', 'proforma')
       and d.number is not null
       and d.status is distinct from document_settlement_status(d.id)
    returning 1
  )
  select count(*)::int into v_changed from moved;
  raise notice 'documents: % invoices or proformas now read what their payments and credits add up to', v_changed;
end $$;
