-- AscendSME Connected Platform. Migration 0003: Commerce (POS sales, Shop
-- orders), Services (bookings, jobs) and Documents.
-- Sales are append-only. Corrections use reversal and reissue, never
-- destructive editing (POS-017, POS §18.2). Documents have immutable issued
-- versions (DOC-004, DOC-005).

-- ---------------------------------------------------------------------------
-- POS Core: shifts first, because sales belong to shifts (POS-SHF-001).
-- ---------------------------------------------------------------------------
create type shift_status as enum ('open', 'closing', 'closed', 'adjusted');

create table pos_shift (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,                       -- offline open/close idempotency
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  device_id uuid references device_registration(id),
  cashier_membership_id uuid not null references business_membership(id),
  status shift_status not null default 'open',
  opening_cash numeric(14,2),
  expected_cash numeric(14,2),
  declared_cash numeric(14,2),
  cash_difference numeric(14,2),
  difference_note text,                          -- required above threshold (POS-SHF-005)
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  approved_by uuid references business_membership(id)
);
create index shift_business_idx on pos_shift(business_id, location_id, opened_at);

-- One open shift per device policy (POS-SHF-010)
create unique index shift_one_open_per_device
  on pos_shift(device_id) where status = 'open' and device_id is not null;

-- ---------------------------------------------------------------------------
-- Sale: the POS transaction record. Append-only (POS §18.2 conflict policy).
-- ---------------------------------------------------------------------------
create type sale_status as enum ('completed', 'held', 'cancelled', 'reversed');

create table sale (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,                        -- device-generated, prevents duplicate completion (POS-SALE-006, POS-OFF-003)
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  device_id uuid references device_registration(id),
  shift_id uuid references pos_shift(id),
  cashier_membership_id uuid references business_membership(id),
  customer_id uuid references customer(id),      -- optional: anonymous sales allowed (POS-SALE-004)
  status sale_status not null default 'completed',
  subtotal numeric(14,2) not null,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  currency_code text not null default 'GHS',
  note text,
  receipt_number text not null,                  -- unique within scheme, stable after sync (POS-RCP-001, POS-RCP-008)
  reversal_of uuid references sale(id),          -- corrections reference the original (POS-017)
  occurred_at timestamptz not null,              -- device time
  business_date date not null,
  synced_at timestamptz not null default now(),
  unique (business_id, receipt_number)
);
create index sale_business_date_idx on sale(business_id, business_date);
create index sale_shift_idx on sale(shift_id);

create table sale_line (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sale(id),
  item_id uuid not null references catalogue_item(id),
  variant_id uuid references item_variant(id),
  description text not null,                     -- captured at sale time
  quantity numeric(14,3) not null check (quantity > 0),  -- POS-SALE-009
  unit_price numeric(14,2) not null,             -- captured price, survives catalogue changes
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
create index sale_line_sale_idx on sale_line(sale_id);

-- ---------------------------------------------------------------------------
-- Shop orders (Commerce Core). Shared customer, catalogue, payments, documents.
-- ---------------------------------------------------------------------------
create type order_status as enum (
  'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery',
  'fulfilled', 'cancelled', 'refunded'
);
create type fulfilment_method as enum ('pickup', 'merchant_delivery', 'third_party_delivery');

create table shop_order (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  customer_id uuid references customer(id),
  status order_status not null default 'pending',
  fulfilment fulfilment_method not null default 'pickup',
  delivery_detail jsonb not null default '{}',
  subtotal numeric(14,2) not null,
  delivery_fee numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  currency_code text not null default 'GHS',
  source text not null default 'shop_link',      -- shop_link | whatsapp | qr | discover (SHP-012, DSC-011)
  assigned_membership_id uuid references business_membership(id),  -- basic assignment without full Office (SHP-016)
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_business_idx on shop_order(business_id, placed_at);

create table shop_order_line (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references shop_order(id),
  item_id uuid not null references catalogue_item(id),
  variant_id uuid references item_variant(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  line_total numeric(14,2) not null
);

-- ---------------------------------------------------------------------------
-- Services Core: bookings, classes, field jobs (SRV-001..SRV-021)
-- ---------------------------------------------------------------------------
create type booking_model as enum (
  'fixed_slot', 'request_to_book', 'quote_first', 'class_session', 'field_job', 'project'
);
create type booking_status as enum (
  'requested', 'quoted', 'confirmed', 'in_progress', 'completed',
  'cancelled', 'no_show'
);

create table service_booking (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  customer_id uuid references customer(id),
  item_id uuid references catalogue_item(id),     -- the service from the shared catalogue (SRV-003)
  model booking_model not null default 'fixed_slot',
  status booking_status not null default 'requested',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  assigned_membership_id uuid references business_membership(id),  -- basic provider assignment (SRV-014)
  service_address text,                            -- field jobs (SRV-010)
  deposit_required numeric(14,2),
  price_quoted numeric(14,2),
  currency_code text not null default 'GHS',
  staff_notes text,                                -- never customer-visible (SRV-013)
  completion_detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_business_idx on service_booking(business_id, scheduled_start);
create index booking_provider_idx on service_booking(assigned_membership_id, scheduled_start);

create table staff_availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  membership_id uuid not null references business_membership(id),
  location_id uuid references location(id),
  day_of_week int check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  effective_from date,
  effective_to date
);

-- ---------------------------------------------------------------------------
-- Documents Core: the shared transaction formalization layer (DOC-001..DOC-020)
-- ---------------------------------------------------------------------------
create type document_type as enum (
  'quotation', 'proforma', 'invoice', 'receipt', 'credit_note',
  'purchase_order', 'delivery_note', 'agreement', 'job_card', 'statement'
);
create type document_status as enum (
  'draft', 'issued', 'sent', 'delivered', 'viewed', 'accepted', 'rejected',
  'paid', 'partially_paid', 'overdue', 'cancelled', 'superseded'
);

create table document (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,                          -- offline drafts (DOC-014, OFL-004)
  business_id uuid not null references business(id),
  customer_id uuid references customer(id),
  type document_type not null,
  status document_status not null default 'draft',
  number text,                                     -- assigned at issuance, unique per business+type (DOC-004)
  currency_code text not null default 'GHS',
  subtotal numeric(14,2),
  tax_total numeric(14,2),
  total numeric(14,2),
  lines jsonb not null default '[]',
  branding jsonb not null default '{}',
  -- Origin linkage: documents stay linked to sales, orders, bookings, projects (DOC-002, CAP-007)
  source_entity_type text,                          -- sale | shop_order | service_booking | project
  source_entity_id uuid,
  converted_from uuid references document(id),      -- controlled conversion preserves history (DOC-003)
  issued_at timestamptz,
  issued_snapshot jsonb,                            -- immutable issued version (DOC-004)
  due_date date,
  accepted_at timestamptz,
  signature jsonb,
  created_by uuid references business_membership(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index document_number_idx on document(business_id, type, number)
  where number is not null;
create index document_business_idx on document(business_id, created_at);
create index document_source_idx on document(source_entity_type, source_entity_id);

create table document_delivery (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id),
  channel text not null,                            -- whatsapp | email | sms | link | print (DOC-007)
  recipient text,
  status text not null default 'queued',            -- queued | sent | delivered | viewed | failed
  occurred_at timestamptz not null default now()
);
