-- ---------------------------------------------------------------------------
-- 0096  Phase 5, step 5d: Evidence Confidence from the spec's five factors
--
-- PHASE_5_EVIDENCE_PLAN.md 3.5, approved 17 Nov 2026. Today's confidence
-- (compute_readiness, 0022) weighs evidence by verification level only.
-- Spec 08 section 7 names five factors. This works out all five, as a new
-- confidence model version, stored INACTIVE: nothing reads it until the 5f
-- switch-over, so no score or confidence shown today changes.
--
--   coverage         the share of the business's archetype dimensions with
--                    net positive evidence
--   source strength  evidence weighted up the five-level ladder (1 to 5),
--                    against all of it at the top
--   freshness        the share of positive evidence from the last 90 days
--   consistency      of the last six months (fewer for a younger business),
--                    the share with evidence-bearing activity
--   integrity        what was undone (refunds, credits, reversals) and till
--                    gaps (pos.sales.unaccounted, pos.sequence.regressed, two
--                    points each) against activity; 0 with no activity
--   confidence       the five averaged, 0 to 100 (equal weights, decision 4)
--
-- evidence_as_of(business, after)
--   The evidence a business has, each piece with when it happened. With
--   after = false: what is counted today. With after = true: as it will be
--   after the switch-over, counted evidence less what is staged for
--   withdrawal (and the corrections folded into those withdrawals), plus the
--   staged commerce evidence (0095).
--
-- evidence_confidence_factors(business, after default true)   the five, and
--   confidence, as jsonb, with the model version.
--
-- So that freshness and consistency can be worked out for staged evidence,
-- every staged row now records when it happened (occurred_at): when the
-- transaction was earned, when the refund or credit was given, or when the
-- withdrawn record's event happened.
--
-- Tables and columns read: evidence_record, evidence_staging, event_outbox,
-- business (archetype, created_at), score_model_version.
-- ---------------------------------------------------------------------------

alter table evidence_staging add column if not exists occurred_at timestamptz;

-- stage_commerce_evidence (0095), unchanged except that every staged row
-- records when it happened. Generated from 0095 with counted edits.
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
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail, occurred_at)
  select business_id, id, 'core', dim::evidence_dimension, etype, level,
         case level
           when 'payment_verified' then 3
           when 'customer_confirmed' then case when etype in ('fulfilled_order', 'completed_service') then 2 else 1 end
           else 1
         end,
         v_rule,
         jsonb_build_object('transaction', id, 'origin', origin_type, 'earned_at', earned_at, 'total', total),
         earned_at
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
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail, occurred_at)
  select business_id, id, 'core', dimension, etype || '_adjusted',
         case when kind = 'refund' and refunded_payment_id is not null
                   and exists (select 1 from payment p where p.id = adj.refunded_payment_id and p.verification = 'provider_confirmed')
              then 'payment_verified' else 'merchant_declared' end,
         -round(base_weight * greatest(least(running, total) - least(running - amount, total), 0) / nullif(total, 0), 4),
         v_rule,
         jsonb_build_object('adjustment', id, 'kind', kind, 'amount', amount, 'transaction', transaction_id),
         occurred_at
    from adj
   where total > 0
     and greatest(least(running, total) - least(running - amount, total), 0) > 0;
  get diagnostics v_adj = row_count;

  -- Withdraw the product-event evidence the core replaces, net of anything
  -- already taken off it, so old and new never count together.
  insert into evidence_staging (business_id, source_id, kind, dimension, evidence_type, verification, weight, rule_version, detail, occurred_at)
  select ev.business_id, ev.id, 'withdrawal', ev.dimension, ev.evidence_type || '_withdrawn', ev.verification,
         -(ev.weight + coalesce((select sum(c.weight) from evidence_record c where c.detail->>'corrects' = ev.id::text), 0)),
         v_rule,
         jsonb_build_object('withdraws', ev.id, 'reason', 'replaced by evidence from the commerce core'),
         coalesce((select o.occurred_at from event_outbox o where o.event_id = ev.source_event_id), ev.valid_from)
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

create or replace function evidence_as_of(p_business uuid, p_after boolean)
returns table (dimension text, evidence_type text, verification text, weight numeric, occurred_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with withdrawn as (
    select s.source_id from evidence_staging s
     where p_after and s.business_id = p_business and s.kind = 'withdrawal'
  ),
  counted as (
    select e.dimension::text, e.evidence_type, e.verification, e.weight,
           coalesce((select o.occurred_at from event_outbox o where o.event_id = e.source_event_id), e.valid_from) as occurred_at
      from evidence_record e
     where e.business_id = p_business
       and e.superseded_by is null
       and (e.expires_at is null or e.expires_at > now())
       and e.id not in (select source_id from withdrawn)
       and coalesce(e.detail->>'corrects', '') not in (select source_id::text from withdrawn)
  ),
  staged as (
    select s.dimension::text, s.evidence_type, s.verification, s.weight, coalesce(s.occurred_at, s.staged_at)
      from evidence_staging s
     where p_after and s.business_id = p_business and s.kind = 'core'
  )
  select * from counted
  union all
  select * from staged
$fn$;

create or replace function evidence_confidence_factors(p_business uuid, p_after boolean default true)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business business%rowtype;
  v_dims text[];
  v_shown int;
  v_coverage numeric;
  v_strength numeric;
  v_fresh numeric;
  v_consistency numeric;
  v_integrity numeric;
  v_positive numeric;
  v_negative numeric;
  v_gaps int;
  v_months int;
  v_active int;
begin
  select * into v_business from business where id = p_business;
  if not found then return null; end if;

  -- The archetype's dimensions, from one active score model (the latest,
  -- should more than one ever be active).
  select array_agg(k) into v_dims
    from (select m.definition from score_model_version m
           where m.kind = 'sustainability_score' and m.active
           order by m.approved_at desc nulls last, m.version desc
           limit 1) m,
         jsonb_object_keys(coalesce(m.definition->'archetypes'->coalesce(v_business.archetype, 'default'),
                                    m.definition->'archetypes'->'default')) k;

  select count(*) into v_shown
    from (select e.dimension from evidence_as_of(p_business, p_after) e
           where e.dimension = any (coalesce(v_dims, '{}'))
           group by e.dimension having sum(e.weight) > 0) d;
  v_coverage := case when coalesce(array_length(v_dims, 1), 0) > 0
                     then v_shown::numeric / array_length(v_dims, 1) else 0 end;

  select coalesce(sum(abs(e.weight) * case e.verification
                    when 'institution_verified' then 5 when 'payment_verified' then 4
                    when 'customer_confirmed' then 3 when 'system_recorded' then 2 else 1 end), 0)
         / nullif(sum(abs(e.weight) * 5), 0),
         coalesce(sum(e.weight) filter (where e.weight > 0 and e.occurred_at > now() - interval '90 days'), 0)
         / nullif(sum(e.weight) filter (where e.weight > 0), 0),
         coalesce(sum(e.weight) filter (where e.weight > 0), 0),
         coalesce(sum(-e.weight) filter (where e.weight < 0), 0)
    into v_strength, v_fresh, v_positive, v_negative
    from evidence_as_of(p_business, p_after) e;

  -- Consistency: months in the last six (or since the business began) with
  -- evidence-bearing activity.
  v_months := least(6, greatest(1,
    (extract(year from age(date_trunc('month', now()), date_trunc('month', v_business.created_at))) * 12
     + extract(month from age(date_trunc('month', now()), date_trunc('month', v_business.created_at))))::int + 1));
  select count(distinct date_trunc('month', e.occurred_at)) into v_active
    from evidence_as_of(p_business, p_after) e
   where e.weight > 0
     and e.occurred_at >= date_trunc('month', now()) - make_interval(months => v_months - 1);
  v_consistency := least(v_active::numeric / v_months, 1);

  select count(*) into v_gaps from event_outbox
   where business_id = p_business
     and event_type in ('pos.sales.unaccounted', 'pos.sequence.regressed')
     and occurred_at > now() - interval '6 months';
  -- With no activity there is nothing to vouch for: integrity counts
  -- nothing, so a business with no evidence has no confidence (section 10).
  v_integrity := case when v_positive > 0
                      then greatest(0, 1 - (v_negative + 2 * v_gaps) / v_positive)
                      else 0 end;

  return jsonb_build_object(
    'model_version', '2026.11-1',
    'as_of', case when p_after then 'after_switch' else 'counted_today' end,
    'coverage', round(v_coverage, 3),
    'source_strength', round(coalesce(v_strength, 0), 3),
    'freshness', round(coalesce(v_fresh, 0), 3),
    'consistency', round(v_consistency, 3),
    'integrity', round(v_integrity, 3),
    'confidence', round(100 * (v_coverage + coalesce(v_strength, 0) + coalesce(v_fresh, 0) + v_consistency + v_integrity) / 5, 1),
    'dimensions_expected', coalesce(array_length(v_dims, 1), 0),
    'dimensions_shown', v_shown,
    'months_observed', v_months,
    'months_active', v_active,
    'till_gaps', v_gaps
  );
end
$fn$;

-- The new confidence model, inactive until the 5f switch-over.
insert into score_model_version (kind, version, definition, active)
values ('evidence_confidence', '2026.11-1', jsonb_build_object(
  'description', 'Evidence Confidence from the five factors of spec 08 section 7, equal weights (PHASE_5_EVIDENCE_PLAN.md 3.5).',
  'factors', jsonb_build_object('coverage', 0.2, 'source_strength', 0.2, 'freshness', 0.2, 'consistency', 0.2, 'integrity', 0.2),
  'freshness_days', 90,
  'consistency_months', 6,
  'till_gap_points', 2,
  'verification_weights', jsonb_build_object('merchant_declared', 1, 'system_recorded', 2, 'customer_confirmed', 3, 'payment_verified', 4, 'institution_verified', 5)
), false)
on conflict (kind, version) do nothing;

revoke all on function evidence_as_of(uuid, boolean) from public, anon, authenticated;
revoke all on function evidence_confidence_factors(uuid, boolean) from public, anon, authenticated;
grant execute on function evidence_as_of(uuid, boolean) to service_role;
grant execute on function evidence_confidence_factors(uuid, boolean) to service_role;

-- Restage, so every staged row has its time.
select stage_commerce_evidence(null);
