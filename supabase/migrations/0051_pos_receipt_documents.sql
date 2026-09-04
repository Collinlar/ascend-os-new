-- ---------------------------------------------------------------------------
-- 0051  A POS sale produces a receipt document
--
-- issue_receipt_for_sale was written in 0014 and has never been called. Not
-- from the app, not from another function, not once. The live database has
-- eight completed sales and zero receipt documents.
--
-- So the till has been keeping its own paper trail and the Documents engine
-- has known nothing about it, which is the exact split the connected
-- platform exists to prevent: a POS receipt must not become a separate
-- record (Documents PRD 12, journey 13.3, DOC-RCT-001..020).
--
-- What this costs while it is broken is not only tidiness. issue_document
-- emits documents.document.issued, which is what the evidence ledger reads
-- to build financial-activity confidence. Every POS sale has been earning
-- the business nothing toward readiness.
--
-- Three changes:
--
--   issue_receipt_for_sale becomes idempotent and carries the catalogue
--   link on each line, so a receipt line points at the item it sold.
--
--   A deferred trigger issues the receipt for every completed sale, so no
--   code path can forget. Deferred because sale_line rows are written
--   after the sale row inside the same transaction, and a receipt built
--   before its lines exist would be empty.
--
--   The trigger can never fail a sale. 0041 exists because six real sales
--   were lost to a receipt-numbering collision after the money had been
--   taken. A document problem is not permitted to repeat that: the failure
--   is recorded and the sale stands.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Idempotent, and linked to the catalogue.
--
-- The line now carries item_id. Without it a receipt line is loose text and
-- nothing can join a document back to what was actually sold, which breaks
-- the zero-silo promise at exactly the point it matters most (DOC-LIN-001,
-- DOC-LIN-004).
-- ---------------------------------------------------------------------------
create or replace function issue_receipt_for_sale(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sale sale%rowtype;
  v_doc uuid;
  v_lines jsonb;
  v_existing document%rowtype;
begin
  select * into v_sale from sale where id = (p->>'sale_id')::uuid;
  if not found then
    raise exception 'sale_not_found';
  end if;

  -- A reversed or held sale is not a receipt. Only a completed one is.
  if v_sale.status <> 'completed' then
    return jsonb_build_object('skipped', v_sale.status);
  end if;

  -- Already done. Returning the existing receipt rather than minting a
  -- second one for the same sale, which would put two numbers against one
  -- payment and corrupt the count of what the business actually sold.
  select * into v_existing
  from document
  where source_entity_type = 'sale'
    and source_entity_id = v_sale.id
    and type = 'receipt'
  limit 1;

  if found then
    return jsonb_build_object(
      'document_id', v_existing.id, 'number', v_existing.number, 'duplicate', true
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', l.item_id,
    'variant_id', l.variant_id,
    'description', l.description,
    'quantity', l.quantity,
    'unit_price', l.unit_price,
    'discount', l.discount,
    'tax', l.tax,
    'line_total', l.line_total
  ) order by l.id), '[]'::jsonb)
  into v_lines
  from sale_line l where l.sale_id = v_sale.id;

  -- issue_document refuses a document with no lines, and rightly so. A sale
  -- with no lines is a data problem, not a receipt.
  if jsonb_array_length(v_lines) = 0 then
    return jsonb_build_object('skipped', 'no_lines');
  end if;

  insert into document (
    business_id, customer_id, type, status, currency_code,
    subtotal, tax_total, total, lines,
    source_entity_type, source_entity_id, created_by
  ) values (
    v_sale.business_id, v_sale.customer_id, 'receipt', 'draft', v_sale.currency_code,
    v_sale.subtotal, v_sale.tax_total, v_sale.total, v_lines,
    'sale', v_sale.id, v_sale.cashier_membership_id
  )
  returning id into v_doc;

  return issue_document(jsonb_build_object(
    'document_id', v_doc,
    'channel', 'pos_terminal',
    'actor_membership_id', v_sale.cashier_membership_id
  ));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Every completed sale gets one, without anybody remembering to ask.
--
-- The exception block is the important part. A sale that has been rung up
-- and paid for must land whatever else goes wrong, so a failure here is
-- written to the audit log and swallowed. Better a missing receipt document
-- that can be backfilled than a missing sale that cannot be recovered.
-- ---------------------------------------------------------------------------
create or replace function sale_receipt_document()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  begin
    perform issue_receipt_for_sale(jsonb_build_object('sale_id', new.id));
  exception when others then
    insert into audit_log (business_id, action, entity_type, entity_id, detail)
    values (
      new.business_id, 'documents.receipt.failed', 'sale', new.id,
      jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate)
    );
  end;
  return null;
end;
$fn$;

-- Deferred to the end of the transaction: complete_pos_sale writes the sale
-- row first and its lines after, so an immediate trigger would build a
-- receipt from lines that do not exist yet.
drop trigger if exists sale_receipt_document_trg on sale;

create constraint trigger sale_receipt_document_trg
  after insert on sale
  deferrable initially deferred
  for each row
  execute function sale_receipt_document();

-- ---------------------------------------------------------------------------
-- The sales that already happened. They were real, the money was taken, and
-- they deserve their receipts and their evidence.
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r record;
  v_done int := 0;
  v_failed int := 0;
begin
  for r in
    select s.id
    from sale s
    where s.status = 'completed'
      and not exists (
        select 1 from document d
        where d.source_entity_type = 'sale'
          and d.source_entity_id = s.id
          and d.type = 'receipt'
      )
    order by s.occurred_at
  loop
    begin
      perform issue_receipt_for_sale(jsonb_build_object('sale_id', r.id));
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'receipt backfill failed for sale %: %', r.id, sqlerrm;
    end;
  end loop;

  raise notice 'receipt backfill: % issued, % failed', v_done, v_failed;
end
$backfill$;

revoke all on function issue_receipt_for_sale(jsonb) from public, anon, authenticated;
grant execute on function issue_receipt_for_sale(jsonb) to service_role;
