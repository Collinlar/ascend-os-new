-- ---------------------------------------------------------------------------
-- 0078  Phase 1, step 1d: granting a report share is checked in the database
--
-- grant_report_share already receives the member granting the share
-- (consent_granted_by), and the sharing route already sends it, so its check
-- can go in now: sharing the business record with a bank or partner needs
-- external_access.authorize, which only owners hold. Safe to run before or
-- after the app is deployed.
--
-- The function body is its latest definition (0023_institutional_layer.sql) with one counted
-- insertion.
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
  -- 0078: sharing the business record with someone outside it needs
  -- external_access.authorize. The member granting it is consent_granted_by.
  perform require_permission(nullif(p->>'consent_granted_by', '')::uuid, v_business, array['external_access.authorize']);

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

revoke all on function grant_report_share(jsonb) from public, anon, authenticated;
grant execute on function grant_report_share(jsonb) to service_role;
