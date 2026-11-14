-- ---------------------------------------------------------------------------
-- 0072  History that cannot be rewritten, with one audited way to erase
--
-- docs/ARCHITECTURE.md has always said seven tables are append-only with
-- update and delete revoked. Only audit_log ever had a revoke, and the app
-- talks to the database as the service role, which ignores revokes. So none
-- of the seven was protected: any code path, or a support fix typed into the
-- SQL editor, could rewrite stock history, the ledger, balance, evidence,
-- scores, the audit trail or the record of who viewed a shared report.
--
-- These are the records the Sustainability Score and every readiness report
-- stand on. If they can be edited quietly, the score is a claim, not
-- evidence.
--
-- THE RULE
--   On stock_movement, ledger_entry, balance_entry, evidence_record,
--   score_result, audit_log and report_access_log, UPDATE, DELETE and
--   TRUNCATE are refused by trigger. A trigger applies to the service role
--   too, which a revoke does not. Corrections are new rows: a reversing
--   movement, a reversal entry, a superseding evidence record.
--
-- THE ONE EXCEPTION (decided with Collins, 14 Nov 2026)
--   erase_history() deletes rows from one of these tables for one business,
--   and only with a stated reason, such as a customer's DELETE request under
--   the Ghana Data Protection Act 2012, or removing test data. It records the
--   erasure itself in audit_log before returning. Nothing else can get past
--   the trigger: the permission it sets lasts only for its own transaction
--   and cannot be set through the API.
--
--   The erasure record is written with business_id empty and the business
--   in its detail. Tied to the business, it would stop the business itself
--   from ever being removed.
--
-- Checked before writing: no application code or database function updates
-- or deletes any of the seven tables, nothing upserts into them, and no
-- foreign key cascades a delete into them. So nothing the product does today
-- is refused by this rule.
--
-- NOT covered, on purpose
--   sale and payment are corrected by changing status (reversal) and are
--   touched by customer merges, so a strict rule would break both. They are
--   reshaped by the commerce core in Phase 2, where the right rule is that
--   amounts and lines never change once recorded. Issued documents already
--   have their own guard (0014, document_immutable_after_issue).
--
-- Tables touched: the seven above (triggers only) and audit_log (insert).
-- No column is added or removed.
-- ---------------------------------------------------------------------------

create or replace function refuse_history_change()
returns trigger
language plpgsql
as $$
begin
  -- Set only inside erase_history, for its own transaction.
  if coalesce(current_setting('ascend.history_erasure', true), '') <> '' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception '% is append-only: % is not allowed. Write a correcting row instead, or use erase_history() with a reason.',
    tg_table_name, lower(tg_op)
    using errcode = 'P0001';
end;
$$;

do $do$
declare
  t text;
begin
  foreach t in array array[
    'stock_movement', 'ledger_entry', 'balance_entry', 'evidence_record',
    'score_result', 'audit_log', 'report_access_log'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format(
      'create trigger %I before update or delete on public.%I
         for each row execute function refuse_history_change()',
      t || '_append_only', t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format(
      'create trigger %I before truncate on public.%I
         for each statement execute function refuse_history_change()',
      t || '_no_truncate', t
    );
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- erase_history: the one way through, and it leaves a trace.
--
--   table          one of the seven
--   business_id    whose rows
--   ids            optional: only these rows (any id type, compared as text)
--   reason         required, at least 10 characters, said plainly
--   requested_by   who asked: a person, a support ticket, a test run
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
    'score_result', 'audit_log', 'report_access_log'
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

revoke all on function erase_history(jsonb) from public, anon, authenticated;
grant execute on function erase_history(jsonb) to service_role;
revoke all on function refuse_history_change() from public, anon, authenticated;
