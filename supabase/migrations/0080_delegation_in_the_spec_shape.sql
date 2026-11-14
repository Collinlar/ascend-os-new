-- ---------------------------------------------------------------------------
-- 0080  Phase 1, step 1e: delegation that is explicit, scoped, time-bound,
--       revocable and audited
--
-- delegated_authority has existed since 0001 with no rows and nothing reading
-- it. Its shape (one authority_key and a money limit) was narrower than the
-- Identity spec (section 7): every delegation records grantor, grantee,
-- scope, purpose, start, expiry, revocation state and audit history.
--
-- THE TABLE is reshaped in place (it is empty, so nothing is lost; altering
-- rather than dropping keeps the row level security set in 0006).
--
-- THE RULES (decided with Collins, 14 Nov 2026, PHASE_1_PLAN.md 3.6):
--   * you can only delegate what you hold, and you need staff.manage to give
--     authority to anyone
--   * the owner-only high-risk permissions cannot be delegated:
--     roles.change, business.settings, external_access.authorize,
--     settlement.change_destination, data.export
--   * every delegation ends, at most 30 days after it starts
--   * it goes to an active member of the same business, never to yourself
--   * granting and revoking are both written to audit_log
--
-- EFFECT: membership_permissions now adds the grantee's live delegations
-- (started, not ended, not revoked) to what their role gives them, so the
-- route check and every database check (0077 to 0079) honour a delegation
-- with no other change. A delegation stops counting the moment it ends or is
-- revoked, and never outlives the grantee's own membership.
--
-- Tables and columns touched: delegated_authority (reshaped),
-- business_membership (read), role (read), permission (read), audit_log
-- (insert through record_audit).
-- ---------------------------------------------------------------------------

alter table delegated_authority rename column membership_id to grantee_membership_id;
alter table delegated_authority rename column granted_by to grantor_membership_id;
alter table delegated_authority drop column if exists authority_key;
alter table delegated_authority drop column if exists max_amount;
alter table delegated_authority drop column if exists currency_code;
alter table delegated_authority add column if not exists permissions text[] not null default '{}';
alter table delegated_authority add column if not exists purpose text;
alter table delegated_authority add column if not exists starts_at timestamptz not null default now();
alter table delegated_authority add column if not exists revoked_at timestamptz;
alter table delegated_authority add column if not exists revoked_by uuid references business_membership(id);
alter table delegated_authority add column if not exists approved_via text;

-- Every delegation ends, and ends within 30 days of starting.
update delegated_authority set expires_at = starts_at + interval '1 day' where expires_at is null;
alter table delegated_authority alter column expires_at set not null;
alter table delegated_authority add constraint delegation_ends_within_30_days
  check (expires_at > starts_at and expires_at <= starts_at + interval '30 days');
alter table delegated_authority add constraint delegation_not_to_yourself
  check (grantee_membership_id <> grantor_membership_id);
alter table delegated_authority add constraint delegation_has_scope
  check (cardinality(permissions) > 0);

create index if not exists delegation_grantee_live
  on delegated_authority (grantee_membership_id, expires_at)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- What one membership may do, right now: its role, plus live delegations.
-- Same signature and return type as 0074. One row per permission; the source
-- says "role" when the role gives it, otherwise "delegation".
-- ---------------------------------------------------------------------------
create or replace function membership_permissions(p_membership uuid)
returns table (permission_key text, source text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with m as (
    select bm.id, bm.role_id, bm.business_id
    from business_membership bm
    where bm.id = p_membership
      and bm.status = 'active'
      and (bm.expires_at is null or bm.expires_at > now())
  ),
  from_role as (
    select k as key
    from m
    join role r on r.id = m.role_id
    cross join lateral jsonb_array_elements_text(r.permissions) k
  ),
  from_delegation as (
    select unnest(d.permissions) as key
    from m
    join delegated_authority d
      on d.grantee_membership_id = m.id
     and d.business_id = m.business_id
    where d.revoked_at is null
      and d.starts_at <= now()
      and d.expires_at > now()
  )
  select p.key,
         case when exists (select 1 from from_role fr where fr.key = p.key or fr.key = '*')
              then 'role' else 'delegation' end
  from permission p
  where exists (select 1 from from_role fr where fr.key = p.key or fr.key = '*')
     or exists (select 1 from from_delegation fd where fd.key = p.key)
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- grant_delegation
--   business_id, grantor_membership_id, grantee_membership_id,
--   permissions (list), purpose, expires_at, starts_at (optional),
--   approved_via (optional: otp, qr, in_app)
-- ---------------------------------------------------------------------------
create or replace function grant_delegation(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_grantor uuid := nullif(p->>'grantor_membership_id', '')::uuid;
  v_grantee uuid := nullif(p->>'grantee_membership_id', '')::uuid;
  v_starts timestamptz := coalesce(nullif(p->>'starts_at', '')::timestamptz, now());
  v_ends timestamptz := nullif(p->>'expires_at', '')::timestamptz;
  v_perms text[];
  v_bad text;
  v_id uuid;
begin
  select array_agg(distinct x) into v_perms
  from jsonb_array_elements_text(coalesce(p->'permissions', '[]'::jsonb)) x;
  if v_perms is null or cardinality(v_perms) = 0 then
    raise exception 'delegation_needs_permissions';
  end if;
  if nullif(btrim(coalesce(p->>'purpose', '')), '') is null then
    raise exception 'delegation_needs_a_purpose';
  end if;
  if v_ends is null then
    raise exception 'delegation_needs_an_end';
  end if;
  if v_ends <= v_starts or v_ends > v_starts + interval '30 days' then
    raise exception 'delegation_ends_within_30_days';
  end if;
  if v_ends <= now() then
    raise exception 'delegation_already_over';
  end if;
  if v_grantee is null or v_grantee = v_grantor then
    raise exception 'delegation_to_someone_else';
  end if;

  select string_agg(k, ', ') into v_bad from unnest(v_perms) k
  where not exists (select 1 from permission where key = k);
  if v_bad is not null then
    raise exception 'delegation_unknown_permissions: %', v_bad;
  end if;

  select string_agg(k, ', ') into v_bad from unnest(v_perms) k
  where k in ('roles.change', 'business.settings', 'external_access.authorize',
              'settlement.change_destination', 'data.export');
  if v_bad is not null then
    raise exception 'delegation_not_allowed_for: %', v_bad;
  end if;

  -- You need staff.manage to give authority, and you can only give what you hold.
  perform require_permission(v_grantor, v_business, array['staff.manage']);
  select string_agg(k, ', ') into v_bad from unnest(v_perms) k
  where not exists (select 1 from membership_permissions(v_grantor) mp where mp.permission_key = k);
  if v_bad is not null then
    raise exception 'delegation_beyond_your_own_permissions: %', v_bad;
  end if;

  if not exists (
    select 1 from business_membership
    where id = v_grantee and business_id = v_business and status = 'active'
      and (expires_at is null or expires_at > now())
  ) then
    raise exception 'delegation_grantee_not_an_active_member';
  end if;

  insert into delegated_authority (
    business_id, grantee_membership_id, grantor_membership_id, permissions,
    purpose, starts_at, expires_at, approved_via
  ) values (
    v_business, v_grantee, v_grantor, v_perms,
    btrim(p->>'purpose'), v_starts, v_ends, nullif(p->>'approved_via', '')
  )
  returning id into v_id;

  perform record_audit(jsonb_build_object(
    'business_id', v_business,
    'actor_membership_id', v_grantor,
    'action', 'delegation.granted',
    'entity_type', 'delegated_authority',
    'entity_id', v_id,
    'reason', btrim(p->>'purpose'),
    'after', jsonb_build_object('grantee', v_grantee, 'permissions', to_jsonb(v_perms),
                                'starts_at', v_starts, 'expires_at', v_ends),
    'authorization_source', 'staff.manage'
  ));

  return jsonb_build_object('delegation_id', v_id, 'permissions', to_jsonb(v_perms), 'expires_at', v_ends);
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_delegation: delegation_id, actor_membership_id, reason (optional).
-- The grantor can always take back what they gave; anyone else needs
-- staff.manage in that business.
-- ---------------------------------------------------------------------------
create or replace function revoke_delegation(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_d delegated_authority%rowtype;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
begin
  select * into v_d from delegated_authority where id = nullif(p->>'delegation_id', '')::uuid for update;
  if not found then
    raise exception 'delegation_not_found';
  end if;
  if v_d.revoked_at is not null then
    return jsonb_build_object('delegation_id', v_d.id, 'revoked', true, 'unchanged', true);
  end if;
  if v_actor is distinct from v_d.grantor_membership_id then
    perform require_permission(v_actor, v_d.business_id, array['staff.manage']);
  end if;

  update delegated_authority set revoked_at = now(), revoked_by = v_actor where id = v_d.id;

  perform record_audit(jsonb_build_object(
    'business_id', v_d.business_id,
    'actor_membership_id', v_actor,
    'action', 'delegation.revoked',
    'entity_type', 'delegated_authority',
    'entity_id', v_d.id,
    'reason', nullif(p->>'reason', ''),
    'before', jsonb_build_object('grantee', v_d.grantee_membership_id, 'permissions', to_jsonb(v_d.permissions),
                                 'expires_at', v_d.expires_at),
    'authorization_source', case when v_actor = v_d.grantor_membership_id then 'grantor' else 'staff.manage' end
  ));

  return jsonb_build_object('delegation_id', v_d.id, 'revoked', true, 'unchanged', false);
end;
$$;

revoke all on function membership_permissions(uuid) from public, anon, authenticated;
revoke all on function grant_delegation(jsonb) from public, anon, authenticated;
revoke all on function revoke_delegation(jsonb) from public, anon, authenticated;
grant execute on function membership_permissions(uuid) to service_role;
grant execute on function grant_delegation(jsonb) to service_role;
grant execute on function revoke_delegation(jsonb) to service_role;
