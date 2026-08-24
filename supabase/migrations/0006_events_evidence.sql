-- AscendSME Connected Platform. Migration 0006: Business Events and the
-- Evidence Ledger. The heart of "everyday activity becomes structured,
-- verifiable and opportunity-ready evidence."
-- PRD refs: ARC-005..ARC-007, EVT-001..EVT-022, SCR-001..SCR-015, RDY-001..020.

-- ---------------------------------------------------------------------------
-- Transactional outbox (ARC-006): events are written in the same transaction
-- as the domain change, then relayed asynchronously. Consumers must be
-- idempotent (ARC-007).
-- ---------------------------------------------------------------------------
create type outbox_status as enum ('pending', 'dispatched', 'failed');

create table event_outbox (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  event_type text not null,                      -- pos.sale.completed | shop.order.placed | document.issued ...
  business_id uuid not null references business(id),
  location_id uuid,
  actor_membership_id uuid,
  channel text,                                  -- business_web | business_mobile | pos_terminal | customer_web | customer_mobile | system
  product_set text,                              -- pos | shop | services | documents | office | discover | readiness
  entity_type text not null,
  entity_id uuid not null,
  amount numeric(14,2),
  currency_code text,
  verification text,                             -- merchant_declared | customer_confirmed | provider_confirmed
  correction_of uuid,                            -- references original event_id (EVT-005)
  payload jsonb not null default '{}',
  business_date date,
  occurred_at timestamptz not null default now(),
  status outbox_status not null default 'pending',
  dispatched_at timestamptz,
  retry_count int not null default 0,
  last_error text
);
create index outbox_pending_idx on event_outbox(status, id) where status = 'pending';
create index outbox_business_idx on event_outbox(business_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Evidence ledger: append-only (EVT-007). Not every event becomes positive
-- evidence; evidence rules assess source, verification, consistency and
-- reversals (§13.1). Evidence supports expiry and supersession without
-- deleting history (EVT-012, EVT-013).
-- ---------------------------------------------------------------------------
create type evidence_dimension as enum (
  'identity_stability', 'financial_activity', 'operational_structure',
  'customer_market', 'documentation_compliance', 'governance_control',
  'digital_presence', 'evidence_quality'
);

create table evidence_record (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  source_event_id uuid not null,                 -- traceable to its event (EVT-008)
  dimension evidence_dimension not null,
  evidence_type text not null,                   -- verified_sale | reconciled_shift | issued_invoice | resolved_dispute ...
  verification text not null,                    -- merchant_declared | system_recorded | customer_confirmed | payment_verified | institution_verified (RDY-008)
  weight numeric(8,4) not null default 0,        -- signed; reversals produce negative adjustments
  valid_from timestamptz not null default now(),
  expires_at timestamptz,                        -- EVT-012
  superseded_by uuid references evidence_record(id),
  rule_version text not null,                    -- reproducible outputs (EVT-020)
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (source_event_id, evidence_type)        -- idempotent processing (EVT-006)
);
create index evidence_business_idx on evidence_record(business_id, dimension);
revoke update, delete on evidence_record from public;
-- Supersession is the one permitted mutation, applied via security-definer
-- function in the evidence service, never by product sets.

-- ---------------------------------------------------------------------------
-- Scoring outputs: MOT, Sustainability Score, Trust Level, Funding Readiness,
-- Evidence Confidence. Versioned models; historical results keep their model
-- version (SCR-002, RDY-018).
-- ---------------------------------------------------------------------------
create type score_output_kind as enum (
  'mot', 'sustainability_score', 'trust_level', 'funding_readiness', 'evidence_confidence'
);

create table score_model_version (
  id uuid primary key default gen_random_uuid(),
  kind score_output_kind not null,
  version text not null,
  definition jsonb not null,                     -- dimensions, weights, archetype expectations (SCR-007)
  approved_by text,
  approved_at timestamptz,
  active boolean not null default false,
  unique (kind, version)
);

create table score_result (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  kind score_output_kind not null,
  model_version_id uuid not null references score_model_version(id),
  value numeric(8,2) not null,
  dimension_breakdown jsonb not null,            -- explainability (SCR-003, PRI-008)
  recommendations jsonb not null default '[]',   -- actionable, linked to observed gaps (RDY-011)
  computed_at timestamptz not null default now()
);
create index score_business_idx on score_result(business_id, kind, computed_at);
revoke update, delete on score_result from public;

-- ---------------------------------------------------------------------------
-- Consented sharing: partners receive only authorized fields and periods
-- (RDY-013..RDY-015, INS-004..INS-006)
-- ---------------------------------------------------------------------------
create type share_status as enum ('active', 'expired', 'revoked');

create table report_share (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  institution_id uuid references institution(id),
  report_kind text not null,                     -- basic | verified | bank_ready | institution_specific (RDY-012)
  authorized_fields jsonb not null,
  period_from date,
  period_to date,
  consent_granted_by uuid not null references business_membership(id),
  status share_status not null default 'active',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table report_access_log (
  id bigint generated always as identity primary key,
  share_id uuid not null references report_share(id),
  accessor text not null,
  accessed_at timestamptz not null default now()
);
revoke update, delete on report_access_log from public;

-- ---------------------------------------------------------------------------
-- Row Level Security scaffold: tenant isolation on every business-scoped
-- table (SEC-001, ARC-019). Policies check membership via the helper below.
-- ---------------------------------------------------------------------------
create or replace function is_business_member(target_business uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from business_membership m
    join person p on p.id = m.person_id
    where m.business_id = target_business
      and m.status = 'active'
      and p.auth_user_id = auth.uid()
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'business', 'location', 'business_membership', 'delegated_authority',
    'device_registration', 'customer', 'consent_record', 'catalogue_item',
    'stock_movement', 'pos_shift', 'sale', 'shop_order', 'service_booking',
    'document', 'payment', 'ledger_entry', 'receivable', 'project', 'task',
    'attendance_record', 'approval_request', 'expense', 'purchase',
    'entitlement', 'balance_entry', 'event_outbox', 'evidence_record',
    'score_result', 'report_share'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Baseline read policy per table. Write policies are added per-domain as the
-- domain services land, so no product set can bypass owning-domain rules
-- (ARC-003).
create policy business_member_read on business
  for select using (is_business_member(id));
create policy location_member_read on location
  for select using (is_business_member(business_id));
create policy sale_member_read on sale
  for select using (is_business_member(business_id));
create policy payment_member_read on payment
  for select using (is_business_member(business_id));
create policy evidence_member_read on evidence_record
  for select using (is_business_member(business_id));
