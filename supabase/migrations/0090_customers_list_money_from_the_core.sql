-- ---------------------------------------------------------------------------
-- 0090  Phase 2, step 2d.5: the customers list takes its money from the core
--
-- business_customers() worked out each customer's "spent" (confirmed
-- payments, refunds not subtracted) and "owed" (the full total of every open
-- invoice, payments and credits ignored) from the product tables. Since step
-- 2d.4 the screen has shown the core's figures instead, by overwriting those
-- two columns in the app. This makes the function itself return the core's
-- figures, from commerce_customer_money() (0087), and the app stops reading
-- anything else (lib/reporting, app/customers).
--
-- Same name, same columns, same order, so it is safe to run before or after
-- the deploy that carries the new app code: the live screen already shows
-- these figures. Order counts, sale counts, booking counts, document counts
-- and last seen are activity, not money, and are unchanged.
--
-- Generated from the 0066 definition with two counted edits.
--
-- Tables read: customer, shop_order, sale, service_booking, document (counts
-- only), and through commerce_customer_money(): commercial_transaction,
-- obligation_balance, commerce_adjustment.
-- ---------------------------------------------------------------------------

create or replace function business_customers(p_business uuid, p_query text default null)
returns table (
  id uuid,
  display_name text,
  phone_e164 text,
  email text,
  created_via text,
  marketing_consent boolean,
  orders int,
  sales int,
  bookings int,
  documents int,
  spent numeric,
  owed numeric,
  last_seen timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select
    c.id, c.display_name, c.phone_e164, c.email, c.created_via,
    c.marketing_consent,
    coalesce(o.n, 0)::int, coalesce(s.n, 0)::int,
    coalesce(b.n, 0)::int, coalesce(d.n, 0)::int,
    -- What they have paid, less refunds, and what they still owe on what
    -- they committed to, from the commerce core (0090; 0087 rules).
    coalesce(money.spent, 0),
    coalesce(money.owed, 0),
    greatest(
      coalesce(o.last_at, 'epoch'::timestamptz),
      coalesce(s.last_at, 'epoch'::timestamptz),
      coalesce(b.last_at, 'epoch'::timestamptz),
      coalesce(d.last_at, 'epoch'::timestamptz)
    )
  from customer c
  left join lateral (select count(*) n, max(placed_at) last_at from shop_order where customer_id = c.id) o on true
  left join lateral (select count(*) n, max(occurred_at) last_at from sale where customer_id = c.id) s on true
  left join lateral (select count(*) n, max(created_at) last_at from service_booking where customer_id = c.id) b on true
  left join lateral (select count(*) n, max(created_at) last_at from document where customer_id = c.id and number is not null) d on true
  left join commerce_customer_money(p_business) money on money.customer_id = c.id
  where c.business_id = p_business
    and (
      p_query is null or p_query = ''
      or c.display_name ilike '%' || p_query || '%'
      or c.phone_e164 ilike '%' || p_query || '%'
      or c.email ilike '%' || p_query || '%'
    )
  order by greatest(
    coalesce(o.last_at, 'epoch'::timestamptz),
    coalesce(s.last_at, 'epoch'::timestamptz),
    coalesce(b.last_at, 'epoch'::timestamptz),
    coalesce(d.last_at, 'epoch'::timestamptz)
  ) desc nulls last,
  c.display_name;
$fn$;

revoke all on function business_customers(uuid, text) from public, anon, authenticated;
grant execute on function business_customers(uuid, text) to service_role;
