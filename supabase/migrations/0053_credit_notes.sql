-- ---------------------------------------------------------------------------
-- 0053  A credit note that says why, and cannot exceed what is owed
--
-- Credit notes were reachable only by converting an invoice, which copied
-- the whole thing and negated the total. That satisfied DOC-CRE-001 and
-- 002 and nothing else:
--
--   No reason was captured, though DOC-CRE-003 requires one. A credit
--   note is a business reducing money it is owed, and "why" is the whole
--   audit trail. An accountant, a bank or a tax officer reading a stack of
--   credit notes with no reasons has been told nothing.
--
--   Only full credit was possible (DOC-CRE-004). A customer returning one
--   item out of six had to be credited for all six.
--
--   Nothing capped the total (DOC-CRE-008). An invoice for GHS 500 could
--   be credited five times over, and the books would show a business that
--   owed its customer money it had never been paid.
--
-- The conversion route is closed in the same migration. Leaving it open
-- would leave the rules optional, and a rule that can be walked around is
-- not a rule.
-- ---------------------------------------------------------------------------

-- Why the document exists, in the merchant's own words. On a credit note
-- it is required. It is deliberately general: a cancellation wants one too.
alter table document
  add column if not exists reason text;

-- ---------------------------------------------------------------------------
-- issue_credit_note: the only way to make one.
--
--   p.document_id           the invoice being credited
--   p.reason                required, and required to say something
--   p.amount                optional; full remaining credit when absent
--   p.actor_membership_id   who decided
--
-- Credit note totals are stored negative, which is the convention the
-- conversion path already set and which makes a sum over a customer's
-- documents come out right without special-casing the type.
-- ---------------------------------------------------------------------------
create or replace function issue_credit_note(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
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
  return issue_document(jsonb_build_object(
    'document_id', v_new,
    'channel', 'business_web',
    'actor_membership_id', p->>'actor_membership_id'
  )) || jsonb_build_object(
    'credited', v_requested,
    'remaining', round(v_eligible - v_requested, 2)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Close the back door. Everything else convert_document does is unchanged.
-- ---------------------------------------------------------------------------
create or replace function convert_document(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
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

  -- invoice -> credit_note is gone. It has its own function, because a
  -- credit note needs a reason and a limit that a generic conversion
  -- cannot enforce (0053).
  v_allowed := (v_source.type, v_target) in (
    ('quotation', 'proforma'),
    ('quotation', 'invoice'),
    ('proforma', 'invoice'),
    ('invoice', 'receipt')
  );
  if not v_allowed then
    if v_target = 'credit_note' then
      raise exception 'use_issue_credit_note';
    end if;
    raise exception 'conversion not allowed: % to %', v_source.type, v_target;
  end if;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines, branding,
    source_entity_type, source_entity_id, converted_from, created_by
  ) values (
    v_source.business_id, v_source.customer_id, v_target, 'draft', v_source.currency_code,
    v_source.subtotal, v_source.tax_total, v_source.total,
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
$fn$;

revoke all on function issue_credit_note(jsonb) from public, anon, authenticated;
grant execute on function issue_credit_note(jsonb) to service_role;
