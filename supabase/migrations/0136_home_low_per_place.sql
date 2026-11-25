-- ---------------------------------------------------------------------------
-- 0136  Home's low stock figure, place by place
--
-- Home counted a product as low when the business's total on hand was at or
-- under the product's mark (0116). Since 0135 a place may have its own
-- mark, and Inventory judges low place by place. Home now does the same: a
-- product is low when it is at or under the mark at any active place that
-- holds it or has its own mark, the place's own mark else the product's. A
-- business with one place sees the same figure as before; so does one with
-- several places and no place marks, except that a product short at one
-- place and plentiful at another now counts, which is the point.
--
-- commerce_home_figures as in 0116, with one counted substitution (the stock
-- part). Tables and columns read, beyond 0116: location (business_id,
-- active), place_low_mark (0135: location_id, item_id, low_at).
-- ---------------------------------------------------------------------------

-- commerce_home_figures as in 0116, with one counted substitution.
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
  -- Low is judged place by place (0136): a product is low when, at any
  -- active place that holds it or has its own mark (0135), what is on hand
  -- there is at or under that place's mark, else the product's. With one
  -- place this is the same figure as before.
  place_count as (
    select count(*) as n from location where business_id = p_business and active
  ),
  low_items as (
    select distinct ci.id
      from catalogue_item ci
      cross join location l
      left join place_low_mark pm on pm.location_id = l.id and pm.item_id = ci.id
      left join (select location_id, item_id, sum(quantity_on_hand) as on_hand
                   from stock_balance where business_id = p_business group by location_id, item_id) pb
        on pb.location_id = l.id and pb.item_id = ci.id
     where ci.business_id = p_business and ci.active and ci.track_stock and ci.kind = 'product'
       and l.business_id = p_business and l.active
       and coalesce(pm.low_at, ci.low_stock_threshold) is not null
       and coalesce(pb.on_hand, 0) <= coalesce(pm.low_at, ci.low_stock_threshold)
       and (pb.item_id is not null or pm.item_id is not null or (select n from place_count) = 1)
  ),
  stock as (
    select count(*)::int as tracked,
           count(*) filter (where ci.id in (select id from low_items))::int as low,
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
