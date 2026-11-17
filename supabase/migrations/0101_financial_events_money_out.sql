-- ---------------------------------------------------------------------------
-- 0101  Financial Foundation, step F2: money out, and categories
--
-- FINANCIAL_FOUNDATION_PLAN.md 2.1 and 2.2, approved 17 Nov 2026 (decision 4:
-- a standard Ghana category list, drafted here for Collins to edit). Spec 07
-- sections 3, 5 and 11.
--
-- financial_category   the standard list (business_id null, per country) and
--                      the categories a business adds for itself
--                      (add_financial_category, owner only).
-- financial_category_for(business, text)   turns what a product sent (a key,
--                      a label, or free text) into a category key: a match
--                      to a standard or business category, 'uncategorised'
--                      when nothing was given, 'other' when it matches
--                      nothing (the words are kept on the event).
--
-- New facts in financial_event:
--
--   kind                basis     direction  from
--   expense             cash      out        an Office expense, once it is a
--                                            cost: below the approval
--                                            threshold, or approved. A
--                                            rejected or pending one is not.
--   till_expense        cash      out        money paid out of the drawer
--                                            during a shift
--   provider_fee        cash      out        what the provider kept on a
--                                            payment (payment.provider_fee),
--                                            and any settlement fee beyond
--                                            those
--   settlement_received transfer  in         the provider paid the merchant
--                                            out
--
-- A settlement is a transfer, not income: the money was counted when the
-- customer paid (money_received). Counting the payout as money in again
-- would count every cedi twice. Basis 'transfer' keeps it out of money in
-- and money out; it moves verified digital money from "with the provider"
-- to "in the bank" for the cash position (F3). This corrects the plan's
-- table, which listed it as money in.
--
-- till_expense gains a category column so the till can send one; until it
-- does, till paid-outs are 'uncategorised'.
--
-- Projection as in 0100, never blocking. An expense is projected when its
-- transaction commits (a deferred trigger), because submit_expense links its
-- approval request after inserting it; and again when the approval is
-- decided. A settlement is also projected at commit, once its lines exist.
--
-- Tables and columns read: expense (id, business_id, location_id,
-- membership_id, amount, currency_code, category, detail, approval_id,
-- business_date, created_at), approval_request (id, kind, status,
-- decided_by, decided_at), till_expense (id, business_id, location_id,
-- shift_id, amount, currency_code, reason, actor_membership_id,
-- occurred_at), payment (provider_fee, provider), settlement (id,
-- business_id, provider, provider_reference, gross_amount, fees,
-- net_amount, currency_code, settled_at), settlement_line (settlement_id,
-- payment_id, fee).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table if not exists financial_category (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  applies_to text not null check (applies_to in ('expense', 'revenue')),
  country_code text,                                  -- standard categories
  business_id uuid references business(id),           -- a business's own
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((business_id is null) <> (country_code is null))
);
create unique index if not exists financial_category_standard_key
  on financial_category (country_code, key) where business_id is null;
create unique index if not exists financial_category_business_key
  on financial_category (business_id, key) where business_id is not null;
alter table financial_category enable row level security;
revoke all on financial_category from anon, authenticated;

-- The standard Ghana list. A draft for Collins to edit.
insert into financial_category (key, label, applies_to, country_code, sort_order) values
  ('stock_purchases',   'Stock and goods for resale',             'expense', 'GH', 10),
  ('materials',         'Materials and supplies',                 'expense', 'GH', 20),
  ('rent',              'Rent',                                   'expense', 'GH', 30),
  ('utilities',         'Electricity and water',                  'expense', 'GH', 40),
  ('transport',         'Transport and fuel',                     'expense', 'GH', 50),
  ('airtime_data',      'Airtime and data',                       'expense', 'GH', 60),
  ('wages',             'Salaries and wages',                     'expense', 'GH', 70),
  ('casual_labour',     'Casual labour',                          'expense', 'GH', 80),
  ('payment_charges',   'MoMo, card and bank charges',            'expense', 'GH', 90),
  ('repairs',           'Repairs and maintenance',                'expense', 'GH', 100),
  ('packaging',         'Packaging',                              'expense', 'GH', 110),
  ('marketing',         'Marketing and adverts',                  'expense', 'GH', 120),
  ('licences_levies',   'Licences, permits and assembly levies',  'expense', 'GH', 130),
  ('equipment',         'Equipment and tools',                    'expense', 'GH', 140),
  ('professional_fees', 'Accountant, lawyer and other fees',      'expense', 'GH', 150),
  ('security',          'Security',                               'expense', 'GH', 160),
  ('cleaning',          'Cleaning and sanitation',                'expense', 'GH', 170),
  ('other',             'Other',                                  'expense', 'GH', 900),
  ('uncategorised',     'Not categorised yet',                    'expense', 'GH', 999),
  ('sales.till',        'Till sales',                             'revenue', 'GH', 10),
  ('sales.shop',        'Shop orders',                            'revenue', 'GH', 20),
  ('sales.services',    'Services',                               'revenue', 'GH', 30),
  ('sales.invoices',    'Invoices',                               'revenue', 'GH', 40)
on conflict do nothing;

create or replace function financial_category_for(p_business uuid, p_text text)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select case
    when nullif(btrim(coalesce(p_text, '')), '') is null then 'uncategorised'
    else coalesce(
      (select c.key from financial_category c
        where c.active and c.applies_to = 'expense'
          and (c.business_id = p_business
               or (c.business_id is null
                   and c.country_code = coalesce((select country_code from business where id = p_business), 'GH')))
          and (lower(c.key) = lower(btrim(p_text)) or lower(c.label) = lower(btrim(p_text)))
        order by c.business_id nulls last
        limit 1),
      'other')
  end
$fn$;

create or replace function add_financial_category(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_label text := nullif(btrim(coalesce(p->>'label', '')), '');
  v_key text;
  v_id uuid;
begin
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['business.settings']);
  if v_label is null or length(v_label) > 60 then
    raise exception 'category_label_needed: give the category a name of up to 60 characters';
  end if;
  v_key := 'own.' || trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g'));
  insert into financial_category (key, label, applies_to, business_id)
  values (v_key, v_label, 'expense', v_business)
  on conflict (business_id, key) where business_id is not null do update set active = true
  returning id into v_id;
  return jsonb_build_object('category_id', v_id, 'key', v_key);
end
$fn$;

alter table till_expense add column if not exists category text;

-- ---------------------------------------------------------------------------
-- The new kinds and the transfer basis
-- ---------------------------------------------------------------------------
alter table financial_event drop constraint if exists financial_event_kind_check;
alter table financial_event add constraint financial_event_kind_check check (kind in (
  'revenue_earned', 'revenue_refunded', 'credit_given', 'sale_reversed', 'goods_returned',
  'money_received', 'payment_reversed', 'refund_paid',
  'expense', 'till_expense', 'provider_fee', 'settlement_received'));
alter table financial_event drop constraint if exists financial_event_basis_check;
alter table financial_event add constraint financial_event_basis_check check (basis in ('earned', 'cash', 'transfer'));

-- ---------------------------------------------------------------------------
-- Money out
-- ---------------------------------------------------------------------------
create or replace function financial_events_sync_out(p_business uuid default null, p_source_type text default null, p_source_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n int; v_total int := 0;
begin
  -- Office expenses that have become a cost.
  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, category, location_id, verification, occurred_at, detail)
  select x.business_id, 'office', 'expense', x.id, 'expense', 'cash', 'out', x.amount, x.currency_code,
         financial_category_for(x.business_id, x.category), x.location_id, 'merchant_declared',
         coalesce(a.decided_at, x.created_at),
         jsonb_strip_nulls(jsonb_build_object(
           'business_date', x.business_date, 'detail', x.detail, 'recorded_by', x.membership_id,
           'category_as_entered', nullif(btrim(coalesce(x.category, '')), ''),
           'approved_by', a.decided_by))
    from expense x
    left join approval_request a on a.id = x.approval_id
   where (x.approval_id is null or a.status = 'approved')
     and (p_business is null or x.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'expense' and x.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Money paid out of the drawer.
  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, category, location_id, method, verification, occurred_at, detail)
  select t.business_id, 'pos', 'till_expense', t.id, 'till_expense', 'cash', 'out', t.amount, t.currency_code,
         financial_category_for(t.business_id, t.category), t.location_id, 'cash', 'merchant_declared', t.occurred_at,
         jsonb_build_object('reason', t.reason, 'shift', t.shift_id, 'recorded_by', t.actor_membership_id)
    from till_expense t
   where (p_business is null or t.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'till_expense' and t.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- What the provider kept on a payment.
  insert into financial_event (business_id, source, source_type, source_id, transaction_id, kind, basis, direction,
                               amount, currency_code, category, location_id, counterparty, verification, reversal_of,
                               occurred_at)
  select p.business_id, 'payments', 'payment', p.id, e.transaction_id, 'provider_fee', 'cash', 'out',
         p.provider_fee, p.currency_code, 'payment_charges', p.location_id, p.provider,
         case when p.verification = 'provider_confirmed' then 'payment_verified' else p.verification::text end,
         null, p.occurred_at
    from payment p
    left join financial_event e on e.source_type = 'payment' and e.source_id = p.id and e.kind = 'money_received'
   where coalesce(p.provider_fee, 0) > 0 and p.reversal_of is null
     and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
     and (p_business is null or p.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'payment' and p.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- Payouts: a transfer, with any fee beyond the payments' own.
  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, counterparty, verification, occurred_at, detail)
  select s.business_id, 'payments', 'settlement', s.id, 'settlement_received', 'transfer', 'in', s.net_amount,
         s.currency_code, s.provider, 'payment_verified', s.settled_at,
         jsonb_build_object('gross', s.gross_amount, 'fees', s.fees, 'provider_reference', s.provider_reference)
    from settlement s
   where s.net_amount > 0
     and (p_business is null or s.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'settlement' and s.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, category, counterparty, verification, occurred_at, detail)
  select s.business_id, 'payments', 'settlement', s.id, 'provider_fee', 'cash', 'out',
         s.fees - known.fees, s.currency_code, 'payment_charges', s.provider, 'payment_verified', s.settled_at,
         jsonb_build_object('reason', 'settlement fee beyond the fees on its payments')
    from settlement s
    cross join lateral (
      select coalesce(sum(coalesce(p.provider_fee, 0)), 0) as fees
        from settlement_line l join payment p on p.id = l.payment_id
       where l.settlement_id = s.id) known
   where s.fees - known.fees > 0
     and (p_business is null or s.business_id = p_business)
     and (p_source_type is null or (p_source_type = 'settlement' and s.id = p_source_id))
  on conflict (source_type, source_id, kind) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return jsonb_build_object('written', v_total);
end
$fn$;

-- One trigger function for money out. Never raises.
create or replace function financial_event_project_out()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  begin
    if tg_table_name = 'approval_request' then
      perform financial_events_sync_out(x.business_id, 'expense', x.id)
         from expense x where x.approval_id = new.id;
    else
      perform financial_events_sync_out(new.business_id, tg_table_name, new.id);
    end if;
  exception when others then
    insert into commerce_projection_error (origin_type, origin_id, business_id, error)
    values ('financial_event:' || tg_table_name, new.id, new.business_id, sqlerrm);
  end;
  return null;
end
$fn$;

-- At commit, so the approval link submit_expense adds after the insert is seen.
drop trigger if exists financial_event_from_expense on expense;
create constraint trigger financial_event_from_expense
  after insert on expense
  deferrable initially deferred
  for each row execute function financial_event_project_out();

drop trigger if exists financial_event_from_expense_approval on approval_request;
create trigger financial_event_from_expense_approval
  after update on approval_request
  for each row when (new.kind = 'expense' and new.status = 'approved' and old.status is distinct from new.status)
  execute function financial_event_project_out();

drop trigger if exists financial_event_from_till_expense on till_expense;
create trigger financial_event_from_till_expense
  after insert on till_expense
  for each row execute function financial_event_project_out();

-- At commit too: record_settlement writes the settlement before its lines,
-- and the fee beyond the payments' own can only be worked out with them.
drop trigger if exists financial_event_from_settlement on settlement;
create constraint trigger financial_event_from_settlement
  after insert on settlement
  deferrable initially deferred
  for each row execute function financial_event_project_out();

-- A provider fee arrives with, or after, the payment.
drop trigger if exists financial_event_fee_from_payment on payment;
create trigger financial_event_fee_from_payment
  after insert or update on payment
  for each row when (coalesce(new.provider_fee, 0) > 0)
  execute function financial_event_project_out();

-- ---------------------------------------------------------------------------
-- The reconciliation report, with money out (0100's checks unchanged).
-- ---------------------------------------------------------------------------
create or replace function financial_event_reconciliation(p_business uuid default null)
returns table (business_id uuid, check_name text, expected numeric, recorded numeric, missing int, extra int)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  checks as (
    select 'revenue earned' as c, t.business_id, t.id, t.total as amt, 'src' as side
      from commercial_transaction t where t.earned_at is not null and t.total > 0
    union all select 'revenue earned', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'revenue_earned'
    union all select 'revenue taken back', j.business_id, j.id, j.amount, 'src' from commerce_adjustment j
    union all select 'revenue taken back', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.basis = 'earned' and e.direction = 'out'
    union all select 'money received', p.business_id, p.id, p.amount, 'src' from payment p
      where p.reversal_of is null and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
    union all select 'money received', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'money_received'
    union all select 'refunds paid', p.business_id, p.id, p.amount, 'src' from payment p
      where p.reversal_of is not null and p.status = 'refunded'
    union all select 'refunds paid', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'refund_paid' and e.source_type = 'payment'
    union all select 'expenses', x.business_id, x.id, x.amount, 'src' from expense x
      left join approval_request a on a.id = x.approval_id
      where x.approval_id is null or a.status = 'approved'
    union all select 'expenses', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'expense'
    union all select 'till paid-outs', t.business_id, t.id, t.amount, 'src' from till_expense t
    union all select 'till paid-outs', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'till_expense'
    union all select 'provider fees', p.business_id, p.id, p.provider_fee, 'src' from payment p
      where coalesce(p.provider_fee, 0) > 0 and p.reversal_of is null
        and p.status in ('confirmed', 'reversed', 'refunded', 'disputed')
    union all select 'provider fees', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'provider_fee' and e.source_type = 'payment'
    union all select 'payouts', s.business_id, s.id, s.net_amount, 'src' from settlement s where s.net_amount > 0
    union all select 'payouts', e.business_id, e.source_id, e.amount, 'ev'
      from financial_event e where e.kind = 'settlement_received'
  ),
  per_id as (
    select c, business_id, id,
           sum(amt) filter (where side = 'src') as src, sum(amt) filter (where side = 'ev') as ev
      from checks
     where p_business is null or business_id = p_business
     group by 1, 2, 3
  )
  select business_id, c, coalesce(sum(src), 0), coalesce(sum(ev), 0),
         count(*) filter (where ev is null)::int, count(*) filter (where src is null)::int
    from per_id
   group by business_id, c
   order by business_id, c
$fn$;

revoke all on function financial_events_sync_out(uuid, text, uuid) from public, anon, authenticated;
revoke all on function financial_category_for(uuid, text) from public, anon, authenticated;
revoke all on function add_financial_category(jsonb) from public, anon, authenticated;
grant execute on function financial_events_sync_out(uuid, text, uuid) to service_role;
grant execute on function financial_category_for(uuid, text) to service_role;
grant execute on function add_financial_category(jsonb) to service_role;

-- Backfill: every expense, paid-out, fee and payout so far.
select financial_events_sync_out(null, null, null);
