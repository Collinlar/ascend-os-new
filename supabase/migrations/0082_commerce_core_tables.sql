-- ---------------------------------------------------------------------------
-- 0082  Phase 2, step 2a: the commerce core
--
-- Commerce spec (02): "a channel may initiate commerce differently, but
-- Ascend must preserve one commercial truth." Today a till sale, a shop
-- order, a booking and an invoice each keep their own money, statuses and
-- idea of what is owed. This adds the one model underneath them
-- (PHASE_2_PLAN.md, approved 14 Nov 2026):
--
--   commercial_transaction  one row per commercial event, any channel.
--                           Its origin (sale, shop_order, service_booking or
--                           document, with the id) is unique, so one product
--                           record can never become two transactions.
--   transaction_line        what was sold, with where the price came from.
--                           Once the transaction leaves draft, a line's
--                           price, quantity and total cannot change.
--   payment_obligation      what is owed and when: full, deposit, balance or
--                           instalment. A transaction may have several.
--   payment_allocation      which payment paid which obligation, how much.
--                           Many to many: split tender and part payments.
--
--   commerce_status(origin, product_status)
--                           the one mapping from each product's status to
--                           the spec's canonical states.
--   obligation_balance      view: paid and outstanding per obligation.
--
-- NOTHING WRITES THESE YET. Step 2b adds the triggers that fill them from
-- the product tables, and the backfill. No product table, function or
-- screen is changed here, so running this changes nothing for anyone.
--
-- Payment state (owed, part paid, paid) is not a transaction status: it
-- comes from the obligations, so "confirmed and half paid" needs no extra
-- state.
--
-- Every table carries business_id, so each business only ever sees its own
-- rows and cleanup by business works as for every other table.
--
-- Tables and columns read: business, customer, location, business_membership,
-- catalogue_item, item_variant, payment (ids only, as foreign keys).
-- ---------------------------------------------------------------------------

do $$ begin
  create type commerce_status as enum (
    'draft', 'pending', 'confirmed', 'partially_fulfilled', 'fulfilled',
    'completed', 'cancelled', 'partially_refunded', 'refunded', 'disputed',
    'reversed'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Commercial Transaction
-- ---------------------------------------------------------------------------
create table if not exists commercial_transaction (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  customer_id uuid references customer(id),
  location_id uuid references location(id),
  -- how it was initiated, and which product owns the screen it came from
  channel text not null check (channel in ('pos', 'shop', 'services', 'documents', 'manual')),
  originating_product text not null check (originating_product in ('pos', 'shop', 'services', 'documents')),
  transaction_type text not null check (transaction_type in ('sale', 'order', 'booking', 'invoice', 'proforma')),
  origin_type text not null check (origin_type in ('sale', 'shop_order', 'service_booking', 'document')),
  origin_id uuid not null,
  currency_code text not null,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  charges_total numeric(14,2) not null default 0,   -- delivery and similar fees
  total numeric(14,2) not null,
  status commerce_status not null,
  product_status text not null,                     -- the product's own label, for its own screens
  cancellation_reason text,
  actor_membership_id uuid references business_membership(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_transaction_one_per_origin unique (origin_type, origin_id),
  constraint commercial_transaction_amounts_not_negative
    check (subtotal >= 0 and discount_total >= 0 and tax_total >= 0 and charges_total >= 0 and total >= 0),
  -- spec section 8: a cancellation always says why
  constraint commercial_transaction_cancel_needs_reason
    check (status <> 'cancelled' or coalesce(btrim(cancellation_reason), '') <> '')
);

create index if not exists commercial_transaction_business_time
  on commercial_transaction (business_id, occurred_at desc);
create index if not exists commercial_transaction_customer
  on commercial_transaction (customer_id) where customer_id is not null;

-- ---------------------------------------------------------------------------
-- Transaction Line
-- ---------------------------------------------------------------------------
create table if not exists transaction_line (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  transaction_id uuid not null references commercial_transaction(id),
  line_number int not null,
  origin_line_id uuid,                              -- sale_line or shop_order_line id, when there is one
  item_id uuid references catalogue_item(id),
  variant_id uuid references item_variant(id),
  description text,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  -- spec section 7: where the price came from, and who overrode it
  price_source text not null default 'unknown'
    check (price_source in ('catalogue', 'manual_override', 'shop_override', 'quote', 'document', 'unknown')),
  price_overridden_by uuid references business_membership(id),
  created_at timestamptz not null default now(),
  constraint transaction_line_number_unique unique (transaction_id, line_number),
  constraint transaction_line_amounts_not_negative
    check (quantity > 0 and unit_price >= 0 and discount >= 0 and tax >= 0 and line_total >= 0)
);

create index if not exists transaction_line_transaction on transaction_line (transaction_id);

-- A line's price is history once the transaction has left draft.
create or replace function transaction_line_price_is_kept()
returns trigger language plpgsql as $$
declare v_status commerce_status;
begin
  select status into v_status from commercial_transaction where id = old.transaction_id;
  if v_status is distinct from 'draft' and (
       new.quantity is distinct from old.quantity
    or new.unit_price is distinct from old.unit_price
    or new.discount is distinct from old.discount
    or new.tax is distinct from old.tax
    or new.line_total is distinct from old.line_total
    or new.price_source is distinct from old.price_source
    or new.transaction_id is distinct from old.transaction_id) then
    raise exception 'transaction_line_price_kept: a line''s price cannot change once the sale is recorded; record an adjustment instead';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function transaction_line_delete_kept()
returns trigger language plpgsql as $$
declare v_status commerce_status;
begin
  select status into v_status from commercial_transaction where id = old.transaction_id;
  if v_status is distinct from 'draft' and v_status is not null then
    raise exception 'transaction_line_price_kept: a line cannot be removed once the sale is recorded; record an adjustment instead';
  end if;
  return old;
end $$;

drop trigger if exists transaction_line_price_kept on transaction_line;
create trigger transaction_line_price_kept
  before update on transaction_line
  for each row execute function transaction_line_price_is_kept();

drop trigger if exists transaction_line_delete_kept on transaction_line;
create trigger transaction_line_delete_kept
  before delete on transaction_line
  for each row execute function transaction_line_delete_kept();

-- ---------------------------------------------------------------------------
-- Payment Obligation
-- ---------------------------------------------------------------------------
create table if not exists payment_obligation (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  transaction_id uuid not null references commercial_transaction(id),
  kind text not null check (kind in ('full', 'deposit', 'balance', 'instalment')),
  amount_due numeric(14,2) not null check (amount_due >= 0),
  currency_code text not null,
  due_date date,
  status text not null default 'open'
    check (status in ('open', 'partially_paid', 'paid', 'cancelled', 'written_off')),
  status_reason text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_obligation_close_needs_reason
    check (status not in ('cancelled', 'written_off') or coalesce(btrim(status_reason), '') <> '')
);

create index if not exists payment_obligation_transaction on payment_obligation (transaction_id);
create index if not exists payment_obligation_open
  on payment_obligation (business_id, due_date) where status in ('open', 'partially_paid');

-- ---------------------------------------------------------------------------
-- Payment Allocation
-- ---------------------------------------------------------------------------
create table if not exists payment_allocation (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  payment_id uuid not null references payment(id),
  obligation_id uuid not null references payment_obligation(id),
  amount numeric(14,2) not null check (amount > 0),
  allocated_at timestamptz not null default now(),
  constraint payment_allocation_once unique (payment_id, obligation_id)
);

create index if not exists payment_allocation_obligation on payment_allocation (obligation_id);

-- Paid and outstanding, worked out from the allocations rather than stored
-- twice. Only confirmed payments count as paid.
create or replace view obligation_balance as
select o.id as obligation_id,
       o.business_id,
       o.transaction_id,
       o.kind,
       o.status,
       o.currency_code,
       o.amount_due,
       coalesce(sum(a.amount) filter (where p.status = 'confirmed'), 0)::numeric(14,2) as amount_paid,
       greatest(o.amount_due - coalesce(sum(a.amount) filter (where p.status = 'confirmed'), 0), 0)::numeric(14,2) as outstanding
from payment_obligation o
left join payment_allocation a on a.obligation_id = o.id
left join payment p on p.id = a.payment_id
group by o.id;

-- ---------------------------------------------------------------------------
-- The canonical state mapping (PHASE_2_PLAN.md section 3)
--
-- One function, so every product keeps its own label while the core speaks
-- one language. An unknown status is an error, never a guess: a new product
-- status has to be mapped here before it can reach the core.
--
-- Documents: only invoices and proformas become transactions (decision 2).
-- partially_paid and overdue are payment states, so the transaction stays
-- pending and the obligation says how much is paid. archived is not set by
-- anything today; it maps to completed until a product uses it.
-- ---------------------------------------------------------------------------
create or replace function commerce_status(p_origin text, p_status text)
returns commerce_status language plpgsql immutable as $$
declare v text;
begin
  v := case p_origin
    when 'sale' then case p_status
      when 'held' then 'draft'
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'reversed' then 'reversed' end
    when 'shop_order' then case p_status
      when 'pending' then 'pending'
      when 'confirmed' then 'confirmed'
      when 'preparing' then 'confirmed'
      when 'ready' then 'confirmed'
      when 'out_for_delivery' then 'partially_fulfilled'
      when 'fulfilled' then 'fulfilled'
      when 'cancelled' then 'cancelled'
      when 'refunded' then 'refunded' end
    when 'service_booking' then case p_status
      when 'requested' then 'pending'
      when 'quoted' then 'pending'
      when 'confirmed' then 'confirmed'
      when 'in_progress' then 'partially_fulfilled'
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'no_show' then 'cancelled' end
    when 'document' then case p_status
      when 'draft' then 'draft'
      when 'pending_approval' then 'draft'
      when 'change_requested' then 'draft'
      when 'issued' then 'pending'
      when 'sent' then 'pending'
      when 'delivered' then 'pending'
      when 'viewed' then 'pending'
      when 'approved' then 'pending'
      when 'accepted' then 'pending'
      when 'partially_paid' then 'pending'
      when 'overdue' then 'pending'
      when 'paid' then 'completed'
      when 'archived' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'rejected' then 'cancelled'
      when 'expired' then 'cancelled'
      when 'credited' then 'refunded'
      when 'refunded' then 'refunded'
      when 'superseded' then 'reversed' end
  end;
  if v is null then
    raise exception 'commerce_status_unmapped: % status "%" has no canonical state', p_origin, p_status;
  end if;
  return v::commerce_status;
end $$;

-- ---------------------------------------------------------------------------
-- Access: the app reaches these through the service role, like every other
-- table. Row level security is on so nothing else reads them.
-- ---------------------------------------------------------------------------
alter table commercial_transaction enable row level security;
alter table transaction_line enable row level security;
alter table payment_obligation enable row level security;
alter table payment_allocation enable row level security;
revoke all on commercial_transaction, transaction_line, payment_obligation, payment_allocation, obligation_balance
  from anon, authenticated;
revoke all on function commerce_status(text, text) from public, anon, authenticated;
grant execute on function commerce_status(text, text) to service_role;
