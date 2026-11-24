-- ---------------------------------------------------------------------------
-- 0130  Inventory Core I5: stock as a risk signal
--
-- INVENTORY_CORE_PLAN.md, step I5 and decision 7 (approved 21 Nov 2026).
-- Two more signals for the Risk desk, in the cash discipline area. Like
-- every signal (0113), they never act on their own: people on the Risk desk
-- read them and open a case if one is worth it.
--
--   signal            fires when (windows end now)                          severity
--   stock_write_offs  stock written off in 30 days (damage, losses, counts  medium; high above 15%
--                     that came up short) is worth more than 5% of the
--                     stock on the shelves, and at least GHS 100
--   count_gaps        the last 3 posted stock counts all found stock        medium; high above GHS 500
--                     missing                                               in all
--
-- Values use the cost on the movement, else the item's average cost (0125),
-- else its selling price. Thresholds are first guesses, stated here so they
-- can be tuned in one place.
--
-- The other half of I5, counts as evidence for the Sustainability Score,
-- needs no migration: lib/domains/evidence.ts turns inventory.count.posted
-- (0129) into operational evidence (rule version 2026.11-3).
--
-- risk_signals as in 0114 (latest definition), generated from it with two
-- counted substitutions: four new parts of the query, and two new signals.
--
-- Tables and columns read, beyond 0114: stock_movement (business_id,
-- item_id, kind, quantity, unit_cost, occurred_at), catalogue_item
-- (average_cost, base_price), stock_count (business_id, status,
-- write_down_value, decided_at).
-- ---------------------------------------------------------------------------

create or replace function risk_signals()
returns table (business_id uuid, business_name text, risk_state text, signal text, domain text,
               severity text, detail text, figures jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with
  money as (
    select e.business_id,
           coalesce(sum(e.amount) filter (where e.kind = 'money_received'), 0) as received,
           coalesce(sum(e.amount) filter (where e.kind = 'refund_paid'), 0) as refunded,
           count(*) filter (where e.kind = 'refund_paid') as refunds
      from financial_event e
     where e.occurred_at >= now() - interval '30 days'
     group by e.business_id
  ),
  till as (
    select t.business_id,
           count(*) filter (where t.origin_type = 'sale') as sales,
           count(*) filter (where t.origin_type = 'sale' and t.status = 'reversed') as reversed
      from commercial_transaction t
     where t.occurred_at >= now() - interval '30 days'
     group by t.business_id
  ),
  gaps as (
    select o.business_id, count(*) as n,
           count(*) filter (where o.event_type = 'pos.sales.unaccounted') as unaccounted,
           count(*) filter (where o.event_type = 'pos.sequence.regressed') as regressed
      from event_outbox o
     where o.event_type in ('pos.sales.unaccounted', 'pos.sequence.regressed')
       and o.occurred_at >= now() - interval '30 days'
     group by o.business_id
  ),
  shifts as (
    select s.business_id, count(*) as n, sum(abs(s.cash_difference)) as total
      from pos_shift s
     where s.closed_at >= now() - interval '30 days'
       and coalesce(s.cash_difference, 0) <> 0
       and nullif(btrim(coalesce(s.difference_note, '')), '') is null
     group by s.business_id
  ),
  daily as (
    select t.business_id,
           count(*) filter (where t.occurred_at >= date_trunc('day', now())) as today,
           count(*) filter (where t.occurred_at >= date_trunc('day', now()) - interval '28 days'
                             and t.occurred_at < date_trunc('day', now())) / 28.0 as avg28
      from commercial_transaction t
     where t.occurred_at >= date_trunc('day', now()) - interval '28 days'
       and t.status not in ('draft', 'cancelled')
     group by t.business_id
  ),
  sizes as (
    select t.business_id,
           (percentile_cont(0.5) within group (order by t.total))::numeric as median,
           count(*) as history,
           max(t.total) filter (where t.occurred_at >= now() - interval '7 days') as biggest
      from commercial_transaction t
     where t.occurred_at >= now() - interval '90 days'
       and t.status not in ('draft', 'cancelled') and t.total > 0
     group by t.business_id
  ),
  young as (
    select b.id as business_id, b.created_at,
           (select coalesce(sum(e.amount), 0) from financial_event e
             where e.business_id = b.id and e.kind = 'revenue_earned') as earned,
           (select count(*) from commercial_transaction t
             where t.business_id = b.id and t.status not in ('draft', 'cancelled')) as sales
      from business b
     where b.created_at >= now() - interval '30 days'
  ),
  owners as (
    select m.business_id, min(m.person_id::text) as owner
      from business_membership m join role r on r.id = m.role_id
     where r.key = 'owner'
     group by m.business_id
  ),
  names as (
    select b.id as business_id, lower(regexp_replace(b.name, '[^A-Za-z0-9]', '', 'g')) as norm, o.owner
      from business b left join owners o on o.business_id = b.id
  ),
  dupes as (
    select n1.business_id, count(*) as others
      from names n1 join names n2
        on n2.norm = n1.norm and n2.business_id <> n1.business_id
       and n2.owner is distinct from n1.owner
     where n1.norm <> ''
     group by n1.business_id
  ),
  reports as (
    select c.business_id, count(*) as n,
           count(distinct c.reporter_key) as people,
           mode() within group (order by customer_report_domain(c.reason)) as domain,
           string_agg(distinct customer_report_label(c.reason), ', ') as reasons
      from customer_report c
     where c.status = 'open' and c.created_at >= now() - interval '30 days'
     group by c.business_id
  ),
  -- Stock written off in 30 days (damage, losses, counts that came up
  -- short), valued at the cost on the movement, else the item's average
  -- cost, else its selling price; against what is on the shelves now at the
  -- same values (Inventory Core I5).
  stock_value as (
    select b.business_id, sum(b.on_hand * coalesce(ci.average_cost, ci.base_price, 0)) as value
      from (select business_id, item_id, sum(quantity) as on_hand
              from stock_movement where kind not in ('reservation', 'reservation_release')
             group by business_id, item_id) b
      join catalogue_item ci on ci.id = b.item_id
     where b.on_hand > 0
     group by b.business_id
  ),
  written_off as (
    select m.business_id, count(*) as n,
           sum(-m.quantity * coalesce(m.unit_cost, ci.average_cost, ci.base_price, 0)) as value
      from stock_movement m join catalogue_item ci on ci.id = m.item_id
     where m.occurred_at >= now() - interval '30 days'
       and m.quantity < 0
       and m.kind in ('damage_loss', 'count_correction')
     group by m.business_id
  ),
  -- The last three posted counts at each business, newest first.
  recent_counts as (
    select c.business_id, c.write_down_value,
           row_number() over (partition by c.business_id order by c.decided_at desc) as k
      from stock_count c
     where c.status = 'posted'
  ),
  count_gaps as (
    select r.business_id, sum(r.write_down_value) as short
      from recent_counts r
     where r.k <= 3
     group by r.business_id
    having count(*) = 3 and bool_and(r.write_down_value > 0)
  ),
  raw as (
    select m.business_id, 'refund_rate' as signal, 'refund_abuse' as domain,
           case when m.refunded / m.received >= 0.25 then 'high' else 'medium' end as severity,
           m.refunds || ' refunds, GHS ' || round(m.refunded, 2) || ' of GHS ' || round(m.received, 2)
             || ' received in 30 days (' || round(100 * m.refunded / m.received) || '%)' as detail,
           jsonb_build_object('refunds', m.refunds, 'refunded', m.refunded, 'received', m.received) as figures
      from money m
     where m.received > 0 and m.refunds >= 3 and m.refunded / m.received >= 0.10
    union all
    select t.business_id, 'reversal_rate', 'refund_abuse',
           case when t.reversed::numeric / t.sales >= 0.25 then 'high' else 'medium' end,
           t.reversed || ' of ' || t.sales || ' till sales reversed in 30 days ('
             || round(100.0 * t.reversed / t.sales) || '%)',
           jsonb_build_object('reversed', t.reversed, 'sales', t.sales)
      from till t
     where t.sales > 0 and t.reversed >= 3 and t.reversed::numeric / t.sales >= 0.10
    union all
    select g.business_id, 'till_gaps', 'cash_discipline',
           case when g.n >= 3 then 'high' else 'medium' end,
           g.n || ' till warning' || case when g.n = 1 then '' else 's' end || ' in 30 days ('
             || g.unaccounted || ' reporting sales not accounted for, ' || g.regressed || ' reporting receipts out of order)',
           jsonb_build_object('unaccounted', g.unaccounted, 'regressed', g.regressed)
      from gaps g
    union all
    select s.business_id, 'shift_differences', 'cash_discipline',
           case when s.total > 500 then 'high' else 'medium' end,
           s.n || ' shifts in 30 days that did not count out, with no explanation, GHS ' || round(s.total, 2) || ' in all',
           jsonb_build_object('shifts', s.n, 'total_difference', s.total)
      from shifts s
     where s.n >= 2
    union all
    select d.business_id, 'volume_spike', 'payment_fraud', 'medium',
           d.today || ' sales today against a daily average of ' || round(d.avg28, 1) || ' over the 28 days before',
           jsonb_build_object('today', d.today, 'daily_average', round(d.avg28, 2))
      from daily d
     where d.today >= 20 and d.today > 3 * d.avg28
    union all
    select z.business_id, 'large_sale', 'payment_fraud',
           case when z.biggest >= 10 * z.median then 'high' else 'medium' end,
           'A sale of GHS ' || round(z.biggest, 2) || ' this week, ' || round(z.biggest / z.median, 1)
             || ' times the usual GHS ' || round(z.median::numeric, 2),
           jsonb_build_object('biggest', z.biggest, 'median', round(z.median::numeric, 2), 'history', z.history)
      from sizes z
     where z.history >= 20 and z.median > 0 and z.biggest > 500 and z.biggest >= 5 * z.median
    union all
    select y.business_id, 'new_and_heavy', 'fake_merchant', 'medium',
           case when current_date = y.created_at::date then 'Opened today'
                when current_date - y.created_at::date = 1 then 'Opened yesterday'
                else 'Opened ' || (current_date - y.created_at::date) || ' days ago' end
             || ', with GHS ' || round(y.earned, 2) || ' earned and ' || y.sales
             || case when y.sales = 1 then ' sale' else ' sales' end || ' already',
           jsonb_build_object('age_days', current_date - y.created_at::date, 'earned', y.earned, 'sales', y.sales)
      from young y
     where y.earned >= 20000 or y.sales >= 200
    union all
    select d.business_id, 'likely_duplicate', 'fake_merchant', 'low',
           d.others || ' other business' || case when d.others = 1 then '' else 'es' end
             || ' with the same name and a different owner',
           jsonb_build_object('others', d.others)
      from dupes d
    union all
    select f.business_id, 'messaging_' || f.flag, 'messaging_abuse',
           case when f.flag = 'complaints' then 'high' else 'medium' end,
           f.detail, jsonb_build_object('flag', f.flag)
      from messaging_flags() f
    union all
    -- Heavy write-offs (I5): more than 5% of stock value in 30 days, and at
    -- least GHS 100, so a dropped tin at a small shop is not a signal.
    select w.business_id, 'stock_write_offs', 'cash_discipline',
           case when w.value > 0.15 * coalesce(v.value, 0) then 'high' else 'medium' end,
           'GHS ' || round(w.value, 2) || ' of stock written off in 30 days'
             || case when coalesce(v.value, 0) > 0
                     then ', ' || round(100 * w.value / v.value) || '% of the GHS ' || round(v.value, 2) || ' on the shelves'
                     else ', with nothing left on the shelves' end,
           jsonb_build_object('written_off', round(w.value, 2), 'stock_value', round(coalesce(v.value, 0), 2), 'movements', w.n)
      from written_off w left join stock_value v on v.business_id = w.business_id
     where w.value >= 100 and w.value > 0.05 * coalesce(v.value, 0)
    union all
    -- Three counts in a row came up short (I5).
    select g.business_id, 'count_gaps', 'cash_discipline',
           case when g.short > 500 then 'high' else 'medium' end,
           'The last 3 stock counts all found stock missing, GHS ' || round(g.short, 2) || ' in all',
           jsonb_build_object('counts', 3, 'short', round(g.short, 2))
      from count_gaps g
    union all
    -- Customer reports (0114): one person is low, two are medium, three or more are high.
    select c.business_id, 'customer_reports', c.domain,
           case when c.people >= 3 then 'high' when c.people = 2 then 'medium' else 'low' end,
           c.n || ' open customer report' || case when c.n = 1 then '' else 's' end || ' in 30 days from '
             || c.people || case when c.people = 1 then ' person' else ' people' end || ' (' || c.reasons || ')',
           jsonb_build_object('reports', c.n, 'people', c.people)
      from reports c
  )
  select r.business_id, b.name, risk_state(r.business_id), r.signal, r.domain, r.severity, r.detail, r.figures
    from raw r join business b on b.id = r.business_id
   order by case r.severity when 'high' then 0 when 'medium' then 1 else 2 end, b.name, r.signal
$fn$;
