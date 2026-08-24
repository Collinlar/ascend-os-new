-- AscendSME Connected Platform. Migration 0039: the people who work the
-- counter (IDN-001, IDN-016, POS-014).
--
-- Nothing could add a person to a business. The only membership that ever
-- existed was the one created for whoever signed up, so every sale a shop
-- made carried the owner's name whether the owner was there or not.
--
-- That is not primarily an access problem. It is an attribution one: a
-- receipt says who served, and if every receipt says the same person, a
-- dispute cannot be traced to anybody. The point of adding people is that
-- the record tells the truth about who was at the counter.
--
-- A cashier gets no account. The credential that matters at a counter is
-- four digits, not a login, and requiring each new person to verify a
-- WhatsApp number before they could be given a PIN would mean nobody
-- starts work the same afternoon. A phone is optional, and when it is given
-- it links to whatever person record already exists for that number rather
-- than making a second one: the same human across every business they work
-- in (IDN-001).

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

  -- Only the roles that mean something at a counter. Accountant and staff
  -- belong to other product sets, and handing an owner role to somebody is
  -- a heavier decision than this screen should quietly allow.
  if v_role_key not in ('cashier', 'manager') then
    raise exception 'role_not_allowed';
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

-- ---------------------------------------------------------------------------
-- remove_team_member: they have left.
--
-- Never deletes. Sales carry cashier_membership_id, and a deleted row would
-- orphan the record of who sold what, which is the thing this whole feature
-- exists to protect. The membership is marked removed and the PIN cleared,
-- so they cannot open a till while March still says they served.
-- ---------------------------------------------------------------------------
create or replace function remove_team_member(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_membership business_membership%rowtype;
  v_role_key text;
begin
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'member_not_found';
  end if;

  select key into v_role_key from role where id = v_membership.role_id;
  -- A business with nobody who owns it has nobody who can let anyone back in.
  if v_role_key = 'owner' then
    raise exception 'cannot_remove_owner';
  end if;

  update business_membership
  set status = 'removed',
      staff_pin_hash = null,
      pin_salt = null,
      pin_set_at = null,
      updated_at = now()
  where id = v_membership.id;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_membership.business_id, nullif(p->>'actor_membership_id', '')::uuid,
    'team.member.removed', 'business_membership', v_membership.id,
    jsonb_build_object('role', v_role_key)
  );

  return jsonb_build_object('membership_id', v_membership.id);
end;
$$;

-- Who works here, for the tills screen.
create or replace function business_team(p_business uuid)
returns table (
  membership_id uuid,
  display_name text,
  role_key text,
  status membership_status,
  has_pin boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.id, p.full_name, r.key, m.status, m.staff_pin_hash is not null
  from business_membership m
  join person p on p.id = m.person_id
  join role r on r.id = m.role_id
  where m.business_id = p_business
    and m.status <> 'removed'
  order by (r.key = 'owner') desc, p.full_name;
$$;

revoke all on function add_team_member(jsonb) from public, anon, authenticated;
revoke all on function remove_team_member(jsonb) from public, anon, authenticated;
revoke all on function business_team(uuid) from public, anon, authenticated;
grant execute on function add_team_member(jsonb) to service_role;
grant execute on function remove_team_member(jsonb) to service_role;
grant execute on function business_team(uuid) to service_role;
