-- AscendSME Connected Platform. Migration 0032: staff PINs for shared
-- terminals (POS-014, IDN-007).
--
-- What a staff PIN is, and is not.
--
-- It IS an accountability control: it records who was at the till for each
-- sale and each shift, and stops a casual bystander ringing something up.
-- It is NOT a security boundary. Four digits is ten thousand combinations,
-- and the terminal is physically sitting on the counter. Anyone holding the
-- device has already crossed the boundary that matters, which is why device
-- revocation exists (OFL-013).
--
-- Because a till must keep selling with no network, verification happens on
-- the device against a cached hash. That is a deliberate trade: an
-- online-only PIN would mean a cashier locked out of their own shop the
-- moment the network dropped, which is the failure this platform exists to
-- avoid. The hash is per-membership salted and PBKDF2-derived, so a cached
-- roster is not a plaintext list of PINs.

alter table business_membership
  add column pin_salt text,
  add column pin_set_at timestamptz,
  add column pin_failed_attempts int not null default 0,
  add column pin_locked_until timestamptz;

-- set_staff_pin: the hash is derived on the client and only ever arrives
-- here already hashed. The server never sees the digits.
create or replace function set_staff_pin(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_membership business_membership%rowtype;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
begin
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid;
  if not found then
    raise exception 'membership_not_found';
  end if;

  if coalesce(p->>'pin_hash', '') = '' or coalesce(p->>'pin_salt', '') = '' then
    raise exception 'pin_required';
  end if;

  update business_membership
  set staff_pin_hash = p->>'pin_hash',
      pin_salt = p->>'pin_salt',
      pin_set_at = now(),
      pin_failed_attempts = 0,
      pin_locked_until = null
  where id = v_membership.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_membership.business_id, v_actor, 'staff_pin.set',
    'business_membership', v_membership.id,
    jsonb_build_object('for_membership', v_membership.id)
  );

  return jsonb_build_object('membership_id', v_membership.id);
end;
$$;

-- Clearing a PIN removes a person's ability to open the till without
-- removing them from the business.
create or replace function clear_staff_pin(p jsonb)
returns void
language sql security definer
as $$
  update business_membership
  set staff_pin_hash = null, pin_salt = null, pin_set_at = null,
      pin_failed_attempts = 0, pin_locked_until = null
  where id = (p->>'membership_id')::uuid;
$$;

-- The roster a terminal caches so it can identify a cashier offline.
-- Deliberately narrow: names and hashes for people who may operate a till,
-- and nothing else about them (SEC-008, IDN-013).
create or replace function terminal_staff_roster(p_business uuid)
returns table (
  membership_id uuid,
  display_name text,
  role_key text,
  pin_hash text,
  pin_salt text
)
language sql stable security definer
as $$
  select
    m.id,
    p.full_name,
    r.key,
    m.staff_pin_hash,
    m.pin_salt
  from business_membership m
  join person p on p.id = m.person_id
  join role r on r.id = m.role_id
  where m.business_id = p_business
    and m.status = 'active'
    and m.staff_pin_hash is not null
    and r.key in ('owner', 'manager', 'cashier');
$$;

-- Sales already carry cashier_membership_id; this makes it queryable per
-- person so an owner can see who sold what.
create index if not exists sale_cashier_idx
  on sale(business_id, cashier_membership_id, business_date);
