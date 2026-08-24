-- AscendSME Connected Platform. Migration 0014: document numbering and
-- issuance (Master PRD §10.4). Issuing is the moment a draft becomes a
-- commercial record: it receives a unique business-aware number and an
-- immutable frozen version (DOC-004). After that, corrections go through
-- revision, cancellation, credit or replacement — never a silent edit
-- (DOC-005).

-- ---------------------------------------------------------------------------
-- Per-business, per-type, per-period sequences. Numbers restart each year so
-- a merchant's books read the way their accountant expects.
-- ---------------------------------------------------------------------------
create table document_sequence (
  business_id uuid not null references business(id),
  type document_type not null,
  period_key text not null,              -- '2026'
  last_number int not null default 0,
  primary key (business_id, type, period_key)
);

alter table document_sequence enable row level security;

-- Short prefixes merchants and customers recognise on paper.
create or replace function document_prefix(p_type document_type)
returns text
language sql immutable
as $$
  select case p_type
    when 'quotation' then 'QUO'
    when 'proforma' then 'PRO'
    when 'invoice' then 'INV'
    when 'receipt' then 'RCP'
    when 'credit_note' then 'CRN'
    when 'purchase_order' then 'PO'
    when 'delivery_note' then 'DN'
    when 'agreement' then 'AGR'
    when 'job_card' then 'JOB'
    when 'statement' then 'STM'
  end;
$$;

-- Claims the next number under a row lock, so two devices issuing at the
-- same instant cannot collide on one number.
create or replace function next_document_number(
  p_business uuid,
  p_type document_type,
  p_period text
)
returns text
language plpgsql
as $$
declare
  v_next int;
begin
  insert into document_sequence (business_id, type, period_key, last_number)
  values (p_business, p_type, p_period, 0)
  on conflict (business_id, type, period_key) do nothing;

  update document_sequence
  set last_number = last_number + 1
  where business_id = p_business and type = p_type and period_key = p_period
  returning last_number into v_next;

  return document_prefix(p_type) || '-' || p_period || '-' || lpad(v_next::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_document: draft becomes a commercial record.
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

  -- Idempotent: re-issuing an issued document returns its existing number
  -- rather than burning another one from the sequence.
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

  -- The frozen version: what the customer received, preserved exactly even
  -- if the catalogue, branding or customer record changes later (DOC-004).
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

  -- An unpaid invoice is a receivable from the moment it is issued
  -- (DOC-017).
  if v_doc.type in ('invoice', 'proforma') and v_doc.customer_id is not null then
    insert into receivable (
      business_id, customer_id, source_entity_type, source_entity_id,
      amount_due, currency_code, due_date
    ) values (
      v_doc.business_id, v_doc.customer_id, 'document', v_doc.id,
      coalesce(v_doc.total, 0), v_doc.currency_code, v_doc.due_date
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
-- Issued documents are immutable in substance. Status, delivery and payment
-- progress still move; content, totals, numbering and the frozen snapshot
-- do not (DOC-004, DOC-005).
-- ---------------------------------------------------------------------------
create or replace function guard_issued_document()
returns trigger
language plpgsql
as $$
begin
  if old.number is null then
    return new; -- still a draft, freely editable
  end if;

  if new.number is distinct from old.number
     or new.issued_snapshot is distinct from old.issued_snapshot
     or new.issued_at is distinct from old.issued_at
     or new.lines is distinct from old.lines
     or new.total is distinct from old.total
     or new.subtotal is distinct from old.subtotal
     or new.tax_total is distinct from old.tax_total
     or new.type is distinct from old.type
     or new.customer_id is distinct from old.customer_id
  then
    raise exception 'issued documents cannot be edited: use a revision, credit note or cancellation';
  end if;

  return new;
end;
$$;

create trigger document_immutable_after_issue
  before update on document
  for each row execute function guard_issued_document();

-- ---------------------------------------------------------------------------
-- convert_document: quotation to invoice, invoice to receipt, and the other
-- approved paths. The new document is a fresh draft that remembers where it
-- came from; the source keeps its own number and history (DOC-003).
-- ---------------------------------------------------------------------------
create or replace function convert_document(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_source document%rowtype;
  v_target document_type := (p->>'to_type')::document_type;
  v_new uuid;
  v_allowed boolean;
begin
  select * into v_source from document where id = (p->>'document_id')::uuid;
  if not found then
    raise exception 'document_not_found';
  end if;
  if v_source.number is null then
    raise exception 'convert_requires_issued_source';
  end if;

  v_allowed := (v_source.type, v_target) in (
    ('quotation', 'proforma'),
    ('quotation', 'invoice'),
    ('proforma', 'invoice'),
    ('invoice', 'receipt'),
    ('invoice', 'credit_note')
  );
  if not v_allowed then
    raise exception 'conversion not allowed: % to %', v_source.type, v_target;
  end if;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines, branding,
    source_entity_type, source_entity_id, converted_from, created_by
  ) values (
    v_source.business_id, v_source.customer_id, v_target, 'draft', v_source.currency_code,
    v_source.subtotal, v_source.tax_total,
    case when v_target = 'credit_note' then -1 * coalesce(v_source.total, 0) else v_source.total end,
    v_source.lines, v_source.branding,
    v_source.source_entity_type, v_source.source_entity_id,
    v_source.id,
    nullif(p->>'actor_membership_id', '')::uuid
  )
  returning id into v_new;

  -- The source is superseded, not erased.
  if v_target in ('invoice', 'proforma') and v_source.type = 'quotation' then
    update document set status = 'accepted', accepted_at = coalesce(accepted_at, now())
    where id = v_source.id and status not in ('accepted', 'superseded');
  end if;

  return jsonb_build_object('document_id', v_new, 'converted_from', v_source.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Receipt straight from a completed POS sale (DOC-002, POS-006). Issued
-- immediately: the customer is standing there.
-- ---------------------------------------------------------------------------
create or replace function issue_receipt_for_sale(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sale sale%rowtype;
  v_doc uuid;
  v_lines jsonb;
begin
  select * into v_sale from sale where id = (p->>'sale_id')::uuid;
  if not found then
    raise exception 'sale_not_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'description', l.description,
    'quantity', l.quantity,
    'unit_price', l.unit_price,
    'line_total', l.line_total
  )), '[]'::jsonb)
  into v_lines
  from sale_line l where l.sale_id = v_sale.id;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines,
    source_entity_type, source_entity_id
  ) values (
    v_sale.business_id, v_sale.customer_id, 'receipt', 'draft', v_sale.currency_code,
    v_sale.subtotal, v_sale.tax_total, v_sale.total, v_lines,
    'sale', v_sale.id
  )
  returning id into v_doc;

  return issue_document(jsonb_build_object(
    'document_id', v_doc,
    'channel', 'pos_terminal',
    'actor_membership_id', v_sale.cashier_membership_id
  ));
end;
$$;
