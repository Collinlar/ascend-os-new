-- ---------------------------------------------------------------------------
-- 0065  A price book, so something can actually be sold
--
-- price_book_entry has existed since the commercial layer was designed and
-- has never held a row. It has no readers and no writers anywhere: not in
-- the app, not in SQL. Every product set can be used and none of them can
-- be charged for.
--
-- That is the largest gap in the platform. Discover promotion, capacity
-- passes, Assurance, the Team Operations Pass named in the Office PRD, the
-- setup fee, hardware: all of it is designed, none of it is priced.
--
-- MON-015 says the country price book is maintained separately from core
-- product logic, which is what this table already is. What was missing was
-- anything in it, and a way to buy from it.
--
-- Every figure here is from the PRDs and is a commercial hypothesis, not an
-- approved price. They are seeded so the machinery can be exercised and so
-- a merchant sees a real number rather than a blank; the commercial team
-- changes them with an update, not a deploy.
-- ---------------------------------------------------------------------------

insert into price_book_entry (country_code, sku, name, kind, amount, currency_code, duration_days, capacity)
values
  -- Setup and implementation (Office PRD 31, GHS 500 to 1,500 by size).
  ('GH', 'setup_starter',        'Getting set up, one place',          'one_time',      500,  'GHS', null, '{"locations": 1}'),
  ('GH', 'setup_multi',          'Getting set up, several places',     'one_time',     1200,  'GHS', null, '{"locations": 5}'),

  -- Team Operations Pass, the Full Office tier, priced by team size.
  ('GH', 'team_ops_5',           'Team pass, up to 5 people',          'duration_pass', 600,  'GHS', 365,  '{"staff": 5}'),
  ('GH', 'team_ops_15',          'Team pass, 6 to 15 people',          'duration_pass', 1200, 'GHS', 365,  '{"staff": 15}'),
  ('GH', 'team_ops_30',          'Team pass, 16 to 30 people',         'duration_pass', 2400, 'GHS', 365,  '{"staff": 30}'),

  -- Catalogue capacity, bought once rather than rented (MON-007).
  ('GH', 'catalogue_50',         'Room for 50 products',               'capacity',      120,  'GHS', null, '{"products": 50}'),
  ('GH', 'catalogue_250',        'Room for 250 products',              'capacity',      400,  'GHS', null, '{"products": 250}'),

  -- Being found. DSC-001 keeps organic listing free; this is placement.
  ('GH', 'boost_product_7d',     'Promote one thing for a week',       'promotion',      35,  'GHS', 7,    null),
  ('GH', 'boost_shop_30d',       'Promote your shop for a month',      'promotion',     120,  'GHS', 30,   null),

  -- Verification and readiness work, which pays for the checking and never
  -- for a better score (MON-013).
  ('GH', 'assurance_annual',     'Assurance, checked once a year',     'verification',  900,  'GHS', 365,  null),

  -- Hardware, sold at cost plus handling rather than as a subscription.
  ('GH', 'printer_58mm',         'Receipt printer, 58mm',              'hardware',      450,  'GHS', null, null)
on conflict (country_code, sku) do update
  set name = excluded.name,
      amount = excluded.amount,
      kind = excluded.kind,
      duration_days = excluded.duration_days,
      capacity = excluded.capacity;

-- ---------------------------------------------------------------------------
-- What a merchant is offered, in their country's currency.
--
-- MON-005: every charge shows what it buys, for how long, and how much,
-- before payment. This is the query behind that screen.
-- ---------------------------------------------------------------------------
create or replace function price_book(p_business uuid)
returns table (
  sku text,
  name text,
  kind text,
  amount numeric,
  currency_code text,
  duration_days int,
  capacity jsonb,
  already_owned boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select pbe.sku, pbe.name, pbe.kind, pbe.amount, pbe.currency_code,
         pbe.duration_days, pbe.capacity,
         -- A pass that is still running should not be sold again at full
         -- price without the merchant being told they already hold it.
         exists (
           select 1 from purchase pu
           where pu.business_id = p_business
             and pu.price_book_entry_id = pbe.id
             and (pbe.duration_days is null
                  or pu.created_at > now() - (pbe.duration_days || ' days')::interval)
         )
  from price_book_entry pbe
  join business b on b.id = p_business
  where pbe.country_code = b.country_code
    and pbe.active
    and (pbe.valid_from is null or pbe.valid_from <= current_date)
    and (pbe.valid_to is null or pbe.valid_to >= current_date)
  order by
    case pbe.kind
      when 'duration_pass' then 0
      when 'capacity' then 1
      when 'promotion' then 2
      when 'verification' then 3
      when 'one_time' then 4
      else 5
    end,
    pbe.amount;
$fn$;

-- ---------------------------------------------------------------------------
-- Buying something.
--
-- The purchase is recorded first and the entitlement follows from it, so
-- there is always a charge behind every granted capability and a merchant
-- can be shown what they paid for (MON-020).
--
-- Payment itself is deliberately outside this function. Ascend Balance and
-- Paystack both settle before it is called; this records what the money
-- bought. Charging and granting in one step would mean a failed grant
-- silently kept the money.
-- ---------------------------------------------------------------------------
create or replace function record_purchase(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_sku text := p->>'sku';
  v_entry price_book_entry%rowtype;
  v_purchase uuid;
  v_set text := nullif(p->>'product_set_key', '');
  v_expires timestamptz;
begin
  select pbe.* into v_entry
  from price_book_entry pbe
  join business b on b.id = v_business
  where pbe.sku = v_sku and pbe.country_code = b.country_code and pbe.active;

  if not found then
    raise exception 'not_in_the_price_book: %', v_sku;
  end if;

  insert into purchase (
    business_id, price_book_entry_id, description, amount, currency_code,
    payment_id, sponsor_id
  ) values (
    v_business, v_entry.id, v_entry.name, v_entry.amount, v_entry.currency_code,
    nullif(p->>'payment_id', '')::uuid,
    nullif(p->>'sponsor_id', '')::uuid
  )
  returning id into v_purchase;

  -- A duration pass grants the product set for as long as it runs. A
  -- capacity purchase or a promotion is not an entitlement to a set, so
  -- neither grants one.
  if v_entry.kind = 'duration_pass' and v_set is not null then
    v_expires := now() + (coalesce(v_entry.duration_days, 365) || ' days')::interval;

    -- entitlement_source is 'purchase' and 'sponsorship', not the past
    -- tense. 0008 added 'free_start' to the same enum.
    insert into entitlement (
      business_id, product_set_key, source, purchase_id, status,
      capacity, grant_reason, expires_at
    ) values (
      v_business, v_set,
      (case when nullif(p->>'sponsor_id', '') is not null
              then 'sponsorship' else 'purchase' end)::entitlement_source,
      v_purchase,
      'active',
      -- The band the pass was sold at travels with the entitlement, so a
      -- team of twenty on a pass for five is answerable (ENT-010).
      v_entry.capacity,
      'bought ' || v_entry.name,
      v_expires
    );
  end if;

  return jsonb_build_object(
    'purchase_id', v_purchase,
    'sku', v_entry.sku,
    'amount', v_entry.amount,
    'currency_code', v_entry.currency_code,
    'expires_at', v_expires
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- What a merchant has bought, what they still hold, and when it runs out.
-- One place, which is what MON-020 asks for.
-- ---------------------------------------------------------------------------
create or replace function business_purchases(p_business uuid)
returns table (
  purchase_id uuid,
  description text,
  amount numeric,
  currency_code text,
  sku text,
  kind text,
  bought_at timestamptz,
  expires_at timestamptz,
  still_running boolean,
  sponsored boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select pu.id as purchase_id,
         pu.description,
         pu.amount,
         pu.currency_code,
         pbe.sku,
         pbe.kind,
         pu.created_at as bought_at,
         case when pbe.duration_days is null then null
              else pu.created_at + (pbe.duration_days || ' days')::interval
         end as expires_at,
         case when pbe.duration_days is null then true
              else pu.created_at + (pbe.duration_days || ' days')::interval > now()
         end as still_running,
         pu.sponsor_id is not null as sponsored
  from purchase pu
  left join price_book_entry pbe on pbe.id = pu.price_book_entry_id
  where pu.business_id = p_business
  order by pu.created_at desc;
$fn$;

revoke all on function price_book(uuid) from public, anon, authenticated;
revoke all on function record_purchase(jsonb) from public, anon, authenticated;
revoke all on function business_purchases(uuid) from public, anon, authenticated;
grant execute on function price_book(uuid) to service_role;
grant execute on function record_purchase(jsonb) to service_role;
grant execute on function business_purchases(uuid) to service_role;
