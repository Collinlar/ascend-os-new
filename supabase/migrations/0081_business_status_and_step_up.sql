-- ---------------------------------------------------------------------------
-- 0081  Phase 1, step 1f: business status, and a fresh code for the most
--       sensitive actions
--
-- BUSINESS STATUS
--   A business could not be suspended or closed: the table had no status.
--   It now has one: active (the default for every business), suspended or
--   closed, with the reason and when it changed. Approved with Collins on
--   14 Nov 2026 (PHASE_1_PLAN.md 3.8): the rest of the spec's lifecycle waits
--   until a product needs it.
--
--   A business that is not active can read and export its history (PRI-004)
--   but cannot change anything. The app refuses writes for it; here,
--   require_permission (0077) also refuses every high-risk change, so the
--   database holds the rule too.
--
--   set_business_status(p) is the only way to change it: a platform admin,
--   with a reason, recorded in audit_log with the before and after.
--
-- STEP-UP
--   auth_session.step_up_at records when this session last confirmed a fresh
--   WhatsApp code. Signing in is itself a fresh code, so a session is "fresh"
--   for 10 minutes after it was created or after its last step-up
--   (PHASE_1_PLAN.md 3.9). The app checks it for the actions that need it.
--
-- Every existing business becomes active, so nothing changes for anyone.
--
-- Tables and columns touched: business (status, status_reason,
-- status_changed_at added), auth_session (step_up_at added),
-- platform_admin (read), audit_log (insert through record_audit).
-- ---------------------------------------------------------------------------

alter table business add column if not exists status text not null default 'active';
alter table business add column if not exists status_reason text;
alter table business add column if not exists status_changed_at timestamptz;
do $do$ begin
  alter table business add constraint business_status_known check (status in ('active', 'suspended', 'closed'));
exception when duplicate_object then null; end $do$;

alter table auth_session add column if not exists step_up_at timestamptz;

-- ---------------------------------------------------------------------------
-- require_permission (0077), now also refusing any change for a business that
-- is not active. Otherwise identical.
-- ---------------------------------------------------------------------------
create or replace function require_permission(p_actor uuid, p_business uuid, p_keys text[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status from business where id = p_business;
  if v_status is distinct from 'active' then
    raise exception 'permission_denied: business is %', coalesce(v_status, 'unknown');
  end if;
  if p_actor is null then
    raise exception 'permission_denied: no actor given (needs %)', array_to_string(p_keys, ' or ');
  end if;
  if not exists (
    select 1 from business_membership
    where id = p_actor and business_id = p_business
  ) then
    raise exception 'permission_denied: not a member of this business';
  end if;
  if not exists (
    select 1 from membership_permissions(p_actor) mp
    where mp.permission_key = any(p_keys)
  ) then
    raise exception 'permission_denied: needs %', array_to_string(p_keys, ' or ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_business_status: business_id, status, reason, actor_person_id.
-- Only a platform admin, and always with a reason.
-- ---------------------------------------------------------------------------
create or replace function set_business_status(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business business%rowtype;
  v_status text := p->>'status';
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_actor uuid := nullif(p->>'actor_person_id', '')::uuid;
begin
  if v_status not in ('active', 'suspended', 'closed') then
    raise exception 'status_unknown: %', coalesce(v_status, '(none)');
  end if;
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'status_needs_a_reason';
  end if;
  if v_actor is null or not exists (
    select 1 from platform_admin where person_id = v_actor and role = 'admin' and revoked_at is null
  ) then
    raise exception 'permission_denied: only a platform admin can change a business status';
  end if;

  select * into v_business from business where id = nullif(p->>'business_id', '')::uuid for update;
  if not found then
    raise exception 'business_not_found';
  end if;
  if v_business.status = v_status then
    return jsonb_build_object('business_id', v_business.id, 'status', v_status, 'unchanged', true);
  end if;

  update business
     set status = v_status, status_reason = v_reason, status_changed_at = now(), updated_at = now()
   where id = v_business.id;

  perform record_audit(jsonb_build_object(
    'business_id', v_business.id,
    'actor_person_id', v_actor,
    'action', 'business.status_changed',
    'entity_type', 'business',
    'entity_id', v_business.id,
    'reason', v_reason,
    'before', jsonb_build_object('status', v_business.status),
    'after', jsonb_build_object('status', v_status),
    'authorization_source', 'platform_admin'
  ));

  return jsonb_build_object('business_id', v_business.id, 'status', v_status, 'unchanged', false);
end;
$$;

revoke all on function require_permission(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function set_business_status(jsonb) from public, anon, authenticated;
grant execute on function require_permission(uuid, uuid, text[]) to service_role;
grant execute on function set_business_status(jsonb) to service_role;
