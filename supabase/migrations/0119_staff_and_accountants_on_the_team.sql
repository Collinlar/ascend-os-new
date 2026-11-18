-- ---------------------------------------------------------------------------
-- 0119  Staff and accountants can be added to a team
--
-- Collins, 18 November 2026. add_team_member (0077) accepted only cashiers
-- and managers, so no screen could add a staff member (an Office or services
-- business's people) or an accountant (read-only books). Both are added now:
--   staff       needs staff.manage, like a cashier (owners and managers)
--   accountant  needs roles.change, like a manager (owners only), because an
--               accountant sees payments and settlements and can export data
-- An owner is still never added this way. Nothing else changes.
--
-- Regenerated from 0077. Tables and columns read: as 0077 (role key).
-- ---------------------------------------------------------------------------

create or replace function add_team_member(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_name text := nullif(trim(coalesce(p->>'full_name', '')), '');
  v_phone text := nullif(trim(coalesce(p->>'phone_e164', '')), '');
  v_role_key text := coalesce(p->>'role_key', 'cashier');
  v_role uuid;
  v_person uuid;
  v_membership uuid;
  v_existing business_membership%rowtype;
begin
  if v_name is null or length(v_name) < 2 then
    raise exception 'name_required';
  end if;

  -- 0119: staff and accountants too, not only the roles a counter uses.
  -- An owner is still never added here: that is a heavier decision than a
  -- team screen should quietly allow.
  if v_role_key not in ('cashier', 'manager', 'staff', 'accountant') then
    raise exception 'role_not_allowed';
  end if;

  -- Adding people needs staff.manage (0077). Adding a manager or an
  -- accountant needs roles.change, which only owners hold: a manager runs
  -- the day, and an accountant sees settlements and can export the books.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['staff.manage']);
  if v_role_key in ('manager', 'accountant') then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['roles.change']);
  end if;

  select id into v_role from role
  where key = v_role_key and business_id is null;
  if v_role is null then
    raise exception 'role_not_found';
  end if;

  -- One person, whatever number of businesses they work for.
  if v_phone is not null then
    select id into v_person from person where phone_e164 = v_phone;
  end if;

  if v_person is null then
    insert into person (full_name, phone_e164)
    values (v_name, v_phone)
    returning id into v_person;
  end if;

  -- Already here? Reinstating somebody who left should not be an error, and
  -- should not lose the sales already attributed to them.
  select * into v_existing from business_membership
  where business_id = v_business and person_id = v_person;

  if found then
    if v_existing.status = 'active' then
      raise exception 'already_a_member';
    end if;
    update business_membership
    set status = 'active',
        role_id = v_role,
        staff_pin_hash = nullif(p->>'pin_hash', ''),
        pin_salt = nullif(p->>'pin_salt', ''),
        pin_set_at = case when nullif(p->>'pin_hash', '') is null then null else now() end,
        pin_failed_attempts = 0,
        pin_locked_until = null,
        updated_at = now()
    where id = v_existing.id;
    v_membership := v_existing.id;
  else
    insert into business_membership (
      business_id, person_id, role_id, status,
      staff_pin_hash, pin_salt, pin_set_at
    ) values (
      v_business, v_person, v_role, 'active',
      nullif(p->>'pin_hash', ''),
      nullif(p->>'pin_salt', ''),
      case when nullif(p->>'pin_hash', '') is null then null else now() end
    )
    returning id into v_membership;
  end if;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'team.member.added', 'business_membership', v_membership,
    jsonb_build_object('name', v_name, 'role', v_role_key,
                       'with_pin', nullif(p->>'pin_hash', '') is not null)
  );

  return jsonb_build_object('membership_id', v_membership, 'person_id', v_person);
end;
$$;
