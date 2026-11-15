-- ---------------------------------------------------------------------------
-- 0087  Phase 2, step 2d.1: what the screens will read from the core
--
-- PHASE_2D_PLAN.md, approved by Collins on 15 Nov 2026 with every
-- recommendation. This adds what the dashboard and the customers list need
-- to read money from the commerce core, and somewhere to record how the
-- core figures differ from today's while both are computed (compare mode,
-- step 2d.2). Nothing a merchant sees changes here.
--
-- EARNED_AT
--   When a transaction was earned: a till sale when completed, a shop
--   order when fulfilled (a refund later does not move it), a booking when the service is completed, an
--   invoice raised on its own when issued. Set once, the first time a
--   transaction reaches that state, and never moved: a later refund,
--   credit or reversal is an adjustment, not a change to when it was
--   earned. Proformas are requests for payment and are never earned.
--   Existing transactions are backfilled from their product records.
--
-- commerce_dashboard_figures(business, day)   the dashboard's money figures
--   sales_today      earned that day on every channel, less refunds and
--                    credits given that day, less reversals that day of
--                    sales earned earlier (decisions 8.1 and 8.2)
--   received_today   confirmed payments that day paying a sale, order,
--                    booking or invoice, less refunds paid out that day;
--                    Ascend Balance top-ups are not included (8.4)
--   owed, owed_customers, overdue_count, overdue_amount, oldest_owed_days
--                    what customers have committed to and not paid or been
--                    credited: issued invoices and proformas, confirmed
--                    orders, confirmed bookings (8.3); nothing on a
--                    transaction refunded in full
-- commerce_customer_money(business)   spent (paid less refunds) and owed
--                    (the same committed rule) per customer
--
-- commerce_reader_comparison   one row per business, figure and day where
--   today's figure and the core's differ, while compare mode runs. Totals
--   only: no customer names or per-customer amounts. Operational, so not
--   one of the protected history tables; it can be pruned after the switch.
--
-- Tables and columns read: commercial_transaction, payment_obligation,
-- obligation_balance, payment_allocation, payment (status, verification,
-- occurred_at), commerce_adjustment, sale (occurred_at), shop_order
-- (updated_at), service_booking (updated_at), document (issued_at).
-- ---------------------------------------------------------------------------

alter table commercial_transaction add column if not exists earned_at timestamptz;
create index if not exists commercial_transaction_earned
  on commercial_transaction (business_id, earned_at) where earned_at is not null;

-- Is this transaction, as it now stands, in an earned state?
create or replace function commerce_is_earned(p_origin text, p_type text, p_product_status text)
returns boolean language sql immutable as $$
  select case p_origin
    when 'sale' then p_product_status = 'completed'
    when 'shop_order' then p_product_status = 'fulfilled'
    when 'service_booking' then p_product_status = 'completed'
    when 'document' then p_type = 'invoice'
      and p_product_status not in ('draft', 'pending_approval', 'change_requested',
                                   'cancelled', 'rejected', 'expired')
    else false
  end
$$;

-- Set earned_at the first time, and only the first time.
create or replace function commerce_stamp_earned()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.earned_at is not null then
    new.earned_at := old.earned_at;   -- never moved once set
    return new;
  end if;
  if new.earned_at is not null then
    return new;                       -- the backfill sets it explicitly
  end if;
  if commerce_is_earned(new.origin_type, new.transaction_type, new.product_status) then
    if new.origin_type = 'document' then
      -- Only once the invoice itself is issued. An invoice converted from a
      -- proforma briefly carries the proforma's state while still a draft.
      new.earned_at := (select issued_at from document where id = new.origin_id);
    elsif new.origin_type = 'sale' then
      new.earned_at := coalesce((select occurred_at from sale where id = new.origin_id), now());
    else
      new.earned_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists commerce_stamp_earned on commercial_transaction;
create trigger commerce_stamp_earned
  before insert or update on commercial_transaction
  for each row execute function commerce_stamp_earned();

-- Backfill, from the product records.
update commercial_transaction t
   set earned_at = case t.origin_type
         when 'sale' then (select occurred_at from sale where id = t.origin_id)
         when 'shop_order' then (select updated_at from shop_order where id = t.origin_id)
         when 'service_booking' then (select updated_at from service_booking where id = t.origin_id)
         when 'document' then (select issued_at from document where id = t.origin_id)
       end
 where t.earned_at is null
   and commerce_is_earned(t.origin_type, t.transaction_type, t.product_status);

-- ---------------------------------------------------------------------------
-- What customers have committed to (decision 8.3)
-- ---------------------------------------------------------------------------
-- Whether the merchant accepted it is the product's own state, not the
-- money state: an order nobody confirmed, then paid and refunded, reads
-- "refunded" in the core but was never committed. And a transaction
-- refunded in full owes nothing.
create or replace function commerce_is_committed(p_origin text, p_product_status text, p_status commerce_status)
returns boolean language sql immutable as $$
  select b not in ('draft', 'cancelled', 'reversed')
     and (p_origin = 'document' or b <> 'pending')
     and p_status <> 'refunded'
    from (select commerce_status(p_origin, p_product_status) as b) x
$$;

-- ---------------------------------------------------------------------------
-- The dashboard's money figures from the core
-- ---------------------------------------------------------------------------
create or replace function commerce_dashboard_figures(p_business uuid, p_day date)
returns table (
  sales_today numeric,
  sale_count int,
  received_today numeric,
  verified_received numeric,
  owed numeric,
  owed_customers int,
  overdue_count int,
  overdue_amount numeric,
  oldest_owed_days int
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with earned as (
    select t.id, t.total
      from commercial_transaction t
     where t.business_id = p_business
       and t.earned_at >= p_day::timestamptz and t.earned_at < (p_day + 1)::timestamptz
       and t.status not in ('draft', 'cancelled', 'reversed')
  ),
  given_back as (
    -- Refunds and credits given that day, on any transaction.
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
     where j.business_id = p_business
       and j.kind in ('refund', 'credit', 'return')
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
  ),
  reversed_today as (
    -- A sale earned earlier and reversed that day comes off that day. One
    -- earned and reversed the same day is simply not counted above.
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
      join commercial_transaction t on t.id = j.transaction_id
     where j.business_id = p_business
       and j.kind = 'reversal'
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
       and t.earned_at < p_day::timestamptz
  ),
  received as (
    select coalesce(sum(a.amount), 0) as amount,
           coalesce(sum(a.amount) filter (where p.verification = 'provider_confirmed'), 0) as verified
      from payment_allocation a
      join payment p on p.id = a.payment_id
     where a.business_id = p_business
       and p.status = 'confirmed'
       and p.occurred_at >= p_day::timestamptz and p.occurred_at < (p_day + 1)::timestamptz
  ),
  refunded_today as (
    select coalesce(sum(j.amount), 0) as amount
      from commerce_adjustment j
     where j.business_id = p_business
       and j.kind = 'refund'
       and j.occurred_at >= p_day::timestamptz and j.occurred_at < (p_day + 1)::timestamptz
  ),
  open_owed as (
    select t.customer_id, b.outstanding, o.due_date
      from obligation_balance b
      join payment_obligation o on o.id = b.obligation_id
      join commercial_transaction t on t.id = b.transaction_id
     where b.business_id = p_business
       and b.status not in ('cancelled', 'written_off')
       and b.outstanding > 0
       and commerce_is_committed(t.origin_type, t.product_status, t.status)
  )
  select
    round((select coalesce(sum(total), 0) from earned)
          - (select amount from given_back)
          - (select amount from reversed_today), 2),
    (select count(*)::int from earned),
    round((select amount from received) - (select amount from refunded_today), 2),
    round((select verified from received), 2),
    round((select coalesce(sum(outstanding), 0) from open_owed), 2),
    (select count(distinct customer_id)::int from open_owed where customer_id is not null),
    (select count(*)::int from open_owed where due_date < p_day),
    round((select coalesce(sum(outstanding), 0) from open_owed where due_date < p_day), 2),
    (select max(p_day - due_date)::int from open_owed where due_date < p_day)
$fn$;

-- ---------------------------------------------------------------------------
-- The customers list's money figures from the core
-- ---------------------------------------------------------------------------
create or replace function commerce_customer_money(p_business uuid)
returns table (customer_id uuid, spent numeric, owed numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select t.customer_id,
         round(coalesce(sum(b.amount_paid), 0)
               - coalesce((select sum(j.amount) from commerce_adjustment j
                            join commercial_transaction t2 on t2.id = j.transaction_id
                           where t2.customer_id = t.customer_id and t2.business_id = p_business
                             and j.kind = 'refund' and j.obligation_id is null), 0), 2) as spent,
         round(coalesce(sum(b.outstanding) filter (
                 where b.status not in ('cancelled', 'written_off')
                   and commerce_is_committed(t.origin_type, t.product_status, t.status)), 0), 2) as owed
    from commercial_transaction t
    join obligation_balance b on b.transaction_id = t.id
   where t.business_id = p_business
     and t.customer_id is not null
   group by t.customer_id
$fn$;

-- ---------------------------------------------------------------------------
-- Compare mode: where today's figures and the core's differ
-- ---------------------------------------------------------------------------
create table if not exists commerce_reader_comparison (
  id bigint generated always as identity primary key,
  business_id uuid not null references business(id),
  screen text not null check (screen in ('dashboard', 'customers')),
  figure text not null,
  day date not null,
  current_value numeric not null,
  core_value numeric not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  times_seen int not null default 1,
  constraint commerce_reader_comparison_once unique (business_id, screen, figure, day)
);
create index if not exists commerce_reader_comparison_day on commerce_reader_comparison (day desc);
alter table commerce_reader_comparison enable row level security;
revoke all on commerce_reader_comparison from anon, authenticated;

-- Records a difference (or clears the day's row when they agree again).
create or replace function commerce_record_comparison(
  p_business uuid, p_screen text, p_figure text, p_day date, p_current numeric, p_core numeric
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  if round(coalesce(p_current, 0), 2) = round(coalesce(p_core, 0), 2) then
    delete from commerce_reader_comparison
     where business_id = p_business and screen = p_screen and figure = p_figure and day = p_day;
    return;
  end if;
  insert into commerce_reader_comparison (business_id, screen, figure, day, current_value, core_value)
  values (p_business, p_screen, p_figure, p_day, round(coalesce(p_current, 0), 2), round(coalesce(p_core, 0), 2))
  on conflict (business_id, screen, figure, day) do update
     set current_value = excluded.current_value,
         core_value = excluded.core_value,
         last_seen = now(),
         times_seen = commerce_reader_comparison.times_seen + 1;
end
$fn$;

do $$
declare f text;
begin
  foreach f in array array[
    'commerce_is_earned(text, text, text)',
    'commerce_is_committed(text, text, commerce_status)',
    'commerce_dashboard_figures(uuid, date)',
    'commerce_customer_money(uuid)',
    'commerce_record_comparison(uuid, text, text, date, numeric, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
