-- ---------------------------------------------------------------------------
-- 0069  An entitlement that has run out stops granting access
--
-- entitlement has carried starts_at, expires_at and grace_until since 0005,
-- and nothing has ever read them. Every check asked only whether status was
-- 'active' or 'grace', and nothing ever flips status when a date passes. So
-- a duration pass (0065 sets expires_at) kept granting its product set for
-- ever, a sponsorship with an end date never ended, and a grant that had not
-- started yet already worked.
--
-- No live business is affected today: all 39 entitlements are free_start
-- with no dates. This matters from the first paid pass.
--
-- THE RULE (one function, so no caller re-implements it):
--
--   starts_at, if set, has arrived, AND
--   status 'active': expires_at is empty or still ahead, OR an explicit
--                    grace_until is still ahead
--   status 'grace':  grace_until is empty or still ahead
--   anything else (expired, revoked): no
--
-- Notes on the rule:
--   * A 'grace' row is governed by grace_until alone. end_sponsorship (0025)
--     moves a sponsorship to grace for 30 days from the day it ends, which
--     can be well before the original expires_at.
--   * A row marked 'grace' with no grace_until stays usable. That is today's
--     behaviour and cutting somebody off over a missing date is the worse
--     failure.
--   * record_purchase (0065) sets no grace_until, so a lapsed pass ends the
--     moment it expires. The pack says nothing about a grace period for
--     purchased passes, so none is invented here. If one is wanted it is a
--     one-line change in record_purchase, not a change to this rule.
--   * History is never touched. Expiry limits live service only (PRI-004).
--
-- The rule is applied wherever the database decides access:
--   business_capabilities   what a business can do
--   business_entitlements   NEW: the in-force rows, for the app to read
--                           instead of querying the table and ignoring dates
--   enable_product_set      "already on" must mean in force, and re-enabling
--                           must not turn a lapsed paid pass into a free
--                           unlimited grant
--   disable_product_set     "last remaining set" must count in-force sets
--
-- NOT changed here, on purpose (reported in FOUNDATION_ALIGNMENT.md):
--   * discover eligibility (0046, 0050) asks whether Shop is on by status
--     alone. Shop is free with no expiry today, so the answer is the same.
--     It should adopt entitlement_in_force when Shop gets paid passes.
--   * create_sponsorship (0025) stores a DATE ends_at into expires_at, which
--     becomes midnight at the START of that day. Now that expiry is enforced,
--     a sponsorship "ending 30 June" would stop at 00:00 on 30 June. No live
--     sponsorships exist; the inclusive-end rule needs deciding first.
--
-- Tables and columns touched (checked against the live schema):
--   entitlement: business_id, product_set_key, capability_key, source,
--     status, capacity, starts_at, expires_at, grace_until, grant_reason
--   product_set_capability: product_set_key, capability_key, embedded
--   product_set: key
-- No table or column is added. business_capabilities, enable_product_set
-- and disable_product_set keep their signatures and return types.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The rule. p_at exists so the rule can be tested at any moment.
-- ---------------------------------------------------------------------------
create or replace function entitlement_in_force(
  p_status entitlement_status,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_grace_until timestamptz,
  p_at timestamptz default now()
)
returns boolean
language sql stable
as $fn$
  select (p_starts_at is null or p_starts_at <= p_at)
     and case p_status
           when 'active' then
             p_expires_at is null
             or p_expires_at > p_at
             or (p_grace_until is not null and p_grace_until > p_at)
           when 'grace' then
             p_grace_until is null or p_grace_until > p_at
           else false
         end;
$fn$;

revoke all on function entitlement_in_force(entitlement_status, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function entitlement_in_force(entitlement_status, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- What a business can actually do. 0044's function with the two status
-- filters replaced by the rule.
-- ---------------------------------------------------------------------------
create or replace function business_capabilities(p_business uuid)
returns table (capability_key text, from_product_set text, embedded boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct on (psc.capability_key)
         psc.capability_key, e.product_set_key, psc.embedded
  from entitlement e
  join product_set_capability psc
    on psc.product_set_key = e.product_set_key
  where e.business_id = p_business
    and entitlement_in_force(e.status, e.starts_at, e.expires_at, e.grace_until)

  union

  select e.capability_key, null, false
  from entitlement e
  where e.business_id = p_business
    and entitlement_in_force(e.status, e.starts_at, e.expires_at, e.grace_until)
    and e.capability_key is not null;
$$;

revoke all on function business_capabilities(uuid) from public, anon, authenticated;
grant execute on function business_capabilities(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The entitlements that are in force right now, for the app. in_grace is
-- true while the access is running on borrowed time: a 'grace' row, or an
-- 'active' row past its expiry that an explicit grace_until is still holding
-- open.
-- ---------------------------------------------------------------------------
create or replace function business_entitlements(p_business uuid)
returns table (
  product_set_key text,
  capability_key text,
  capacity jsonb,
  status entitlement_status,
  in_grace boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select e.product_set_key,
         e.capability_key,
         e.capacity,
         e.status,
         (e.status = 'grace')
           or (e.status = 'active' and e.expires_at is not null and e.expires_at <= now())
  from entitlement e
  where e.business_id = p_business
    and entitlement_in_force(e.status, e.starts_at, e.expires_at, e.grace_until);
$fn$;

revoke all on function business_entitlements(uuid) from public, anon, authenticated;
grant execute on function business_entitlements(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- enable_product_set: 0043's function with two changes.
--
-- 1. "Already on" means in force. A lapsed pass whose status still says
--    'active' is not on, and telling the merchant it is would leave them
--    unable to use something the screen says they have.
-- 2. Only a free_start row is brought back. 0043 revived whichever row it
--    found first, setting expires_at to null, which would turn a lapsed PAID
--    pass into a free grant that never ends and rewrite what the row says
--    was bought. A set with no free row gets a fresh free_start one, and the
--    old purchase or sponsorship row stays as the history it is.
-- ---------------------------------------------------------------------------
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
    and entitlement_in_force(status, starts_at, expires_at, grace_until)
  limit 1;
  if found then
    return jsonb_build_object('entitlement_id', v_existing.id, 'already', true);
  end if;

  -- A set that was switched off before comes back rather than stacking a
  -- second grant beside the old one. Only a free grant is revived.
  select * into v_existing from entitlement
  where business_id = v_business
    and product_set_key = v_key
    and source = 'free_start'
  limit 1;

  if found then
    update entitlement
    set status = 'active', starts_at = now(), expires_at = null, grace_until = null,
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

revoke all on function enable_product_set(jsonb) from public, anon, authenticated;
grant execute on function enable_product_set(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- disable_product_set: 0045's function, counting only sets in force when it
-- asks whether this is the last one. A lapsed set is not something a
-- business could still do business with.
-- ---------------------------------------------------------------------------
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
    and entitlement_in_force(status, starts_at, expires_at, grace_until);

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
