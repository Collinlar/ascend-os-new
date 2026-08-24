-- AscendSME Connected Platform. Migration 0041: a sale is never lost to a
-- receipt number (POS-RCP-008, POS-SYN-001, POS-OFF-004).
--
-- A till counts its receipt numbers in its own local store. Clear that
-- store, re-pair the device, or hand it a new one, and the counter restarts
-- at one while the server still holds those numbers. sale carries
-- unique (business_id, receipt_number), so every sale after the reset was
-- rejected permanently, parked in the queue, and never retried.
--
-- Six real sales sat on a live till that way. The money had been taken and
-- the customer had walked out with the receipt.
--
-- Two changes. The till is told the highest number the server has seen for
-- it, so a reset counter catches up instead of colliding. And where a
-- collision still happens, the server renumbers rather than refusing: an
-- unrecorded sale is far worse than a renumbered one, and the number the
-- customer is holding is kept on the record so the paper still traces.

-- What number this till has reached, so a till that lost its counter can
-- resume from the truth rather than from one.
create or replace function device_receipt_high(p_device uuid)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(max(
    nullif(regexp_replace(receipt_number, '^.*-([0-9]+)$', '\1'), '')::int
  ), 0)
  from sale
  where device_id = p_device
    and reversal_of is null
    and receipt_number ~ '-[0-9]+$';
$$;

-- ---------------------------------------------------------------------------
-- complete_sale, surviving a taken receipt number.
--
-- Only the number is changed, and only when it is already spent by a
-- different sale. Everything else about the sale is exactly what the till
-- sent, and the original number is written into the note so a customer
-- holding that paper can still be matched to this record.
-- ---------------------------------------------------------------------------
create or replace function complete_pos_sale_safe(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_device uuid := nullif(p->>'device_id', '')::uuid;
  v_wanted text := p->>'receipt_number';
  v_taken boolean;
  v_next int;
  v_prefix text;
  v_new text;
  v_result jsonb;
begin
  -- Already landed under its own client_ref: nothing to do, and certainly
  -- nothing to renumber.
  if exists (select 1 from sale where client_ref = p->>'client_ref') then
    return complete_pos_sale(p);
  end if;

  select true into v_taken from sale
  where business_id = v_business and receipt_number = v_wanted
  limit 1;

  if v_taken is not true then
    return complete_pos_sale(p);
  end if;

  -- Keep the till's own prefix, take the next free number after everything
  -- it has already issued.
  v_prefix := regexp_replace(v_wanted, '-([0-9]+)$', '');
  v_next := greatest(device_receipt_high(v_device), 0) + 1;

  loop
    v_new := v_prefix || '-' || lpad(v_next::text, 4, '0');
    exit when not exists (
      select 1 from sale where business_id = v_business and receipt_number = v_new
    );
    v_next := v_next + 1;
  end loop;

  v_result := complete_pos_sale(
    p
    || jsonb_build_object('receipt_number', v_new)
    || jsonb_build_object(
         'note',
         trim(both ' ' from coalesce(p->>'note', '') || ' Reissued from ' || v_wanted)
       )
  );

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'cashier_membership_id', '')::uuid,
    'pos.receipt.reissued', 'sale', (v_result->>'sale_id')::uuid,
    jsonb_build_object('was', v_wanted, 'now', v_new)
  );

  return v_result || jsonb_build_object('reissued_from', v_wanted, 'receipt_number', v_new);
end;
$$;

revoke all on function device_receipt_high(uuid) from public, anon, authenticated;
revoke all on function complete_pos_sale_safe(jsonb) from public, anon, authenticated;
grant execute on function device_receipt_high(uuid) to service_role;
grant execute on function complete_pos_sale_safe(jsonb) to service_role;
