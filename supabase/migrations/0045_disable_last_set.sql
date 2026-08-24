-- AscendSME Connected Platform. Migration 0045: repairing
-- disable_product_set, which guards on a column that does not exist.
--
-- 0043 refused to switch off "the set a business was built around" by
-- reading business.entry_product_set. There is no such column, and there
-- never has been: business carries archetype, not a product set key. The
-- function would have raised undefined_column on its first real call, so
-- setting a set down was broken from the moment it was written.
--
-- The guard is also the wrong rule. Freezing a business into whatever it
-- picked at signup means a counter shop that moves online must keep a till
-- it no longer uses. What actually has to be prevented is a business left
-- with nothing it can do, so that is what is checked: you cannot set down
-- your last remaining set. Which one you started with stops mattering.

create or replace function disable_product_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_key text := p->>'product_set_key';
  v_remaining int;
begin
  select count(*) into v_remaining
  from entitlement
  where business_id = v_business
    and product_set_key is not null
    and product_set_key <> v_key
    and status in ('active', 'grace');

  if v_remaining = 0 then
    raise exception 'cannot_disable_last_set';
  end if;

  update entitlement
  set status = 'expired', expires_at = now()
  where business_id = v_business
    and product_set_key = v_key
    and status in ('active', 'grace');

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'entitlement.disabled', 'business', v_business,
    jsonb_build_object('product_set', v_key)
  );

  return jsonb_build_object('product_set', v_key, 'disabled', true);
end;
$$;

revoke all on function disable_product_set(jsonb) from public, anon, authenticated;
grant execute on function disable_product_set(jsonb) to service_role;
