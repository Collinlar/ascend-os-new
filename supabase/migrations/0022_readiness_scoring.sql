-- AscendSME Connected Platform. Migration 0022: Readiness scoring.
-- Turns the evidence ledger into explainable outputs (Master PRD §14).
--
-- Four rules govern everything here:
--   1. Only evidence counts. Purchases, promotion and logins never move a
--      score (RDY-005, EVT-016, EVT-017).
--   2. Expectations are archetype-specific. A walk-in retailer is not
--      marked down for having no online orders (SCR-006, SCR-007).
--   3. Missing evidence is reported as "not shown yet", never as poor
--      performance (SCR-008, RDY-010).
--   4. Every result is reproducible: the model version used is stored with
--      the result and never rewritten (SCR-002, RDY-018).

-- ---------------------------------------------------------------------------
-- Model v1. The definition is data, not code, so it can be reviewed,
-- approved and audited without a deployment (SCR-002, SCR-007).
--
-- `expectation` is the accumulated evidence weight at which a dimension is
-- considered fully demonstrated. `weight` is its share of the score for
-- businesses of that archetype. A dimension absent from an archetype's map
-- is simply not expected of it.
-- ---------------------------------------------------------------------------
insert into score_model_version (kind, version, definition, approved_by, approved_at, active)
values (
  'sustainability_score',
  '2026.08-1',
  jsonb_build_object(
    'description', 'Composite view of business stability, discipline and resilience, built only from operating evidence.',
    'archetypes', jsonb_build_object(
      'walk_in_retail', jsonb_build_object(
        'financial_activity',        jsonb_build_object('weight', 30, 'expectation', 60),
        'governance_control',        jsonb_build_object('weight', 20, 'expectation', 20),
        'operational_structure',     jsonb_build_object('weight', 15, 'expectation', 15),
        'documentation_compliance',  jsonb_build_object('weight', 15, 'expectation', 20),
        'customer_market',           jsonb_build_object('weight', 10, 'expectation', 20),
        'identity_stability',        jsonb_build_object('weight', 10, 'expectation', 5)
      ),
      'online_seller', jsonb_build_object(
        'customer_market',           jsonb_build_object('weight', 30, 'expectation', 40),
        'financial_activity',        jsonb_build_object('weight', 25, 'expectation', 40),
        'documentation_compliance',  jsonb_build_object('weight', 15, 'expectation', 20),
        'digital_presence',          jsonb_build_object('weight', 10, 'expectation', 10),
        'operational_structure',     jsonb_build_object('weight', 10, 'expectation', 10),
        'identity_stability',        jsonb_build_object('weight', 10, 'expectation', 5)
      ),
      'appointment_service', jsonb_build_object(
        'customer_market',           jsonb_build_object('weight', 30, 'expectation', 30),
        'financial_activity',        jsonb_build_object('weight', 25, 'expectation', 30),
        'operational_structure',     jsonb_build_object('weight', 15, 'expectation', 15),
        'documentation_compliance',  jsonb_build_object('weight', 15, 'expectation', 15),
        'identity_stability',        jsonb_build_object('weight', 15, 'expectation', 5)
      ),
      'professional_firm', jsonb_build_object(
        'documentation_compliance',  jsonb_build_object('weight', 30, 'expectation', 30),
        'financial_activity',        jsonb_build_object('weight', 25, 'expectation', 30),
        'customer_market',           jsonb_build_object('weight', 20, 'expectation', 20),
        'governance_control',        jsonb_build_object('weight', 15, 'expectation', 10),
        'identity_stability',        jsonb_build_object('weight', 10, 'expectation', 5)
      ),
      'default', jsonb_build_object(
        'financial_activity',        jsonb_build_object('weight', 30, 'expectation', 40),
        'customer_market',           jsonb_build_object('weight', 20, 'expectation', 25),
        'documentation_compliance',  jsonb_build_object('weight', 20, 'expectation', 20),
        'operational_structure',     jsonb_build_object('weight', 15, 'expectation', 15),
        'identity_stability',        jsonb_build_object('weight', 15, 'expectation', 5)
      )
    ),
    -- A business with almost no history should not be handed a confident
    -- number. Below this coverage the score is reported as provisional.
    'provisional_below_coverage', 0.5
  ),
  'AscendSME Product', now(), true
)
on conflict (kind, version) do nothing;

insert into score_model_version (kind, version, definition, approved_by, approved_at, active)
values (
  'evidence_confidence',
  '2026.08-1',
  jsonb_build_object(
    'description', 'Strength, source quality, freshness and coverage of supporting evidence. Reported separately from performance (EVT-021).',
    'verification_weights', jsonb_build_object(
      'merchant_declared', 1,
      'system_recorded', 2,
      'customer_confirmed', 3,
      'payment_verified', 4,
      'institution_verified', 5
    ),
    'freshness_days', 90
  ),
  'AscendSME Product', now(), true
)
on conflict (kind, version) do nothing;

-- ---------------------------------------------------------------------------
-- compute_readiness: the scoring pass for one business.
--
-- Reads only evidence. Writes score_result rows carrying their model
-- version and a full dimension breakdown, so any number can be traced back
-- to what produced it (RDY-003, SCR-003).
-- ---------------------------------------------------------------------------
create or replace function compute_readiness(p_business uuid)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business business%rowtype;
  v_model score_model_version%rowtype;
  v_conf_model score_model_version%rowtype;
  v_map jsonb;
  v_dim text;
  v_cfg jsonb;
  v_weight numeric;
  v_expectation numeric;
  v_current numeric;
  v_achieved numeric;
  v_total_weight numeric := 0;
  v_earned numeric := 0;
  v_expected_count int := 0;
  v_shown_count int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_status text;
  v_score numeric;
  v_confidence numeric;
  v_verified_weight numeric;
  v_all_weight numeric;
  v_fresh_count int;
  v_coverage numeric;
  v_trust numeric;
  v_identity_verified boolean;
  v_score_id uuid;
begin
  select * into v_business from business where id = p_business;
  if not found then
    raise exception 'business_not_found';
  end if;

  select * into v_model from score_model_version
  where kind = 'sustainability_score' and active
  order by approved_at desc limit 1;

  select * into v_conf_model from score_model_version
  where kind = 'evidence_confidence' and active
  order by approved_at desc limit 1;

  if v_model.id is null then
    raise exception 'no_active_model';
  end if;

  -- Expectations follow the archetype, so a business is measured against
  -- how businesses like it actually operate (SCR-006, SCR-007).
  v_map := coalesce(
    v_model.definition->'archetypes'->coalesce(v_business.archetype, 'default'),
    v_model.definition->'archetypes'->'default'
  );

  for v_dim, v_cfg in select * from jsonb_each(v_map)
  loop
    v_weight := (v_cfg->>'weight')::numeric;
    v_expectation := greatest((v_cfg->>'expectation')::numeric, 1);
    v_expected_count := v_expected_count + 1;
    v_total_weight := v_total_weight + v_weight;

    select coalesce(sum(weight), 0) into v_current
    from evidence_record
    where business_id = p_business
      and dimension = v_dim::evidence_dimension
      and superseded_by is null
      and (expires_at is null or expires_at > now());

    -- Achievement is capped at full: doing ten times the expected volume
    -- does not make a business ten times more creditworthy, and uncapped
    -- volume would reward activity padding (EVT-009).
    v_achieved := least(greatest(v_current, 0) / v_expectation, 1);

    if v_current > 0 then
      v_shown_count := v_shown_count + 1;
    end if;

    -- Missing evidence is reported as not shown, never as poor performance
    -- (SCR-008, RDY-010). Net negative evidence is a different thing again
    -- and is named as such.
    v_status := case
      when v_current < 0 then 'concerning'
      when v_current = 0 then 'not_shown_yet'
      when v_achieved >= 0.8 then 'strong'
      else 'building'
    end;

    v_earned := v_earned + (v_achieved * v_weight);

    v_breakdown := v_breakdown || jsonb_build_object(
      'dimension', v_dim,
      'status', v_status,
      'weight', v_weight,
      'evidence_weight', v_current,
      'expectation', v_expectation,
      'achieved', round(v_achieved, 3),
      'points', round(v_achieved * v_weight, 2)
    );

    -- Recommendations name the gap, not a product to buy (SCR-004,
    -- RDY-011).
    if v_status = 'not_shown_yet' then
      v_recommendations := v_recommendations || jsonb_build_object(
        'dimension', v_dim,
        'priority', case when v_weight >= 25 then 'high' else 'medium' end,
        'gap', 'no_evidence'
      );
    elsif v_status = 'concerning' then
      v_recommendations := v_recommendations || jsonb_build_object(
        'dimension', v_dim,
        'priority', 'high',
        'gap', 'reversals_outweigh_activity'
      );
    elsif v_achieved < 0.5 and v_weight >= 20 then
      v_recommendations := v_recommendations || jsonb_build_object(
        'dimension', v_dim,
        'priority', 'medium',
        'gap', 'below_half_expected'
      );
    end if;
  end loop;

  v_score := case when v_total_weight > 0
    then round((v_earned / v_total_weight) * 100, 1) else 0 end;
  v_coverage := case when v_expected_count > 0
    then round(v_shown_count::numeric / v_expected_count, 3) else 0 end;

  -- Evidence confidence: how much of the record comes from sources
  -- stronger than the merchant's own word. Reported separately from the
  -- score, never blended into it (EVT-021, SCR-011).
  select
    coalesce(sum(abs(weight) * case verification
      when 'institution_verified' then 5
      when 'payment_verified' then 4
      when 'customer_confirmed' then 3
      when 'system_recorded' then 2
      else 1 end), 0),
    coalesce(sum(abs(weight) * 5), 0),
    count(*) filter (where created_at > now() - interval '90 days')
  into v_verified_weight, v_all_weight, v_fresh_count
  from evidence_record
  where business_id = p_business
    and superseded_by is null
    and (expires_at is null or expires_at > now());

  v_confidence := case when v_all_weight > 0
    then round((v_verified_weight / v_all_weight) * 100, 1) else 0 end;

  -- Trust: identity verification plus the strength of the record behind it.
  v_identity_verified := v_business.identity_verification = 'verified';
  v_trust := round(
    (case when v_identity_verified then 40 else 0 end) +
    (v_confidence * 0.4) +
    (v_coverage * 20),
    1
  );

  -- Write results. Each carries its model version, so a report issued today
  -- can always be reproduced (RDY-018, EVT-020).
  insert into score_result (
    business_id, kind, model_version_id, value, dimension_breakdown, recommendations
  ) values (
    p_business, 'sustainability_score', v_model.id, v_score,
    jsonb_build_object(
      'archetype', coalesce(v_business.archetype, 'default'),
      'coverage', v_coverage,
      'provisional', v_coverage < coalesce((v_model.definition->>'provisional_below_coverage')::numeric, 0.5),
      'dimensions', v_breakdown
    ),
    v_recommendations
  )
  returning id into v_score_id;

  insert into score_result (
    business_id, kind, model_version_id, value, dimension_breakdown, recommendations
  ) values (
    p_business, 'evidence_confidence', coalesce(v_conf_model.id, v_model.id), v_confidence,
    jsonb_build_object(
      'weighted_verification', v_verified_weight,
      'maximum_possible', v_all_weight,
      'records_last_90_days', v_fresh_count,
      'coverage', v_coverage
    ),
    '[]'::jsonb
  );

  insert into score_result (
    business_id, kind, model_version_id, value, dimension_breakdown, recommendations
  ) values (
    p_business, 'trust_level', coalesce(v_conf_model.id, v_model.id), v_trust,
    jsonb_build_object(
      'identity_verified', v_identity_verified,
      'evidence_confidence', v_confidence,
      'coverage', v_coverage
    ),
    '[]'::jsonb
  );

  -- Funding readiness is preparedness, not a promise. It is deliberately
  -- gated on having enough of a record to be worth a lender's time, and
  -- the disclaimer travels with the number (SCR-005, SCR-014).
  insert into score_result (
    business_id, kind, model_version_id, value, dimension_breakdown, recommendations
  ) values (
    p_business, 'funding_readiness', v_model.id,
    case when v_coverage < 0.5 then 0 else round(v_score * 0.6 + v_trust * 0.4, 1) end,
    jsonb_build_object(
      'ready_to_present', v_coverage >= 0.5 and v_score >= 50,
      'coverage', v_coverage,
      'disclaimer', 'Ascend evidence is one input into a partner''s own decision. This is not an offer, an approval, or a guarantee of finance.'
    ),
    '[]'::jsonb
  );

  return jsonb_build_object(
    'business_id', p_business,
    'sustainability_score', v_score,
    'evidence_confidence', v_confidence,
    'trust_level', v_trust,
    'coverage', v_coverage,
    'model_version', v_model.version,
    'score_result_id', v_score_id
  );
end;
$$;

-- Latest result per kind, for surfaces that only need current standing.
create or replace view current_readiness as
select distinct on (business_id, kind)
  business_id, kind, value, dimension_breakdown, recommendations, computed_at, model_version_id
from score_result
order by business_id, kind, computed_at desc;
