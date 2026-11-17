-- ---------------------------------------------------------------------------
-- 0099  Phase 5, step 5f: the switch-over
--
-- PHASE_5_EVIDENCE_PLAN.md step 5f. Collins read the before and after list
-- (readiness_comparison, 0098) and approved the switch on 17 Nov 2026.
-- After this migration the readiness page shows the new numbers.
--
-- 1. Commerce evidence comes from the core, for good.
--    record_commerce_evidence(business or null) writes into evidence_record
--    what 0095 staged: one record per earned transaction, one negative
--    record per refund, credit, reversal or return in proportion, and, new,
--    an upgrade when a transaction's level rises later (an invoice issued,
--    then paid online through the provider: merchant-declared 1 becomes
--    payment-verified 3 by a second record of 2). Idempotent: the
--    transaction or adjustment id is the record's source, and
--    (source_event_id, evidence_type) is unique. Rule version core-2026.11.
--    compute_readiness calls it first, so the relay keeps it current.
--
-- 2. The product-event commerce evidence it replaces is retired from
--    counting, by rule, not by edit (evidence_record is append-only, 0072):
--    recorded_sale, fulfilled_order, fulfilled_order_reversed,
--    completed_service, collected_receivable and verified_payment written by
--    the product-event engine (any rule version other than core-*), and
--    every correction of one. The records stay, readable and unedited. This
--    also covers what the engine still writes until the next deploy stops
--    it, so nothing counts twice in between.
--
-- 3. The new models go live: sustainability_score 2026.11-1 (scored over
--    what is shown, 0098) and evidence_confidence 2026.11-2 (five factors,
--    weighted, 0097). The 2026.08-1 models are kept, inactive; every
--    earlier result keeps the version it was made with.
--
-- 4. compute_readiness writes from readiness_assessment: the same four
--    results as before, with the same keys the readiness page and shared
--    reports read, plus the assessment period, strengths, weaknesses,
--    missing evidence and the evidence snapshot.
--
-- 5. Every business is rescored once.
--
-- evidence_as_of() keeps its signature; with staging committed, p_after no
-- longer changes anything and both read what is counted.
--
-- Tables and columns read: commercial_transaction (id, business_id,
-- origin_type, earned_at, total), commerce_adjustment (id, business_id,
-- transaction_id, kind, amount, created_at, occurred_at,
-- refunded_payment_id), payment_obligation, payment_allocation, payment
-- (status, verification), evidence_record, event_outbox, business,
-- score_model_version.
-- ---------------------------------------------------------------------------

-- 1. Commerce evidence from the core.
create or replace function record_commerce_evidence(p_business uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rule text := 'core-2026.11';
  v_earned int; v_upgraded int; v_adj int;
begin
  create temp table if not exists _core_tx (
    id uuid, business_id uuid, origin_type text, earned_at timestamptz, total numeric,
    level text, dim text, etype text, w numeric) on commit drop;
  truncate _core_tx;
  insert into _core_tx
  select t.id, t.business_id, t.origin_type, t.earned_at, t.total, x.level, x.dim, x.etype,
         case x.level
           when 'payment_verified' then 3
           when 'customer_confirmed' then case when x.etype in ('fulfilled_order', 'completed_service') then 2 else 1 end
           else 1
         end
    from commercial_transaction t
    cross join lateral (
      select case
               when exists (select 1 from payment_obligation o
                              join payment_allocation a on a.obligation_id = o.id
                              join payment p on p.id = a.payment_id
                             where o.transaction_id = t.id and p.status = 'confirmed'
                               and p.verification = 'provider_confirmed') then 'payment_verified'
               when t.origin_type in ('shop_order', 'service_booking') then 'customer_confirmed'
               else 'merchant_declared'
             end as level,
             case t.origin_type when 'sale' then 'financial_activity' when 'document' then 'financial_activity'
                                else 'customer_market' end as dim,
             case t.origin_type when 'sale' then 'earned_sale' when 'shop_order' then 'fulfilled_order'
                                when 'service_booking' then 'completed_service' else 'earned_invoice' end as etype
    ) x
   where t.earned_at is not null
     and (p_business is null or t.business_id = p_business);

  -- Earned transactions, first written at the level they have now.
  insert into evidence_record (business_id, source_event_id, dimension, evidence_type, verification,
                               weight, rule_version, valid_from, detail)
  select c.business_id, c.id, c.dim::evidence_dimension, c.etype, c.level, c.w, v_rule, c.earned_at,
         jsonb_build_object('transaction', c.id, 'origin', c.origin_type, 'earned_at', c.earned_at, 'total', c.total)
    from _core_tx c
  on conflict (source_event_id, evidence_type) do nothing;
  get diagnostics v_earned = row_count;

  -- A level that rose since: the difference, at the new level, once per level.
  insert into evidence_record (business_id, source_event_id, dimension, evidence_type, verification,
                               weight, rule_version, detail)
  select c.business_id, c.id, c.dim::evidence_dimension, c.etype || '_' || c.level, c.level,
         c.w - r.recorded, v_rule,
         jsonb_build_object('transaction', c.id, 'upgrades_to', c.level, 'reason', 'stronger evidence arrived later')
    from _core_tx c
    cross join lateral (
      select coalesce(sum(e.weight), 0) as recorded from evidence_record e
       where e.source_event_id = c.id and e.rule_version = v_rule and e.weight > 0) r
   where c.w > r.recorded
  on conflict (source_event_id, evidence_type) do nothing;
  get diagnostics v_upgraded = row_count;

  -- Refunds, credits, reversals and returns, in proportion, never more than
  -- the whole, against the transaction's evidence when they are written.
  insert into evidence_record (business_id, source_event_id, dimension, evidence_type, verification,
                               weight, rule_version, valid_from, detail)
  select adj.business_id, adj.id, adj.dim::evidence_dimension, adj.etype || '_adjusted',
         case when adj.kind = 'refund' and adj.refunded_payment_id is not null
                   and exists (select 1 from payment p where p.id = adj.refunded_payment_id and p.verification = 'provider_confirmed')
              then 'payment_verified' else 'merchant_declared' end,
         -round(adj.base * greatest(least(adj.running, adj.total) - least(adj.running - adj.amount, adj.total), 0) / adj.total, 4),
         v_rule, coalesce(adj.occurred_at, adj.created_at),
         jsonb_build_object('adjustment', adj.id, 'kind', adj.kind, 'amount', adj.amount, 'transaction', adj.transaction_id)
    from (
      select j.*, c.dim, c.etype, c.total,
             (select coalesce(sum(e.weight), 0) from evidence_record e
               where e.source_event_id = c.id and e.rule_version = v_rule and e.weight > 0) as base,
             sum(j.amount) over (partition by j.transaction_id order by j.created_at, j.id) as running
        from commerce_adjustment j
        join _core_tx c on c.id = j.transaction_id
       where j.kind in ('refund', 'credit', 'reversal', 'return')
    ) adj
   where adj.total > 0
     and greatest(least(adj.running, adj.total) - least(adj.running - adj.amount, adj.total), 0) > 0
  on conflict (source_event_id, evidence_type) do nothing;
  get diagnostics v_adj = row_count;

  return jsonb_build_object('earned', v_earned, 'upgraded', v_upgraded, 'adjustments', v_adj);
end
$fn$;

-- 2. What counts: the product-event commerce evidence and its corrections
-- are retired; everything else counts as before.
create or replace function evidence_as_of(p_business uuid, p_after boolean)
returns table (dimension text, evidence_type text, verification text, weight numeric,
               occurred_at timestamptz, id uuid, origin text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with retired as (
    select r.id from evidence_record r
     where r.business_id = p_business
       and r.rule_version not like 'core-%'
       and r.evidence_type in ('recorded_sale', 'fulfilled_order', 'fulfilled_order_reversed',
                               'completed_service', 'collected_receivable', 'verified_payment')
  )
  select e.dimension::text, e.evidence_type, e.verification, e.weight,
         coalesce((select o.occurred_at from event_outbox o where o.event_id = e.source_event_id), e.valid_from),
         e.id, 'counted'::text
    from evidence_record e
   where e.business_id = p_business
     and e.superseded_by is null
     and (e.expires_at is null or e.expires_at > now())
     and e.id not in (select id from retired)
     and coalesce(e.detail->>'corrects', '') not in (select id::text from retired)
$fn$;

-- The summary view follows the same rule (columns unchanged).
create or replace view evidence_summary as
select e.business_id, e.dimension,
       sum(e.weight) as current_weight,
       count(*) as record_count,
       count(*) filter (where e.verification in ('payment_verified', 'institution_verified')) as verified_count,
       max(e.created_at) as freshest_at
  from evidence_record e
 where e.superseded_by is null
   and (e.expires_at is null or e.expires_at > now())
   and not exists (
     select 1 from evidence_record r
      where r.rule_version not like 'core-%'
        and r.evidence_type in ('recorded_sale', 'fulfilled_order', 'fulfilled_order_reversed',
                                'completed_service', 'collected_receivable', 'verified_payment')
        and (r.id = e.id or r.id::text = e.detail->>'corrects'))
 group by e.business_id, e.dimension;

-- 4. Scoring writes from the assessment.
create or replace function compute_readiness(p_business uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_model score_model_version%rowtype;
  v_conf_model score_model_version%rowtype;
  a jsonb;
  v_score_id uuid;
begin
  if not exists (select 1 from business where id = p_business) then
    raise exception 'business_not_found';
  end if;
  select * into v_model from score_model_version
   where kind = 'sustainability_score' and version = '2026.11-1';
  select * into v_conf_model from score_model_version
   where kind = 'evidence_confidence' and version = '2026.11-2';
  if v_model.id is null or v_conf_model.id is null then
    raise exception 'no_active_model';
  end if;

  perform record_commerce_evidence(p_business);
  a := readiness_assessment(p_business, false);

  insert into score_result (business_id, kind, model_version_id, value, dimension_breakdown, recommendations)
  values (p_business, 'sustainability_score', v_model.id, (a->>'sustainability_score')::numeric,
          jsonb_build_object(
            'archetype', a->'archetype',
            'coverage', a->'coverage',
            'provisional', a->'provisional',
            'dimensions', a->'dimensions',
            'dimensions_expected', a->'dimensions_expected',
            'dimensions_shown', a->'dimensions_shown',
            'dimensions_assessed', a->'dimensions_assessed',
            'assessment_period', a->'assessment_period',
            'strengths', a->'strengths',
            'weaknesses', a->'weaknesses',
            'missing_evidence', a->'missing_evidence',
            'evidence_snapshot', a->'evidence_snapshot'),
          a->'recommendations')
  returning id into v_score_id;

  insert into score_result (business_id, kind, model_version_id, value, dimension_breakdown, recommendations)
  values (p_business, 'evidence_confidence', v_conf_model.id, (a->>'evidence_confidence')::numeric,
          (a->'confidence_factors') || jsonb_build_object('assessment_period', a->'assessment_period'),
          '[]'::jsonb);

  insert into score_result (business_id, kind, model_version_id, value, dimension_breakdown, recommendations)
  values (p_business, 'trust_level', v_conf_model.id, (a->>'trust_level')::numeric,
          jsonb_build_object('identity_verified', a->'identity_verified',
                             'evidence_confidence', a->'evidence_confidence',
                             'coverage', a->'coverage'),
          '[]'::jsonb);

  insert into score_result (business_id, kind, model_version_id, value, dimension_breakdown, recommendations)
  values (p_business, 'funding_readiness', v_model.id, (a->>'funding_readiness')::numeric,
          jsonb_build_object(
            'ready_to_present', a->'ready_to_present',
            'coverage', a->'coverage',
            'provisional', a->'provisional',
            'disclaimer', 'Ascend evidence is one input into a partner''s own decision. This is not an offer, an approval, or a guarantee of finance.'),
          '[]'::jsonb);

  return jsonb_build_object(
    'business_id', p_business,
    'sustainability_score', (a->>'sustainability_score')::numeric,
    'evidence_confidence', (a->>'evidence_confidence')::numeric,
    'trust_level', (a->>'trust_level')::numeric,
    'coverage', (a->>'coverage')::numeric,
    'provisional', (a->>'provisional')::boolean,
    'model_version', v_model.version,
    'score_result_id', v_score_id);
end
$fn$;

revoke all on function record_commerce_evidence(uuid) from public, anon, authenticated;
grant execute on function record_commerce_evidence(uuid) to service_role;

-- 3. The new models go live; the old ones are kept, inactive.
update score_model_version set active = false
 where kind in ('sustainability_score', 'evidence_confidence') and active
   and version not in ('2026.11-1', '2026.11-2');
update score_model_version
   set active = true, approved_by = coalesce(approved_by, 'Collins'), approved_at = coalesce(approved_at, now())
 where (kind = 'sustainability_score' and version = '2026.11-1')
    or (kind = 'evidence_confidence' and version = '2026.11-2');

-- 5. Commit the core evidence and rescore every business once. Running the
-- migration again rescores nobody twice.
do $$
declare r record; v jsonb; v_n int := 0;
begin
  v := record_commerce_evidence(null);
  raise notice 'core evidence: %', v;
  for r in
    select b.id from business b
     where not exists (select 1 from score_result s
                         join score_model_version m on m.id = s.model_version_id
                        where s.business_id = b.id and s.kind = 'sustainability_score'
                          and m.kind = 'sustainability_score' and m.version = '2026.11-1')
     order by b.created_at
  loop
    perform compute_readiness(r.id);
    v_n := v_n + 1;
  end loop;
  raise notice 'rescored % businesses', v_n;
end $$;
