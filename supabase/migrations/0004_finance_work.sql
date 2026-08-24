-- AscendSME Connected Platform. Migration 0004: Finance Core and Work Core.
-- One payment record model across POS, Shop, Services and Documents (PAY-001).
-- Verification confidence is explicit: cash and merchant-declared records are
-- never presented as provider-confirmed (PAY-006, MKT-007, POS-OFF-009).

-- ---------------------------------------------------------------------------
-- Payments (Payments Core)
-- ---------------------------------------------------------------------------
create type payment_method as enum (
  'cash', 'mobile_money', 'card', 'bank_transfer', 'payment_link', 'credit', 'balance'
);
create type payment_status as enum (
  'initiated', 'pending', 'confirmed', 'failed', 'reversed', 'refunded', 'disputed'
);
-- Evidence confidence ladder (RDY-008)
create type payment_verification as enum (
  'merchant_declared', 'customer_confirmed', 'provider_confirmed'
);

create table payment (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,                        -- offline idempotency (POS-PAY-011)
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  customer_id uuid references customer(id),
  method payment_method not null,
  status payment_status not null default 'pending',
  verification payment_verification not null default 'merchant_declared',
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'GHS',
  tendered numeric(14,2),                        -- cash: change = tendered - allocated (POS-PAY-002)
  provider text,                                 -- mtn_momo | telecel_cash | paystack | bank
  provider_reference text,
  provider_fee numeric(14,2),
  -- Source record linkage (PAY-003)
  source_entity_type text not null,              -- sale | shop_order | service_booking | document
  source_entity_id uuid not null,
  reversal_of uuid references payment(id),       -- refunds keep links to originals (PAY-008)
  actor_membership_id uuid references business_membership(id),
  device_id uuid references device_registration(id),
  occurred_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index payment_business_idx on payment(business_id, occurred_at);
create index payment_source_idx on payment(source_entity_type, source_entity_id);

-- Provider callbacks are recorded raw and processed idempotently (PAY-005)
create table provider_callback (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  payload jsonb not null,
  signature_valid boolean,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  unique (provider, external_id)
);

-- ---------------------------------------------------------------------------
-- Financial ledger: normalized entries from committed activity (PAY-011)
-- ---------------------------------------------------------------------------
create type ledger_entry_kind as enum (
  'sale_revenue', 'refund', 'expense', 'till_expense', 'fee', 'settlement', 'adjustment'
);

create table ledger_entry (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  kind ledger_entry_kind not null,
  amount numeric(14,2) not null,                 -- signed
  currency_code text not null default 'GHS',
  source_entity_type text not null,
  source_entity_id uuid not null,
  business_date date not null,
  created_at timestamptz not null default now()
);
create index ledger_business_idx on ledger_entry(business_id, business_date);
revoke update, delete on ledger_entry from public;

-- Receivables: credit sales and unpaid documents (DOC-017, POS §21)
create table receivable (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  customer_id uuid not null references customer(id),
  source_entity_type text not null,              -- sale | document
  source_entity_id uuid not null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  currency_code text not null default 'GHS',
  due_date date,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index receivable_customer_idx on receivable(business_id, customer_id);

-- ---------------------------------------------------------------------------
-- Work Core (Ascend Office): tasks reference source records, never copy them
-- (OFF-003, CAP-008)
-- ---------------------------------------------------------------------------
create type task_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');

create table project (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  name text not null,
  customer_id uuid references customer(id),
  source_entity_type text,                       -- accepted quotation creates a linked project (OFF-006)
  source_entity_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table task (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  project_id uuid references project(id),
  title text not null,
  detail text,
  status task_status not null default 'open',
  assigned_membership_id uuid references business_membership(id),
  due_at timestamptz,
  -- Connected work references the original order or booking (OFF-004, OFF-005)
  source_entity_type text,
  source_entity_id uuid,
  created_by uuid references business_membership(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_business_idx on task(business_id, status);
create index task_source_idx on task(source_entity_type, source_entity_id);

-- Attendance essentials: embedded for POS/Services without full Office (POS-019, OFF-021)
create table attendance_record (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  membership_id uuid not null references business_membership(id),
  check_in timestamptz not null,
  check_out timestamptz,
  source text not null default 'manual'          -- manual | pos_shift | mobile
);

-- Approvals: amount, type, role and location rules; no self-approval where
-- separation of duties is configured (OFF-011, IDN-016)
create type approval_status as enum ('requested', 'approved', 'rejected', 'cancelled');

create table approval_request (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  kind text not null,                            -- refund | void | discount | expense | purchase | leave
  amount numeric(14,2),
  currency_code text,
  source_entity_type text,
  source_entity_id uuid,
  requested_by uuid not null references business_membership(id),
  status approval_status not null default 'requested',
  decided_by uuid references business_membership(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (decided_by is null or decided_by <> requested_by)  -- IDN-016
);

create table expense (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid references location(id),
  membership_id uuid references business_membership(id),
  amount numeric(14,2) not null,
  currency_code text not null default 'GHS',
  category text,
  detail text,
  approval_id uuid references approval_request(id),
  business_date date not null default current_date,
  created_at timestamptz not null default now()
);
