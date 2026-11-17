-- ---------------------------------------------------------------------------
-- 0098  Phase 5, step 5e: the score over what is shown, reproducible results
--
-- PHASE_5_EVIDENCE_PLAN.md 3.6 and 3.7, decision 3, approved 17 Nov 2026.
-- Nothing here writes a score or changes one shown. It adds the assessment
-- the 5f switch-over will write, and the before and after list Collins reads
-- first (decision 5).
--
-- Sustainability score model 2026.11-1, stored INACTIVE
--   The archetype maps of 2026.08-1, unchanged, scored a new way: a
--   dimension's weight counts only once the business has evidence in it
--   (net positive, or net negative, which still lowers it, section 11). So
--   switching on a product with no new activity adds nothing, and a business
--   is not marked down for what its products do not show. Coverage and
--   "provisional" (below half the dimensions shown) say how much of the
--   picture that is. Trust and funding readiness keep their 2026.08-1
--   formulas, now on the five-factor confidence (2026.11-2); funding
--   readiness stays gated on coverage, so one strong dimension never reads
--   as investment-ready.
--
-- readiness_assessment(business, after default true)
--   Everything one scoring run would record, as jsonb: the score with its
--   breakdown, coverage, provisional, confidence factors, trust, funding
--   readiness, and for reproducibility (3.7) the assessment period, the
--   strengths, weaknesses and missing evidence, and a snapshot of every
--   evidence record used (id, where it came from, weight). With after =
--   false, on the evidence counted today; with after = true, as it will be
--   after the switch-over. Writes nothing.
--
-- readiness_comparison()
--   Per business: what is shown today (current_readiness) beside the
--   assessment after the switch-over. The before and after list.
--
-- evidence_as_of() now also returns each record's id and origin ('counted'
-- or 'staged'), for the snapshot. Its other columns are unchanged.
--
-- Tables and columns read: score_model_version, business (name, archetype,
-- identity_verification, created_at), evidence_record, evidence_staging,
-- event_outbox, current_readiness.
-- ---------------------------------------------------------------------------

drop function if exists evidence_as_of(uuid, boolean);
create function evidence_as_of(p_business uuid, p_after boolean)
returns table (dimension text, evidence_type text, verification text, weight numeric,
               occurred_at timestamptz, id uuid, origin text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with withdrawn as (
    select s.source_id from evidence_staging s
     where p_after and s.business_id = p_business and s.kind = 'withdrawal'
  ),
  counted as (
    select e.dimension::text, e.evidence_type, e.verification, e.weight,
           coalesce((select o.occurred_at from event_outbox o where o.event_id = e.source_event_id), e.valid_from) as occurred_at,
           e.id, 'counted'::text as origin
      from evidence_record e
     where e.business_id = p_business
       and e.superseded_by is null
       and (e.expires_at is null or e.expires_at > now())
       and e.id not in (select source_id from withdrawn)
       and coalesce(e.detail->>'corrects', '') not in (select source_id::text from withdrawn)
  ),
  staged as (
    select s.dimension::text, s.evidence_type, s.verification, s.weight,
           coalesce(s.occurred_at, s.staged_at), s.id, 'staged'::text
      from evidence_staging s
     where p_after and s.business_id = p_business and s.kind = 'core'
  )
  select * from counted
  union all
  select * from staged
$fn$;

-- The new score model: today's archetype maps, scored over what is shown.
insert into score_model_version (kind, version, definition, active)
select 'sustainability_score', '2026.11-1',
       m.definition
       || jsonb_build_object(
            'description', 'Composite view of business stability, discipline and resilience, built only from operating evidence, scored over the dimensions the business has evidence in (PHASE_5_EVIDENCE_PLAN.md 3.6).',
            'method', 'shown_dimensions',
            'provisional_below_coverage', 0.5,
            'confidence_model', '2026.11-2'),
       false
  from score_model_version m
 where m.kind = 'sustainability_score' and m.version = '2026.08-1'
on conflict (kind, version) do nothing;

create or replace function readiness_assessment(p_business uuid, p_after boolean default true)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business business%rowtype;
  v_model score_model_version%rowtype;
  v_map jsonb;
  v_dim text;
  v_cfg jsonb;
  v_weight numeric;
  v_expectation numeric;
  v_current numeric;
  v_achieved numeric;
  v_counted boolean;
  v_status text;
  v_expected int := 0;
  v_shown int := 0;
  v_assessed int := 0;
  v_weight_all numeric := 0;
  v_weight_assessed numeric := 0;
  v_earned numeric := 0;
  v_breakdown jsonb := '[]';
  v_recs jsonb := '[]';
  v_strengths jsonb := '[]';
  v_weaknesses jsonb := '[]';
  v_missing jsonb := '[]';
  v_score numeric;
  v_coverage numeric;
  v_provisional boolean;
  v_conf jsonb;
  v_confidence numeric;
  v_identity boolean;
  v_trust numeric;
  v_funding numeric;
  v_snapshot jsonb;
  v_period_from timestamptz;
begin
  select * into v_business from business where id = p_business;
  if not found then return null; end if;
  select * into v_model from score_model_version
   where kind = 'sustainability_score' and version = '2026.11-1';
  if v_model.id is null then raise exception 'score_model_2026_11_1_missing'; end if;

  v_map := coalesce(v_model.definition->'archetypes'->coalesce(v_business.archetype, 'default'),
                    v_model.definition->'archetypes'->'default');

  for v_dim, v_cfg in select * from jsonb_each(v_map) order by 1
  loop
    v_weight := (v_cfg->>'weight')::numeric;
    v_expectation := greatest((v_cfg->>'expectation')::numeric, 1);
    v_expected := v_expected + 1;
    v_weight_all := v_weight_all + v_weight;

    select coalesce(sum(e.weight), 0) into v_current
      from evidence_as_of(p_business, p_after) e where e.dimension = v_dim;

    v_achieved := least(greatest(v_current, 0) / v_expectation, 1);
    -- Only a dimension with evidence counts towards the score; net negative
    -- evidence still counts, and lowers it.
    v_counted := v_current <> 0;
    if v_counted then
      v_assessed := v_assessed + 1;
      v_weight_assessed := v_weight_assessed + v_weight;
      v_earned := v_earned + v_achieved * v_weight;
    end if;
    if v_current > 0 then v_shown := v_shown + 1; end if;

    v_status := case
      when v_current < 0 then 'concerning'
      when v_current = 0 then 'not_shown_yet'
      when v_achieved >= 0.8 then 'strong'
      else 'building'
    end;

    v_breakdown := v_breakdown || jsonb_build_object(
      'dimension', v_dim, 'status', v_status, 'counted', v_counted,
      'weight', v_weight, 'evidence_weight', round(v_current, 4),
      'expectation', v_expectation, 'achieved', round(v_achieved, 3),
      'points', round(v_achieved * v_weight, 2));

    if v_status = 'strong' then
      v_strengths := v_strengths || jsonb_build_object('dimension', v_dim, 'achieved', round(v_achieved, 3));
    elsif v_status = 'concerning' then
      v_weaknesses := v_weaknesses || jsonb_build_object('dimension', v_dim, 'reason', 'reversals_outweigh_activity');
      v_recs := v_recs || jsonb_build_object('dimension', v_dim, 'priority', 'high', 'gap', 'reversals_outweigh_activity');
    elsif v_status = 'building' and v_achieved < 0.5 then
      v_weaknesses := v_weaknesses || jsonb_build_object('dimension', v_dim, 'reason', 'below_half_expected', 'achieved', round(v_achieved, 3));
      if v_weight >= 20 then
        v_recs := v_recs || jsonb_build_object('dimension', v_dim, 'priority', 'medium', 'gap', 'below_half_expected');
      end if;
    elsif v_status = 'not_shown_yet' then
      v_missing := v_missing || jsonb_build_object('dimension', v_dim, 'weight', v_weight);
      v_recs := v_recs || jsonb_build_object('dimension', v_dim,
                  'priority', case when v_weight >= 25 then 'high' else 'medium' end, 'gap', 'no_evidence');
    end if;
  end loop;

  v_score := case when v_weight_assessed > 0 then round(100 * v_earned / v_weight_assessed, 1) else 0 end;
  v_coverage := case when v_expected > 0 then round(v_shown::numeric / v_expected, 3) else 0 end;
  v_provisional := v_coverage < coalesce((v_model.definition->>'provisional_below_coverage')::numeric, 0.5);

  v_conf := evidence_confidence_factors(p_business, p_after);
  v_confidence := coalesce((v_conf->>'confidence')::numeric, 0);
  v_identity := v_business.identity_verification = 'verified';
  v_trust := round((case when v_identity then 40 else 0 end) + v_confidence * 0.4 + v_coverage * 20, 1);
  v_funding := case when v_coverage < 0.5 then 0 else round(v_score * 0.6 + v_trust * 0.4, 1) end;

  select min(e.occurred_at),
         coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'origin', e.origin, 'dimension', e.dimension, 'weight', e.weight)
                            order by e.origin, e.id), '[]')
    into v_period_from, v_snapshot
    from evidence_as_of(p_business, p_after) e;

  return jsonb_build_object(
    'business_id', p_business,
    'as_of', case when p_after then 'after_switch' else 'counted_today' end,
    'model_version', v_model.version,
    'confidence_model_version', v_conf->>'model_version',
    'archetype', coalesce(v_business.archetype, 'default'),
    'assessment_period', jsonb_build_object('from', coalesce(v_period_from, v_business.created_at), 'to', now()),
    'sustainability_score', v_score,
    'coverage', v_coverage,
    'provisional', v_provisional,
    'dimensions_expected', v_expected,
    'dimensions_shown', v_shown,
    'dimensions_assessed', v_assessed,
    'weight_assessed', v_weight_assessed,
    'weight_expected', v_weight_all,
    'dimensions', v_breakdown,
    'strengths', v_strengths,
    'weaknesses', v_weaknesses,
    'missing_evidence', v_missing,
    'recommendations', v_recs,
    'evidence_confidence', v_confidence,
    'confidence_factors', v_conf,
    'trust_level', v_trust,
    'identity_verified', v_identity,
    'funding_readiness', v_funding,
    'ready_to_present', v_coverage >= 0.5 and v_score >= 50,
    'evidence_snapshot', jsonb_build_object('records', jsonb_array_length(v_snapshot), 'evidence', v_snapshot)
  );
end
$fn$;

-- The before and after list.
create or replace function readiness_comparison()
returns table (business_id uuid, business_name text,
               score_shown numeric, score_after numeric,
               coverage_shown numeric, coverage_after numeric, provisional_after boolean,
               confidence_shown numeric, confidence_after numeric,
               trust_shown numeric, trust_after numeric,
               funding_shown numeric, funding_after numeric,
               scored_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select b.id, b.name,
         s.value, (a->>'sustainability_score')::numeric,
         (s.dimension_breakdown->>'coverage')::numeric, (a->>'coverage')::numeric, (a->>'provisional')::boolean,
         c.value, (a->>'evidence_confidence')::numeric,
         t.value, (a->>'trust_level')::numeric,
         f.value, (a->>'funding_readiness')::numeric,
         s.computed_at
    from business b
    cross join lateral readiness_assessment(b.id, true) a
    left join current_readiness s on s.business_id = b.id and s.kind = 'sustainability_score'
    left join current_readiness c on c.business_id = b.id and c.kind = 'evidence_confidence'
    left join current_readiness t on t.business_id = b.id and t.kind = 'trust_level'
    left join current_readiness f on f.business_id = b.id and f.kind = 'funding_readiness'
   order by b.name
$fn$;

revoke all on function evidence_as_of(uuid, boolean) from public, anon, authenticated;
revoke all on function readiness_assessment(uuid, boolean) from public, anon, authenticated;
revoke all on function readiness_comparison() from public, anon, authenticated;
grant execute on function evidence_as_of(uuid, boolean) to service_role;
grant execute on function readiness_assessment(uuid, boolean) to service_role;
grant execute on function readiness_comparison() to service_role;
