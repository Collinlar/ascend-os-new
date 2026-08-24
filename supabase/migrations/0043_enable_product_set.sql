-- AscendSME Connected Platform. Migration 0043: taking on another product
-- set after you have started (ENT-002, MON-002, XST-001).
--
-- create_business granted exactly one entitlement, for whichever set the
-- merchant picked at signup, and nothing anywhere ever granted another. So
-- a shop that started at the counter could never take orders online, and a
-- shop that started online could never open a till. The whole promise of
-- starting where you are and growing into the rest had no mechanism behind
-- it at all.
--
-- Every storefront was live regardless, because nothing checked. A business
-- that had only ever asked for a till had a public shop page it was never
-- told about and could not have turned off. That is the other half of what
-- this fixes: a shop is public because its owner decided so.

create or replace function enable_product_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_key text := p->>'product_set_key';
  v_existing entitlement%rowtype;
begin
  if not exists (select 1 from product_set where key = v_key) then
    raise exception 'unknown_product_set';
  end if;

  -- Already on, in any usable state. Turning something on twice is a
  -- merchant tapping twice, not an error worth showing them.
  select * into v_existing from entitlement
  where business_id = v_business
    and product_set_key = v_key
    and status in ('active', 'grace');
  if found then
    return jsonb_build_object('entitlement_id', v_existing.id, 'already', true);
  end if;

  -- A set that was switched off before comes back rather than stacking a
  -- second grant beside the old one.
  select * into v_existing from entitlement
  where business_id = v_business and product_set_key = v_key
  limit 1;

  if found then
    update entitlement
    set status = 'active', starts_at = now(), expires_at = null,
        grant_reason = coalesce(p->>'reason', 'merchant enabled')
    where id = v_existing.id;
    return jsonb_build_object('entitlement_id', v_existing.id, 'already', false);
  end if;

  -- free_start, the same source a business's first set is granted under.
  -- entitlement_source has no value meaning a merchant switched something
  -- on themselves, and inventing one here would need an enum change for no
  -- gain: taking on a second free set is the same commercial event as the
  -- first, and grant_reason carries the difference.
  insert into entitlement (business_id, product_set_key, source, status, grant_reason)
  values (v_business, v_key, 'free_start', 'active',
          coalesce(p->>'reason', 'merchant enabled'))
  returning * into v_existing;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'entitlement.enabled', 'entitlement', v_existing.id,
    jsonb_build_object('product_set', v_key)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, verification, payload, business_date
  ) values (
    'business.product_set.enabled', v_business,
    nullif(p->>'actor_membership_id', '')::uuid,
    'business_mobile', v_key::text, 'entitlement', v_existing.id,
    'merchant_declared', jsonb_build_object('product_set', v_key), current_date
  );

  return jsonb_build_object('entitlement_id', v_existing.id, 'already', false);
end;
$$;

-- Switching one off again. Records are never touched: expiry limits live
-- service and never deletes or blocks export (PRI-004).
create or replace function disable_product_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_key text := p->>'product_set_key';
  v_entry text;
begin
  -- The set a business was built around stays. Turning off the till on a
  -- till business would leave it with nothing it could do.
  select entry_product_set into v_entry from business where id = v_business;
  if v_entry = v_key then
    raise exception 'cannot_disable_entry_set';
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

revoke all on function enable_product_set(jsonb) from public, anon, authenticated;
revoke all on function disable_product_set(jsonb) from public, anon, authenticated;
grant execute on function enable_product_set(jsonb) to service_role;
grant execute on function disable_product_set(jsonb) to service_role;
