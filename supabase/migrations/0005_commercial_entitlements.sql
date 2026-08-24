-- AscendSME Connected Platform. Migration 0005: Commercial Core.
-- Ascend Balance, Assurance, entitlements and the country price book.
-- The entitlement engine is the authoritative commercial access layer
-- (ENT-010..ENT-013). Prices live in the price book, never hardcoded in
-- product workflows (ENT-018, MON-015).

-- ---------------------------------------------------------------------------
-- Capability register: the canonical list preventing duplicate development
-- (ARC-015, CAP-015)
-- ---------------------------------------------------------------------------
create type capability_class as enum (
  'core', 'embedded_essential', 'advanced', 'optional', 'country_specific', 'future'
);

create table capability (
  key text primary key,                          -- pos.sell | shop.catalogue | office.approvals ...
  name text not null,
  owning_domain text not null,                   -- identity | catalogue | inventory | commerce | pos | services | documents | finance | work | messaging | evidence | commercial
  class capability_class not null default 'core',
  description text
);

-- Product sets are experience and commercial packages, not systems (§6.1)
create table product_set (
  key text primary key,                          -- pos | shop | services | documents | office | discover | readiness
  name text not null,
  description text
);

insert into product_set (key, name, description) values
  ('pos', 'Ascend POS', 'Sell in person, print receipts, manage shifts and stock.'),
  ('shop', 'Ascend Shop', 'Turn product interest into structured online orders.'),
  ('services', 'Ascend Services', 'Receive bookings, deposits and service requests.'),
  ('documents', 'Ascend Documents', 'Create and track commercial documents.'),
  ('office', 'Ascend Office', 'Coordinate people, work and approvals.'),
  ('discover', 'Ascend Discover', 'Help customers find products, services and businesses.'),
  ('readiness', 'Ascend Readiness', 'Turn operating evidence into trusted business outputs.');

-- Embedded essentials: what each anchor product includes without upsell
-- (XST-004..XST-007, Appendix B)
create table product_set_capability (
  product_set_key text not null references product_set(key),
  capability_key text not null references capability(key),
  embedded boolean not null default false,       -- true = included essential
  primary key (product_set_key, capability_key)
);

-- ---------------------------------------------------------------------------
-- Country price book (MON-015, ENT-018)
-- ---------------------------------------------------------------------------
create table price_book_entry (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references country_config(code),
  sku text not null,                             -- pos_starter_setup | shop_capacity_50 | assurance_annual | boost_product_7d
  name text not null,
  kind text not null,                            -- one_time | duration_pass | capacity | promotion | verification | hardware
  amount numeric(14,2) not null,
  currency_code text not null,
  duration_days int,
  capacity jsonb,                                -- {"products": 50} or {"staff": 10, "locations": 2}
  active boolean not null default true,
  valid_from date,
  valid_to date,
  unique (country_code, sku)
);

-- ---------------------------------------------------------------------------
-- Purchases and entitlements
-- ---------------------------------------------------------------------------
create type entitlement_source as enum ('purchase', 'sponsorship', 'promotion', 'support_grant');
create type entitlement_status as enum ('active', 'grace', 'expired', 'revoked');

create table purchase (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  price_book_entry_id uuid references price_book_entry(id),
  description text not null,                     -- every charge shows what was bought (MON-005)
  amount numeric(14,2) not null,
  currency_code text not null default 'GHS',
  payment_id uuid references payment(id),
  sponsor_id uuid,                               -- references institution below when sponsored
  created_at timestamptz not null default now()
);

create table entitlement (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  product_set_key text references product_set(key),
  capability_key text references capability(key),
  source entitlement_source not null default 'purchase',
  purchase_id uuid references purchase(id),
  status entitlement_status not null default 'active',
  capacity jsonb,                                -- staff bands, locations, devices, product counts (ENT-010)
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  grace_until timestamptz,                       -- grace before limiting live services (ENT-009)
  -- Support grants carry reason, owner and expiry audit (ENT-016)
  granted_by text,
  grant_reason text,
  created_at timestamptz not null default now()
);
create index entitlement_business_idx on entitlement(business_id, status);

-- ---------------------------------------------------------------------------
-- Ascend Balance: prepaid local-currency purchasing balance (ENT-001..ENT-006)
-- Balance is derived from append-only balance entries.
-- ---------------------------------------------------------------------------
create type balance_entry_kind as enum (
  'top_up', 'promo_credit', 'sponsor_credit', 'deduction', 'reversal'
);

create table balance_entry (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  kind balance_entry_kind not null,
  amount numeric(14,2) not null,                 -- signed: deductions negative
  currency_code text not null default 'GHS',
  service_key text,                              -- every deduction names the purchased service (ENT-003)
  source_entity_type text,
  source_entity_id uuid,
  reversal_of uuid references balance_entry(id), -- failed services reverse cleanly (ENT-004)
  promo_conditions jsonb,                        -- promo credits are distinguishable (ENT-005)
  created_at timestamptz not null default now()
);
create index balance_business_idx on balance_entry(business_id, created_at);
revoke update, delete on balance_entry from public;

create view ascend_balance as
select business_id, currency_code, sum(amount) as balance
from balance_entry
group by business_id, currency_code;

-- ---------------------------------------------------------------------------
-- Institutional layer: sponsors, cohorts, consented access (INS-001..INS-015)
-- ---------------------------------------------------------------------------
create table institution (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,                            -- bank | insurer | development_org | government | association | corporate
  country_code text references country_config(code),
  created_at timestamptz not null default now()
);

create table cohort (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  name text not null,
  programme text,
  starts_at date,
  ends_at date,
  transition_plan text                            -- post-sponsorship path (INS-002, XST-012)
);

create table cohort_membership (
  cohort_id uuid not null references cohort(id),
  business_id uuid not null references business(id),
  joined_at timestamptz not null default now(),
  exited_at timestamptz,                          -- exit never deletes the business account (INS-014)
  primary key (cohort_id, business_id)
);
