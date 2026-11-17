-- ---------------------------------------------------------------------------
-- 0095  Phase 5, step 5c: commerce evidence from the core, staged
--
-- PHASE_5_EVIDENCE_PLAN.md 3.1, approved 17 Nov 2026. Decided by Collins on
-- 17 Nov 2026: the new commerce evidence is STAGED, not counted. Evidence
-- feeds the score automatically, so writing it straight into
-- evidence_record would move scores before Collins has read the before and
-- after list (decision 5). Step 5f switches everything over at once.
--
-- evidence_staging   the evidence the switch-over will write: core-derived
--                    commerce evidence, and the withdrawal of the
--                    product-event evidence it replaces. Never read by the
--                    score.
--
-- stage_commerce_evidence(business or null)
--   Rebuilds the staging for one business, or all. Deterministic: running it
--   again gives the same rows.
--
--   One record per earned transaction (commercial_transaction.earned_at):
--     till sale             financial_activity  earned_sale        1 / 1 / 3
--     shop order fulfilled  customer_market     fulfilled_order    1 / 2 / 3
--     booking completed     customer_market     completed_service  1 / 2 / 3
--     invoice issued        financial_activity  earned_invoice     1 / 1 / 3
--   weights for merchant-declared / customer-confirmed / payment-verified.
--   The level: payment-verified when the provider confirmed a payment on it;
--   customer-confirmed for a shop order or booking the customer placed;
--   merchant-declared otherwise. The highest weights match the product-event
--   rules they replace (2026.11-1), so nothing becomes more generous.
--
--   One negative record per refund, credit or reversal against it
--   (commerce_adjustment), in proportion to the amount, never more than the
--   whole.
--
--   One withdrawal per product-event record it replaces (recorded_sale,
--   fulfilled_order, fulfilled_order_reversed, completed_service,
--   collected_receivable, verified_payment, and their corrections), so the
--   old and the new never count together. Order placement (received_order,
--   a demand signal) and issued documents are not commerce money and stay.
--
-- staged_evidence_comparison(business or null)
--   Per business and dimension: the evidence counted today, and what it
--   would be after the switch-over. The before and after list for Collins.
--
-- Tables and columns read: commercial_transaction, commerce_adjustment,
-- payment_obligation, payment_allocation, payment, evidence_record.
-- ---------------------------------------------------------------------------

create table if not exists evidence_staging (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  source_id uuid not null,                 -- transaction, adjustment, or the evidence record withdrawn
  kind text not null check (kind in ('core', 'withdrawal')),
  dimension evidence_dimension not null,
  evidence_type text not null,
  verification text not null check (verification in
    ('merchant_declared', 'system_recorded', 'customer_confirmed', 'payment_verified', 'institution_verified')),
  weight numeric(8,4) not null,
  rule_version text not null,
  detail jsonb not null default '{}',
  staged_at timestamptz not null default now(),
  constraint evidence_staging_once unique (business_id, source_id, evidence_type)
);
create index if not exists evidence_staging_business on evidence_staging (business_id, dimension);
alter table evidence_staging enable row level security;
revoke all on evidence_staging from anon, authenticated;

create or replace function stage_commerce_evidence(p_business uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rule text := 'core-2026.11';
  v_core int; v_adj int; v_withdrawn int;
begin
  delete from evidence_staging where p_business is null or business_id = p_business;

  -- Earned transactions.
  with tx as (
    select t.*,
           case
             when exists (select 1 from payment_obligation o
                            join payment_allocation a on a.obligation_id = o.id
                            join payment p on p.id = a.payment_id
                           where o.transaction_id = t.id and p.status = 'confirmed'
                             and p.verification = 'provider_confirmed') then 'payment_verified'
             when t.origin_type in ('shop_order', 'service_booking') then 'customer_confirmed'
             else 'merchant_declared'
           end as level,
           case t.origin_type
             when 'sale' then 'financial_activity'
             when 'document' then 'financial_activity'
             else 'customer_market'
           end as dim,
           case t.origin_type
             when 'sale' then 'earned_sale'
             when 'shop_order' then 'fulfilled_order'
             when 'service_booking' then 'completed_service'
             else 'earned_invoice'
           end as etype
      from commercial_transaction t
     where t.earned_at is not null
       and (p_business is null or t.business_id = p_business)
  )
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail)
  select business_id, id, 'core', dim::evidence_dimension, etype, level,
         case level
           when 'payment_verified' then 3
           when 'customer_confirmed' then case when etype in ('fulfilled_order', 'completed_service') then 2 else 1 end
           else 1
         end,
         v_rule,
         jsonb_build_object('transaction', id, 'origin', origin_type, 'earned_at', earned_at, 'total', total)
    from tx;
  get diagnostics v_core = row_count;

  -- Refunds, credits and reversals against those, in proportion, capped.
  with adj as (
    select j.*, s.weight as base_weight, s.dimension, s.evidence_type as etype, t.total,
           sum(j.amount) over (partition by j.transaction_id order by j.created_at, j.id) as running
      from commerce_adjustment j
      join commercial_transaction t on t.id = j.transaction_id
      join evidence_staging s on s.source_id = t.id and s.kind = 'core'
     where j.kind in ('refund', 'credit', 'reversal', 'return')
       and (p_business is null or j.business_id = p_business)
  )
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail)
  select business_id, id, 'core', dimension, etype || '_adjusted',
         case when kind = 'refund' and refunded_payment_id is not null
                   and exists (select 1 from payment p where p.id = adj.refunded_payment_id and p.verification = 'provider_confirmed')
              then 'payment_verified' else 'merchant_declared' end,
         -round(base_weight * greatest(least(running, total) - least(running - amount, total), 0) / nullif(total, 0), 4),
         v_rule,
         jsonb_build_object('adjustment', id, 'kind', kind, 'amount', amount, 'transaction', transaction_id)
    from adj
   where total > 0
     and greatest(least(running, total) - least(running - amount, total), 0) > 0;
  get diagnostics v_adj = row_count;

  -- Withdraw the product-event evidence the core replaces, net of anything
  -- already taken off it, so old and new never count together.
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail)
  select ev.business_id, ev.id, 'withdrawal', ev.dimension, ev.evidence_type || '_withdrawn', ev.verification,
         -(ev.weight + coalesce((select sum(c.weight) from evidence_record c where c.detail->>'corrects' = ev.id::text), 0)),
         v_rule,
         jsonb_build_object('withdraws', ev.id, 'reason', 'replaced by evidence from the commerce core')
    from evidence_record ev
   where ev.evidence_type in ('recorded_sale', 'fulfilled_order', 'fulfilled_order_reversed',
                              'completed_service', 'collected_receivable', 'verified_payment')
     and ev.detail->>'corrects' is null
     and (p_business is null or ev.business_id = p_business)
     and ev.weight + coalesce((select sum(c.weight) from evidence_record c where c.detail->>'corrects' = ev.id::text), 0) <> 0;
  get diagnostics v_withdrawn = row_count;

  return jsonb_build_object('earned', v_core, 'adjustments', v_adj, 'withdrawals', v_withdrawn);
end
$fn$;

-- The before and after list: per business and dimension.
create or replace function staged_evidence_comparison(p_business uuid default null)
returns table (business_id uuid, dimension text, counted_today numeric, after_switch numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with today as (
    select e.business_id, e.dimension::text as dimension, sum(e.weight) as w
      from evidence_record e
     where e.superseded_by is null and (e.expires_at is null or e.expires_at > now())
       and (p_business is null or e.business_id = p_business)
     group by 1, 2
  ),
  staged as (
    select s.business_id, s.dimension::text as dimension, sum(s.weight) as w
      from evidence_staging s
     where p_business is null or s.business_id = p_business
     group by 1, 2
  )
  select coalesce(t.business_id, s.business_id), coalesce(t.dimension, s.dimension),
         round(coalesce(t.w, 0), 4), round(coalesce(t.w, 0) + coalesce(s.w, 0), 4)
    from today t
    full join staged s on s.business_id = t.business_id and s.dimension = t.dimension
   order by 1, 2
$fn$;

revoke all on function stage_commerce_evidence(uuid) from public, anon, authenticated;
revoke all on function staged_evidence_comparison(uuid) from public, anon, authenticated;
grant execute on function stage_commerce_evidence(uuid) to service_role;
grant execute on function staged_evidence_comparison(uuid) to service_role;

-- Stage everything once.
select stage_commerce_evidence(null);
