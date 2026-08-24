-- AscendSME Connected Platform. Migration 0023: institutional and partner
-- layer (Master PRD §22).
--
-- This is the surface a bank reads, so the properties that matter most are
-- the negative ones: what a partner cannot see, cannot infer, and cannot
-- keep after consent is withdrawn.
--
--   * Field scope is an allowlist, enforced server-side. A field that is
--     not on the list cannot be shared even if a share row asks for it
--     (INS-006, RDY-014).
--   * Individual customers, staff and transactions are never shareable at
--     any scope. Only summaries leave the business.
--   * Revocation is immediate and every read is logged (INS-010, RDY-015).
--   * Cohort aggregates are suppressed below a minimum group size, because
--     an average over two businesses is not an aggregate.

alter table report_share
  add column token_hash text unique,
  add column expires_at timestamptz,
  add column purpose text;

-- ---------------------------------------------------------------------------
-- The allowlist. Anything absent is not shareable, full stop.
-- ---------------------------------------------------------------------------
create table shareable_field (
  key text primary key,
  description text not null,
  sensitivity text not null default 'summary'
);

insert into shareable_field (key, description, sensitivity) values
  ('business_identity', 'Business name, location city and verification status', 'identity'),
  ('sustainability_score', 'Composite operating score with dimension breakdown', 'summary'),
  ('evidence_confidence', 'How much of the record comes from verified sources', 'summary'),
  ('trust_level', 'Identity verification and record strength', 'summary'),
  ('revenue_summary', 'Monthly revenue totals for the authorised period', 'summary'),
  ('document_summary', 'Counts of documents issued and settled, no contents', 'summary'),
  ('activity_summary', 'Counts of sales, orders and completed services', 'summary')
on conflict (key) do nothing;

alter table shareable_field enable row level security;
alter table report_share enable row level security;

-- ---------------------------------------------------------------------------
-- grant_report_share: the business decides who sees what, and for how long.
-- Consent is explicit, scoped and time-boxed (RDY-013, INS-004, INS-005).
-- ---------------------------------------------------------------------------
create or replace function grant_report_share(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_fields jsonb := coalesce(p->'authorized_fields', '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_field text;
  v_share uuid;
begin
  -- Silently dropping an unknown field would let a caller believe it was
  -- shared. Reject instead.
  for v_field in select jsonb_array_elements_text(v_fields)
  loop
    if not exists (select 1 from shareable_field where key = v_field) then
      raise exception 'field_not_shareable: %', v_field;
    end if;
    v_clean := v_clean || to_jsonb(v_field);
  end loop;

  if jsonb_array_length(v_clean) = 0 then
    raise exception 'no_fields_selected';
  end if;

  insert into report_share (
    business_id, institution_id, report_kind, authorized_fields,
    period_from, period_to, consent_granted_by, status,
    token_hash, expires_at, purpose
  ) values (
    v_business,
    nullif(p->>'institution_id', '')::uuid,
    coalesce(p->>'report_kind', 'basic'),
    v_clean,
    nullif(p->>'period_from', '')::date,
    nullif(p->>'period_to', '')::date,
    (p->>'consent_granted_by')::uuid,
    'active',
    p->>'token_hash',
    coalesce(nullif(p->>'expires_at', '')::timestamptz, now() + interval '30 days'),
    p->>'purpose'
  )
  returning id into v_share;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_business, (p->>'consent_granted_by')::uuid, 'report_share.granted',
    'report_share', v_share,
    jsonb_build_object('fields', v_clean, 'purpose', p->>'purpose')
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, payload, business_date
  ) values (
    'readiness.report.shared', v_business, (p->>'consent_granted_by')::uuid,
    'business_web', 'readiness', 'report_share', v_share,
    jsonb_build_object('field_count', jsonb_array_length(v_clean)),
    current_date
  );

  return jsonb_build_object('share_id', v_share);
end;
$$;

-- ---------------------------------------------------------------------------
-- read_partner_report: what a partner actually receives.
--
-- Returns only the authorised fields for the authorised period, logs the
-- access, and refuses expired or revoked shares. Every response carries its
-- own limitations so a partner cannot mistake a thin record for a strong
-- one (INS-009, SCR-014).
-- ---------------------------------------------------------------------------
create or replace function read_partner_report(p_token_hash text, p_accessor text)
returns jsonb
language plpgsql security definer
as $$
declare
  v_share report_share%rowtype;
  v_business business%rowtype;
  v_fields text[];
  v_report jsonb := '{}'::jsonb;
  v_score score_result%rowtype;
  v_from date;
  v_to date;
  v_revenue jsonb;
  v_docs jsonb;
  v_activity jsonb;
begin
  select * into v_share from report_share where token_hash = p_token_hash;

  if not found
     or v_share.status <> 'active'
     or v_share.revoked_at is not null
     or (v_share.expires_at is not null and v_share.expires_at < now()) then
    return null;
  end if;

  select * into v_business from business where id = v_share.business_id;
  select array(select jsonb_array_elements_text(v_share.authorized_fields)) into v_fields;

  v_from := coalesce(v_share.period_from, current_date - interval '365 days');
  v_to := coalesce(v_share.period_to, current_date);

  -- Access is logged before data is returned, so a read cannot happen
  -- without a record of it (INS-010, RDY-015).
  insert into report_access_log (share_id, accessor) values (v_share.id, p_accessor);

  if 'business_identity' = any(v_fields) then
    v_report := v_report || jsonb_build_object(
      'business_identity', jsonb_build_object(
        'name', v_business.name,
        'country', v_business.country_code,
        'archetype', v_business.archetype,
        'identity_verification', v_business.identity_verification,
        'legal_registration_status', v_business.legal_registration_status
      )
    );
  end if;

  if 'sustainability_score' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'sustainability_score'
    order by computed_at desc limit 1;

    if found then
      v_report := v_report || jsonb_build_object(
        'sustainability_score', jsonb_build_object(
          'value', v_score.value,
          'computed_at', v_score.computed_at,
          'breakdown', v_score.dimension_breakdown
        )
      );
    end if;
  end if;

  if 'evidence_confidence' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'evidence_confidence'
    order by computed_at desc limit 1;
    if found then
      v_report := v_report || jsonb_build_object('evidence_confidence', v_score.value);
    end if;
  end if;

  if 'trust_level' = any(v_fields) then
    select * into v_score from score_result
    where business_id = v_share.business_id and kind = 'trust_level'
    order by computed_at desc limit 1;
    if found then
      v_report := v_report || jsonb_build_object('trust_level', v_score.value);
    end if;
  end if;

  -- Summaries only. Individual transactions, customers and staff never
  -- leave the business, at any scope (INS-006).
  if 'revenue_summary' = any(v_fields) then
    select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) into v_revenue
    from (
      select to_char(business_date, 'YYYY-MM') as month,
             sum(amount) filter (where kind = 'sale_revenue') as revenue,
             sum(amount) filter (where kind = 'refund') as refunds
      from ledger_entry
      where business_id = v_share.business_id
        and business_date between v_from and v_to
        and kind <> 'adjustment'
      group by 1 order by 1
    ) m;
    v_report := v_report || jsonb_build_object('revenue_summary', v_revenue);
  end if;

  if 'document_summary' = any(v_fields) then
    select jsonb_build_object(
      'issued', count(*) filter (where number is not null),
      'paid', count(*) filter (where status = 'paid'),
      'overdue', count(*) filter (where status = 'overdue')
    ) into v_docs
    from document
    where business_id = v_share.business_id
      and created_at::date between v_from and v_to;
    v_report := v_report || jsonb_build_object('document_summary', v_docs);
  end if;

  if 'activity_summary' = any(v_fields) then
    select jsonb_build_object(
      'pos_sales', (select count(*) from sale
        where business_id = v_share.business_id
          and business_date between v_from and v_to and status = 'completed'),
      'shop_orders_fulfilled', (select count(*) from shop_order
        where business_id = v_share.business_id
          and status = 'fulfilled' and placed_at::date between v_from and v_to),
      'services_completed', (select count(*) from service_booking
        where business_id = v_share.business_id
          and status = 'completed' and scheduled_start::date between v_from and v_to)
    ) into v_activity;
    v_report := v_report || jsonb_build_object('activity_summary', v_activity);
  end if;

  -- Limitations travel with the data, so they cannot be dropped by a
  -- partner's own rendering (INS-009, SCR-014, INS-008).
  return jsonb_build_object(
    'report', v_report,
    'scope', jsonb_build_object(
      'authorized_fields', v_share.authorized_fields,
      'period_from', v_from,
      'period_to', v_to,
      'granted_at', v_share.granted_at,
      'expires_at', v_share.expires_at,
      'purpose', v_share.purpose
    ),
    'limitations', jsonb_build_array(
      'Ascend evidence is one input into your own independent decision. It is not an offer, an approval, or a recommendation to lend.',
      'This report covers only the fields and period the business authorised. Absence of a field means it was not shared, not that the activity did not occur.',
      'Evidence confidence describes how much of the record comes from verified sources rather than the business''s own declaration. Read it alongside any score.',
      'Programme monitoring and credit decision-making are different purposes. This report supports the purpose stated in its scope.'
    )
  );
end;
$$;

-- Revocation is immediate: the next read fails, and the reason is recorded.
create or replace function revoke_report_share(p jsonb)
returns void
language plpgsql security definer
as $$
declare
  v_share report_share%rowtype;
begin
  select * into v_share from report_share where id = (p->>'share_id')::uuid;
  if not found then
    raise exception 'share_not_found';
  end if;

  update report_share
  set status = 'revoked', revoked_at = now()
  where id = v_share.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_share.business_id, nullif(p->>'actor_membership_id', '')::uuid,
    'report_share.revoked', 'report_share', v_share.id,
    jsonb_build_object('reason', p->>'reason')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cohort_summary: programme monitoring, not a window into individuals.
--
-- Suppressed below a minimum group size: an "average" over two businesses
-- discloses both of them. Sponsors get adoption and coverage, never a
-- roster of who is doing badly (INS-007, INS-008).
-- ---------------------------------------------------------------------------
create or replace function cohort_summary(p_cohort uuid, p_minimum int default 5)
returns jsonb
language plpgsql security definer
as $$
declare
  v_count int;
  v_active int;
  v_avg_score numeric;
  v_avg_coverage numeric;
begin
  select count(*) into v_count
  from cohort_membership where cohort_id = p_cohort and exited_at is null;

  if v_count < p_minimum then
    return jsonb_build_object(
      'businesses', v_count,
      'suppressed', true,
      'reason', format(
        'Summaries are withheld for cohorts smaller than %s businesses, because an average over so few would identify them.',
        p_minimum
      )
    );
  end if;

  select
    count(*) filter (where s.value is not null),
    round(avg(s.value), 1),
    round(avg((s.dimension_breakdown->>'coverage')::numeric), 3)
  into v_active, v_avg_score, v_avg_coverage
  from cohort_membership cm
  left join lateral (
    select value, dimension_breakdown from score_result
    where business_id = cm.business_id and kind = 'sustainability_score'
    order by computed_at desc limit 1
  ) s on true
  where cm.cohort_id = p_cohort and cm.exited_at is null;

  return jsonb_build_object(
    'businesses', v_count,
    'with_a_score', v_active,
    'average_score', v_avg_score,
    'average_coverage', v_avg_coverage,
    'suppressed', false,
    'note', 'Adoption and coverage only. Individual business records are not included and require each business''s own consent.'
  );
end;
$$;
