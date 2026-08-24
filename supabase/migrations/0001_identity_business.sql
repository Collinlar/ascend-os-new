-- AscendSME Connected Platform. Migration 0001: Identity and Business core.
-- Zero-silo rule: these tables are the ONLY source of truth for people,
-- businesses, locations, memberships, roles and devices. Product sets read
-- and write through the owning domain services, never through their own copies.
-- PRD refs: ARC-001, ARC-004, IDN-001..IDN-018, HWD-001.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Person: one platform identity across business and customer contexts (IDN-001)
-- Auth credentials live in Supabase auth; this row is the platform identity.
-- ---------------------------------------------------------------------------
create table person (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,               -- maps to auth.users
  full_name text not null,
  phone_e164 text unique,                 -- WhatsApp-first identity in Ghana
  phone_verified_at timestamptz,
  email text,
  email_verified_at timestamptz,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Business and country configuration (ARC-008, MKT-002)
-- ---------------------------------------------------------------------------
create table country_config (
  code text primary key,                  -- 'GH', 'NG', 'KE', 'ZA'
  name text not null,
  currency_code text not null,            -- 'GHS'
  phone_prefix text not null,             -- '+233'
  tax_config jsonb not null default '{}',
  payment_providers jsonb not null default '[]',
  active boolean not null default false
);

insert into country_config (code, name, currency_code, phone_prefix, active)
values ('GH', 'Ghana', 'GHS', '+233', true);

create type verification_status as enum (
  'unverified', 'declared', 'documents_submitted', 'verified'
);

create table business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null references country_config(code) default 'GH',
  archetype text,                          -- walk_in_retail | online_seller | appointment_service | field_service | professional_firm | multi_channel
  legal_registration_status verification_status not null default 'unverified',
  identity_verification verification_status not null default 'unverified',
  profile jsonb not null default '{}',     -- progressive profile; never blocks first value (VIS-002)
  onboarding_source jsonb not null default '{}', -- source, campaign, partner, account manager (ONB-012)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table location (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  name text not null,
  address text,
  city text,
  region text,
  geo point,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index location_business_idx on location(business_id);

-- ---------------------------------------------------------------------------
-- Membership, roles and permission grants (IDN-002..IDN-005)
-- A person may hold different roles in different businesses without merging
-- permissions (CHN-006).
-- ---------------------------------------------------------------------------
create type membership_status as enum ('invited', 'active', 'suspended', 'removed');

create table role (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references business(id),  -- null = platform template role
  key text not null,                         -- owner | manager | cashier | accountant | staff
  name text not null,
  permissions jsonb not null default '[]',   -- list of permission keys
  unique (business_id, key)
);

create table business_membership (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  person_id uuid not null references person(id),
  role_id uuid not null references role(id),
  status membership_status not null default 'invited',
  location_scope uuid[],                     -- null = all locations (IDN-004)
  staff_pin_hash text,                       -- terminal PIN switching, never the owner session (IDN-007)
  expires_at timestamptz,                    -- time-limited external access (IDN-008)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, person_id)
);
create index membership_person_idx on business_membership(person_id);

-- Delegated authority: bounded decision rights, e.g. refund approval (IDN-005)
create table delegated_authority (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  membership_id uuid not null references business_membership(id),
  authority_key text not null,               -- approve_refund | approve_discount | approve_expense
  max_amount numeric(14,2),
  currency_code text,
  granted_by uuid not null references business_membership(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Device registration: POS terminals are trusted, revocable devices
-- (IDN-006, IDN-011, HWD-001..HWD-005, OFL-013)
-- ---------------------------------------------------------------------------
create type device_status as enum ('registered', 'active', 'revoked', 'retired');
create type device_mode as enum ('terminal', 'business_mobile');

create table device_registration (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  mode device_mode not null default 'terminal',
  status device_status not null default 'registered',
  model text,
  serial_number text,
  device_fingerprint text unique,
  offline_lease_expires_at timestamptz,      -- offline auth is time-limited and device-bound (POS-OFF-006)
  last_sync_at timestamptz,                  -- surfaced to owners (POS-013, ARC-013)
  pending_transaction_count int not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references business_membership(id),
  created_at timestamptz not null default now()
);
create index device_business_idx on device_registration(business_id);

-- ---------------------------------------------------------------------------
-- Immutable audit trail for high-risk actions (ARC-011, SEC-006, SEC-007)
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references business(id),
  actor_person_id uuid references person(id),
  actor_membership_id uuid references business_membership(id),
  action text not null,                      -- role_changed | device_revoked | refund_approved | report_shared ...
  entity_type text,
  entity_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_business_idx on audit_log(business_id, created_at);

-- Audit rows are append-only.
revoke update, delete on audit_log from public;
