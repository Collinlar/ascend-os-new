-- ---------------------------------------------------------------------------
-- 0113  Risk and Trust, step R3: signals
--
-- RISK_AND_TRUST_PLAN.md, decision 3 approved 18 Nov 2026: signals never
-- act on their own. They are read by people on the Risk desk (R6), who open
-- a case if one is worth it. Spec 09 section 4.
--
-- risk_signals() returns one row per business per signal that fires, with
-- the risk domain it points to (so a case opens in the right place), a
-- severity, the figures in words, and the figures themselves for the
-- case's evidence snapshot. Reads only; writes nothing.
--
--   signal              fires when (all windows end now)                       domain           severity
--   refund_rate         refunds paid are 10% or more of money received in 30   refund_abuse     medium; high at 25%
--                       days, and there are at least 3
--   reversal_rate       10% or more of till sales reversed in 30 days, and at  refund_abuse     medium; high at 25%
--                       least 3
--   till_gaps           a till reported sales it could not account for, or a   cash_discipline  medium; high at 3
--                       receipt sequence that went backwards, in 30 days
--   shift_differences   2 or more closed shifts in 30 days that did not count  cash_discipline  medium; high above GHS 500
--                       out and have no explanation                                              in all
--   volume_spike        today's sales count is more than 3 times the daily     payment_fraud    medium
--                       average of the 28 days before, and at least 20
--   large_sale          a sale in the last 7 days at 5 times or more the       payment_fraud    medium; high at 10 times
--                       business's median over 90 days (at least 20 sales of
--                       history), and over GHS 500
--   new_and_heavy       a business under 30 days old with GHS 20,000 or more   fake_merchant    medium
--                       earned, or 200 or more sales
--   likely_duplicate    another business has the same name (letters and        fake_merchant    low
--                       digits only, any case) and a different owner
--   messaging           any messaging flag (0110)                              messaging_abuse  medium; high for spam
--                                                                                               complaints
--
-- Thresholds are first guesses on thin data, stated here so they can be
-- tuned in one place as real activity arrives.
--
-- Tables and functions read: financial_event, commercial_transaction,
-- event_outbox (event_type), pos_shift (closed_at, cash_difference,
-- difference_note), business (name, created_at), business_membership,
-- role (key), messaging_flags(), risk_state().
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
  )
  select r.business_id, b.name, risk_state(r.business_id), r.signal, r.domain, r.severity, r.detail, r.figures
    from raw r join business b on b.id = r.business_id
   order by case r.severity when 'high' then 0 when 'medium' then 1 else 2 end, b.name, r.signal
$fn$;

revoke all on function risk_signals() from public, anon, authenticated;
grant execute on function risk_signals() to service_role;
