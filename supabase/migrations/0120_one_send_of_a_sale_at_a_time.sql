-- 0120: two sends of one till sale at the same moment.
--
-- Found while checking D4a on 18 November 2026. complete_pos_sale already
-- answers "duplicate" to a sale it has seen before, but only once the first
-- send has committed. Two sends in flight together both saw nothing, both
-- inserted, and the second failed on unique (business_id, receipt_number).
-- The till then held a sale marked as refused that the server had in fact
-- recorded, and said so in words that send a merchant to support.
--
-- The fix serialises sends per business and client_ref. Nothing else about
-- the function changes; the body is 0070's with the lock added first.

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
  -- One send of a sale at a time. Two sends of the same sale arriving
  -- together (a till that gave up waiting and sent again while the first
  -- was still being written) used to both miss each other, both insert, and
  -- the second failed on the receipt number, leaving the till showing a
  -- sale the office "is not taking" that the office already had. Held to
  -- the end of this transaction, so the second send waits, then finds the
  -- first and answers duplicate.
  perform pg_advisory_xact_lock(hashtextextended(v_business::text || ':' || coalesce(p->>'client_ref', ''), 120));

  -- Already landed under its own client_ref: nothing to do, and certainly
  -- nothing to renumber.
  if exists (select 1 from sale where client_ref = p->>'client_ref' and business_id = v_business) then
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

revoke all on function complete_pos_sale_safe(jsonb) from public, anon, authenticated;
grant execute on function complete_pos_sale_safe(jsonb) to service_role;
