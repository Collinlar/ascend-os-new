-- ---------------------------------------------------------------------------
-- 0116  Home figures for the v3 design (DESIGN_V3_PLAN.md, step D3)
--
-- The v3 Home shows sales over the last 14 days, the top products and how
-- customers paid, the latest sales, and stock and customer counts. All of it
-- is read from what Ascend already records; nothing here writes.
--
-- A day's sales follow exactly the rules of commerce_dashboard_figures
-- (0105), so the last bar of the chart always equals "Sales today":
-- transactions earned that day (not draft, cancelled or reversed), less
-- refunds, credits and returns given that day, less reversals that day of
-- sales earned earlier.
--
-- commerce_home_figures(business, day, days) returns one jsonb:
--   days          [{day, sales, count}] oldest first, `days` long, ending on `day`
--   top_products  up to 3 [{name, amount, quantity}] over the same window
--   payment_mix   [{method, amount}] confirmed payments over the window, by how
--                 the customer paid. Before refunds: money handed back is
--                 recorded as an adjustment, not against a method, so the
--                 screen says "before refunds".
--   recent        up to 5 latest sales [{at, channel, items, total, status, method, verified}]
--   stock         {tracked, low, out}: items with tracking on, at or under
--                 their low-stock level, and at or under zero
--   customers     {total, new_7d}
--
-- Tables and columns read: commercial_transaction (business_id, earned_at,
-- status, total, channel, id), commerce_adjustment (business_id, kind,
-- amount, occurred_at, transaction_id), transaction_line (transaction_id,
-- description, quantity, line_total, item_id), catalogue_item (id, name,
-- track_stock, low_stock_threshold, active, kind), stock_balance (view:
-- business_id, item_id, quantity_on_hand), payment (business_id, method,
-- status, verification, amount, occurred_at, reversal_of), payment_allocation
-- (payment_id, obligation_id), payment_obligation (id, transaction_id),
-- customer (business_id, created_at).
-- ---------------------------------------------------------------------------

create or replace function commerce_home_figures(p_business uuid, p_day date, p_days int default 14)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  window_days as (
    select (p_day - g)::date as d
      from generate_series(0, greatest(least(p_days, 90), 1) - 1) g
  ),
  per_day as (
    select w.d,
           round(
             coalesce((select sum(t.total) from commercial_transaction t
                        where t.business_id = p_business
                          and t.earned_at >= w.d::timestamptz and t.earned_at < (w.d + 1)::timestamptz
                          and t.status not in ('draft', 'cancelled', 'reversed')), 0)
           - coalesce((select sum(j.amount) from commerce_adjustment j
                        where j.business_id = p_business
                          and j.kind in ('refund', 'credit', 'return')
                          and j.occurred_at >= w.d::timestamptz and j.occurred_at < (w.d + 1)::timestamptz), 0)
           - coalesce((select sum(j.amount) from commerce_adjustment j
                        join commercial_transaction t on t.id = j.transaction_id
                        where j.business_id = p_business
                          and j.kind = 'reversal'
                          and j.occurred_at >= w.d::timestamptz and j.occurred_at < (w.d + 1)::timestamptz
                          and t.earned_at < w.d::timestamptz), 0), 2) as sales,
           (select count(*) from commercial_transaction t
             where t.business_id = p_business
               and t.earned_at >= w.d::timestamptz and t.earned_at < (w.d + 1)::timestamptz
               and t.status not in ('draft', 'cancelled', 'reversed'))::int as n
      from window_days w
  ),
  earned_window as (
    select t.id, t.earned_at, t.channel, t.total, t.status
      from commercial_transaction t
     where t.business_id = p_business
       and t.earned_at >= (p_day - (greatest(least(p_days, 90), 1) - 1))::timestamptz
       and t.earned_at < (p_day + 1)::timestamptz
       and t.status not in ('draft', 'cancelled', 'reversed')
  ),
  top as (
    select coalesce(ci.name, nullif(btrim(l.description), ''), 'Item') as name,
           round(sum(l.line_total), 2) as amount,
           round(sum(l.quantity), 3) as quantity
      from transaction_line l
      join earned_window e on e.id = l.transaction_id
      left join catalogue_item ci on ci.id = l.item_id
     group by 1
     order by 2 desc, 1
     limit 3
  ),
  mix as (
    select p.method::text as method, round(sum(p.amount), 2) as amount
      from payment p
     where p.business_id = p_business
       and p.status = 'confirmed'
       and p.reversal_of is null
       and p.occurred_at >= (p_day - (greatest(least(p_days, 90), 1) - 1))::timestamptz
       and p.occurred_at < (p_day + 1)::timestamptz
     group by 1
     order by 2 desc
  ),
  latest as (
    select t.id, t.earned_at, t.channel, t.total, t.status
      from commercial_transaction t
     where t.business_id = p_business
       and t.earned_at is not null
       and t.status not in ('draft', 'cancelled')
     order by t.earned_at desc
     limit 5
  ),
  recent as (
    select r.earned_at, r.channel, r.total, r.status::text as status,
           (select string_agg(
                     case when l.quantity = 1 then coalesce(ci.name, l.description)
                          else coalesce(ci.name, l.description) || ' x ' || trim(to_char(l.quantity, 'FM999990.###')) end,
                     ', ' order by l.line_number)
              from transaction_line l
              left join catalogue_item ci on ci.id = l.item_id
             where l.transaction_id = r.id) as items,
           (select p.method::text from payment_allocation a
              join payment_obligation o on o.id = a.obligation_id
              join payment p on p.id = a.payment_id
             where o.transaction_id = r.id and p.status = 'confirmed'
             order by p.amount desc limit 1) as method,
           (select bool_or(p.verification::text = 'provider_confirmed') from payment_allocation a
              join payment_obligation o on o.id = a.obligation_id
              join payment p on p.id = a.payment_id
             where o.transaction_id = r.id and p.status = 'confirmed') as verified
      from latest r
  ),
  stock as (
    select count(*)::int as tracked,
           count(*) filter (where ci.low_stock_threshold is not null
                              and coalesce(b.on_hand, 0) <= ci.low_stock_threshold)::int as low,
           count(*) filter (where coalesce(b.on_hand, 0) <= 0)::int as out
      from catalogue_item ci
      left join (select item_id, sum(quantity_on_hand) as on_hand
                   from stock_balance where business_id = p_business group by item_id) b
        on b.item_id = ci.id
     where ci.business_id = p_business and ci.active and ci.track_stock and ci.kind = 'product'
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'sales', sales, 'count', n) order by d) from per_day), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'amount', amount, 'quantity', quantity) order by amount desc, name) from top), '[]'::jsonb),
    'payment_mix', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount) order by amount desc) from mix), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('at', earned_at, 'channel', channel, 'items', items, 'total', total,
                                                             'status', status, 'method', method, 'verified', coalesce(verified, false))
                                          order by earned_at desc) from recent), '[]'::jsonb),
    'stock', (select jsonb_build_object('tracked', tracked, 'low', low, 'out', out) from stock),
    'customers', jsonb_build_object(
      'total', (select count(*) from customer c where c.business_id = p_business),
      'new_7d', (select count(*) from customer c where c.business_id = p_business
                   and c.created_at >= (p_day - 6)::timestamptz and c.created_at < (p_day + 1)::timestamptz))
  )
$fn$;

revoke all on function commerce_home_figures(uuid, date, int) from public, anon, authenticated;
grant execute on function commerce_home_figures(uuid, date, int) to service_role;
