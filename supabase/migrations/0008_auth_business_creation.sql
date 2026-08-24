-- AscendSME Connected Platform. Migration 0008: WhatsApp OTP auth and the
-- business creation transaction.
-- WhatsApp is the identity channel in Ghana (91.8% of internet users).
-- Sessions are platform-managed; OTP codes are stored hashed with expiry
-- and bounded attempts (SEC-003).

-- ---------------------------------------------------------------------------
-- OTP challenges
-- ---------------------------------------------------------------------------
create table otp_challenge (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  code_hash text not null,                     -- sha256, never the plain code
  purpose text not null default 'sign_in',     -- sign_in | owner_recovery | delete_confirm
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_phone_idx on otp_challenge(phone_e164, created_at);

-- ---------------------------------------------------------------------------
-- Sessions: server-side record so tokens can be revoked (SEC-005, IDN-011)
-- ---------------------------------------------------------------------------
create table auth_session (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id),
  channel text not null default 'business_web',
  device_fingerprint text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index session_person_idx on auth_session(person_id);

-- ---------------------------------------------------------------------------
-- Free Start entry is its own entitlement source (§15.2: Start is free or
-- highly accessible; MON-002).
-- ---------------------------------------------------------------------------
alter type entitlement_source add value if not exists 'free_start';

-- ---------------------------------------------------------------------------
-- Role templates: platform-level defaults copied into each new business
-- (POS PRD §25.1 default roles).
-- ---------------------------------------------------------------------------
insert into role (business_id, key, name, permissions) values
  (null, 'owner', 'Owner', '["*"]'),
  (null, 'manager', 'Manager',
    '["sell","refund.approve","discount.approve","shift.review","inventory.manage","reports.location","staff.manage"]'),
  (null, 'cashier', 'Cashier',
    '["sell","shift.open","shift.close","customer.lookup","receipt.reprint"]'),
  (null, 'accountant', 'Accountant',
    '["documents.read","documents.create","payments.read","reports.finance"]'),
  (null, 'staff', 'Staff',
    '["tasks.own","attendance.own","bookings.assigned"]')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- create_business: one transaction from verified person to operating
-- business. Creates business, first location, business-scoped roles from
-- templates, owner membership, the free Start entitlement for the entry
-- product set, the business event and the audit record.
-- Idempotent on (person, business name) within a short window is NOT
-- attempted; the API layer guards double submission with client_ref.
-- ---------------------------------------------------------------------------
create or replace function create_business(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_person uuid := (p->>'person_id')::uuid;
  v_entry text := coalesce(p->>'entry_product_set', 'pos');
  v_business uuid;
  v_location uuid;
  v_owner_role uuid;
  v_membership uuid;
  r record;
begin
  if v_person is null then
    raise exception 'person_id is required';
  end if;
  if not exists (select 1 from product_set where key = v_entry) then
    raise exception 'unknown entry product set: %', v_entry;
  end if;

  insert into business (name, country_code, archetype, onboarding_source)
  values (
    p->>'name',
    coalesce(p->>'country_code', 'GH'),
    p->>'archetype',
    coalesce(p->'onboarding_source', '{}'::jsonb)
  )
  returning id into v_business;

  insert into location (business_id, name, city)
  values (v_business, coalesce(p->>'location_name', 'Main location'), p->>'city')
  returning id into v_location;

  -- Copy platform role templates into the business (owner reviewable, IDN-015).
  for r in select key, name, permissions from role where business_id is null
  loop
    insert into role (business_id, key, name, permissions)
    values (v_business, r.key, r.name, r.permissions)
    on conflict (business_id, key) do nothing;
  end loop;

  select id into v_owner_role from role where business_id = v_business and key = 'owner';

  insert into business_membership (business_id, person_id, role_id, status)
  values (v_business, v_person, v_owner_role, 'active')
  returning id into v_membership;

  -- Free Start entitlement for the chosen entry set (MON-002, §15.2).
  insert into entitlement (business_id, product_set_key, source, status, grant_reason)
  values (v_business, v_entry, 'free_start', 'active', 'start_free_entry');

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, payload, business_date
  ) values (
    'business.created', v_business, v_membership, 'business_web', v_entry,
    'business', v_business,
    jsonb_build_object('archetype', p->>'archetype', 'entry_product_set', v_entry),
    current_date
  );

  insert into audit_log (business_id, actor_person_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_person, v_membership, 'business.created', 'business', v_business,
          jsonb_build_object('entry_product_set', v_entry));

  return jsonb_build_object(
    'business_id', v_business,
    'location_id', v_location,
    'membership_id', v_membership
  );
end;
$$;
