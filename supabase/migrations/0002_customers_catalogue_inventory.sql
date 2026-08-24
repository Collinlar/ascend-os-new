-- AscendSME Connected Platform. Migration 0002: Customers, Catalogue, Inventory.
-- One shared customer record, one shared catalogue, one movement-based
-- inventory ledger. Product sets add context, never duplicates.
-- PRD refs: CAP-003..CAP-005, SHP-006, SRV-003, POS-INV-001..012.

-- ---------------------------------------------------------------------------
-- Customer Core (CAP-003). A customer may optionally link to a platform person
-- but a customer profile never becomes staff membership automatically (IDN-012).
-- ---------------------------------------------------------------------------
create table customer (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  person_id uuid references person(id),        -- set when the customer claims their profile
  display_name text not null,
  phone_e164 text,
  email text,
  organisation_name text,
  notes text,                                   -- internal, never customer-visible (SRV-013)
  marketing_consent boolean not null default false,
  marketing_opt_out_at timestamptz,
  created_via text not null default 'manual',   -- manual | pos | shop | services | documents | import
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_business_idx on customer(business_id);
create index customer_phone_idx on customer(business_id, phone_e164);

-- Consent records: purpose, recipient, duration, withdrawal (SEC-011)
create table consent_record (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  customer_id uuid references customer(id),
  purpose text not null,                        -- marketing | receipts | partner_report
  channel text,                                 -- whatsapp | sms | email
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  detail jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Catalogue Core (CAP-004). One item identity; channel listings carry
-- channel-specific price, media and visibility without forking the item.
-- ---------------------------------------------------------------------------
create type item_kind as enum ('product', 'service');

create table catalogue_item (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  kind item_kind not null default 'product',
  name text not null,
  description text,
  category text,
  sku text,
  barcode text,
  base_price numeric(14,2),
  currency_code text not null default 'GHS',
  tax_profile jsonb not null default '{}',
  track_stock boolean not null default false,
  stock_enforcement text not null default 'none', -- none | soft | hard (POS-INV-003)
  low_stock_threshold numeric(14,3),
  -- Services attributes (SRV-003): duration, capacity, delivery model
  service_attributes jsonb,
  -- AI-assisted content keeps source, confidence and approval status (API-012, SHP-003)
  ai_suggestion jsonb,
  ai_content_approved_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalogue_business_idx on catalogue_item(business_id);
create index catalogue_barcode_idx on catalogue_item(business_id, barcode);

create table item_variant (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references catalogue_item(id),
  name text not null,                            -- "Large / Red"
  sku text,
  barcode text,
  price_delta numeric(14,2) not null default 0,
  active boolean not null default true
);

-- Channel listing: Shop/Discover/POS presentation of a shared item (CAP-004, SHP-006)
create table channel_listing (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references catalogue_item(id),
  channel text not null,                         -- pos | shop | discover
  price_override numeric(14,2),
  media jsonb not null default '[]',             -- WebP urls, explicit dimensions
  description_override text,
  visible boolean not null default true,
  unique (item_id, channel)
);

-- Catalogue price versioning: a sale retains its captured price (POS §18.2)
create table price_version (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references catalogue_item(id),
  price numeric(14,2) not null,
  effective_from timestamptz not null default now(),
  created_by uuid references business_membership(id)
);

-- ---------------------------------------------------------------------------
-- Inventory Core (CAP-005). Stock is the result of auditable movements.
-- Current stock is derived, never silently overwritten (POS §19.1, POS-INV-012).
-- ---------------------------------------------------------------------------
create type movement_kind as enum (
  'opening_balance', 'sale', 'restock', 'customer_return',
  'damage_loss', 'count_correction', 'transfer_out', 'transfer_in',
  'reservation', 'reservation_release'
);

create table stock_movement (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,                        -- client-generated id for offline idempotency (OFL-006, POS-OFF-003)
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  item_id uuid not null references catalogue_item(id),
  variant_id uuid references item_variant(id),
  kind movement_kind not null,
  quantity numeric(14,3) not null,               -- signed: sale negative, restock positive
  unit_cost numeric(14,2),
  reason text,                                   -- required for corrections (POS-INV-005)
  source_entity_type text,                       -- sale | order | transfer | count_session
  source_entity_id uuid,
  reversal_of uuid references stock_movement(id),
  actor_membership_id uuid references business_membership(id),
  device_id uuid references device_registration(id),
  occurred_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index movement_item_idx on stock_movement(business_id, location_id, item_id);
create index movement_source_idx on stock_movement(source_entity_type, source_entity_id);

-- Movements are append-only; corrections use reversing movements (POS-INV-012).
revoke update, delete on stock_movement from public;

-- Derived stock balance per item and location.
create view stock_balance as
select
  business_id,
  location_id,
  item_id,
  variant_id,
  sum(quantity) as quantity_on_hand,
  max(occurred_at) as last_movement_at
from stock_movement
where kind not in ('reservation', 'reservation_release')
group by business_id, location_id, item_id, variant_id;

-- Online order reservations (SHP-018) tracked separately from committed stock.
create view stock_reserved as
select business_id, location_id, item_id, variant_id, sum(quantity) as quantity_reserved
from stock_movement
where kind in ('reservation', 'reservation_release')
group by business_id, location_id, item_id, variant_id;
