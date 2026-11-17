-- ---------------------------------------------------------------------------
-- 0097  Phase 5, step 5d follow-up: Evidence Confidence weights
--
-- Decided by Collins on 17 Nov 2026, replacing equal weights (decision 4).
-- On live, freshness is 1 for every business (all evidence is under 90 days
-- old) and integrity is 1 for most (little is refunded), so equal weights
-- handed every business 40 points before anything was known about it. The
-- factors that say how much is known, and how well, now carry the weight:
--
--   coverage 0.30   source strength 0.30   consistency 0.20
--   freshness 0.10  integrity 0.10
--
-- Recorded as a new confidence model, 2026.11-2, stored INACTIVE like
-- 2026.11-1 (kept as the record of the equal-weight version). The function
-- reads its weights from that model row, so what is stored and what is
-- worked out cannot drift apart. Nothing shown changes until 5f.
--
-- Tables and columns read: score_model_version (kind, version, definition).
-- ---------------------------------------------------------------------------

insert into score_model_version (kind, version, definition, active)
values ('evidence_confidence', '2026.11-2', jsonb_build_object(
  'description', 'Evidence Confidence from the five factors of spec 08 section 7, weighted towards how much is known and how well (Collins, 17 Nov 2026).',
  'factors', jsonb_build_object('coverage', 0.3, 'source_strength', 0.3, 'consistency', 0.2, 'freshness', 0.1, 'integrity', 0.1),
  'freshness_days', 90,
  'consistency_months', 6,
  'till_gap_points', 2,
  'verification_weights', jsonb_build_object('merchant_declared', 1, 'system_recorded', 2, 'customer_confirmed', 3, 'payment_verified', 4, 'institution_verified', 5)
), false)
on conflict (kind, version) do nothing;

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
  v_w jsonb;
begin
  select * into v_business from business where id = p_business;
  if not found then return null; end if;

  -- The factor weights, from the model this function works out (2026.11-2).
  select m.definition->'factors' into v_w from score_model_version m
   where m.kind = 'evidence_confidence' and m.version = '2026.11-2';
  v_w := coalesce(v_w, '{"coverage":0.3,"source_strength":0.3,"consistency":0.2,"freshness":0.1,"integrity":0.1}'::jsonb);

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
    'model_version', '2026.11-2',
    'as_of', case when p_after then 'after_switch' else 'counted_today' end,
    'coverage', round(v_coverage, 3),
    'source_strength', round(coalesce(v_strength, 0), 3),
    'freshness', round(coalesce(v_fresh, 0), 3),
    'consistency', round(v_consistency, 3),
    'integrity', round(v_integrity, 3),
    'confidence', round(100 * ((v_w->>'coverage')::numeric * v_coverage
                                 + (v_w->>'source_strength')::numeric * coalesce(v_strength, 0)
                                 + (v_w->>'freshness')::numeric * coalesce(v_fresh, 0)
                                 + (v_w->>'consistency')::numeric * v_consistency
                                 + (v_w->>'integrity')::numeric * v_integrity), 1),
    'dimensions_expected', coalesce(array_length(v_dims, 1), 0),
    'dimensions_shown', v_shown,
    'months_observed', v_months,
    'months_active', v_active,
    'till_gaps', v_gaps,
    'weights', v_w
  );
end
$fn$;
