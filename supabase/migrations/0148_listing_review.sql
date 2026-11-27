-- ---------------------------------------------------------------------------
-- 0148  Listing review (Modules round 3, P3)
--
-- The design's Listing review: a product that "Needs a change" (a health
-- claim that needs evidence, highlighted, with "Remove claim and
-- resubmit"), a product "Removed from Discover" with an appeal and its
-- evidence decided by a different reviewer, and the business's own reports
-- as closed outcomes (decision 5, read in the app).
--
-- Both states keep the listing off Discover and leave the product in the
-- business's own Shop: only promotion waits. Running campaigns pause, and
-- nothing is charged while they wait.
--
-- Found while building: refresh_discover_listings (0046, 0050), which runs
-- whenever a product changes, put every listing that was not suspended back
-- to eligible, including one waiting for a decision on its appeal. So
-- editing a product got it back onto Discover without anyone deciding. It
-- now leaves a listing that is waiting alone.
-- ---------------------------------------------------------------------------

alter table discover_listing
  add column if not exists change_reason text,
  add column if not exists flagged_text text,
  add column if not exists flagged_field text,
  add column if not exists removed_by uuid references person(id),
  add column if not exists resubmitted_at timestamptz,
  add column if not exists appeal_evidence jsonb not null default '[]'::jsonb,
  add column if not exists appealed_at timestamptz;

alter table discover_listing drop constraint if exists discover_listing_flagged_field_check;
alter table discover_listing add constraint discover_listing_flagged_field_check
  check (flagged_field is null or flagged_field in ('name', 'description'));
alter table discover_listing drop constraint if exists discover_listing_evidence_check;
alter table discover_listing add constraint discover_listing_evidence_check
  check (jsonb_typeof(appeal_evidence) = 'array' and jsonb_array_length(appeal_evidence) <= 3);

-- ---------------------------------------------------------------------------
-- moderate_listing: Ascend asks for a change, or removes a listing.
-- p: admin_person_id, listing_id, kind ('change' | 'remove'), reason,
--    flagged_text?, flagged_field?
-- ---------------------------------------------------------------------------
create or replace function moderate_listing(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_kind text := p->>'kind';
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_flag text := nullif(btrim(coalesce(p->>'flagged_text', '')), '');
  v_field text := coalesce(nullif(p->>'flagged_field', ''), 'description');
  l discover_listing%rowtype;
  v_text text;
  v_paused int;
begin
  perform risk_admin_check(v_admin);
  select * into l from discover_listing where id = (p->>'listing_id')::uuid for update;
  if not found then raise exception 'listing_not_found'; end if;
  if v_kind not in ('change', 'remove') then raise exception 'kind_unknown'; end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  if v_kind = 'change' and v_flag is not null then
    if v_field not in ('name', 'description') then raise exception 'field_unknown'; end if;
    select case v_field when 'name' then name else description end into v_text from catalogue_item where id = l.item_id;
    if v_text is null or position(v_flag in v_text) = 0 then raise exception 'flag_not_in_text'; end if;
  end if;

  update discover_listing
     set status = 'suspended',
         suspended_reason = v_reason,
         change_reason = case when v_kind = 'change' then v_reason end,
         flagged_text = case when v_kind = 'change' then v_flag end,
         flagged_field = case when v_kind = 'change' and v_flag is not null then v_field end,
         removed_by = v_admin,
         resubmitted_at = null,
         appeal_note = null,
         appeal_evidence = '[]'::jsonb,
         appealed_at = null,
         reviewed_at = now()
   where id = l.id;

  update discover_campaign set status = 'paused' where listing_id = l.id and status = 'running';
  get diagnostics v_paused = row_count;

  insert into discover_moderation_event (listing_id, from_status, to_status, reason, actor)
  values (l.id, l.status, 'suspended', case when v_kind = 'change' then 'Needs a change: ' else 'Removed: ' end || v_reason, 'platform');

  return jsonb_build_object('listing_id', l.id, 'kind', v_kind, 'campaigns_paused', v_paused);
end
$fn$;

-- ---------------------------------------------------------------------------
-- fix_listing: the business answers "Needs a change". It either takes the
-- flagged words out of the product ("Remove claim and resubmit") or says it
-- has edited the product itself. Either way the listing waits for Ascend.
-- p: business_id, actor_membership_id, listing_id, remove_flagged (bool)
-- ---------------------------------------------------------------------------
create or replace function fix_listing(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  l discover_listing%rowtype;
  v_remove boolean := coalesce((p->>'remove_flagged')::boolean, false);
begin
  perform require_permission(v_actor, v_business, array['catalogue.manage']);
  select * into l from discover_listing where id = (p->>'listing_id')::uuid and business_id = v_business for update;
  if not found then raise exception 'listing_not_found'; end if;
  if l.status <> 'suspended' or l.change_reason is null then raise exception 'no_change_asked'; end if;

  -- Status first, so the refresh the product edit sets off leaves it waiting.
  update discover_listing
     set status = 'pending_review', resubmitted_at = now()
   where id = l.id;

  if v_remove and l.flagged_text is not null and l.item_id is not null then
    update catalogue_item
       set description = case when coalesce(l.flagged_field, 'description') = 'description'
                              then nullif(btrim(regexp_replace(replace(description, l.flagged_text, ''), '\s{2,}', ' ', 'g')), '')
                              else description end,
           name = case when l.flagged_field = 'name'
                       then coalesce(nullif(btrim(regexp_replace(replace(name, l.flagged_text, ''), '\s{2,}', ' ', 'g')), ''), name)
                       else name end,
           updated_at = now()
     where id = l.item_id and business_id = v_business;
  end if;

  insert into discover_moderation_event (listing_id, from_status, to_status, note, actor)
  values (l.id, 'suspended', 'pending_review',
          case when v_remove then 'Removed the flagged words and resubmitted' else 'Edited and resubmitted' end,
          coalesce(v_actor::text, 'business'));

  return jsonb_build_object('listing_id', l.id, 'status', 'pending_review');
end
$fn$;

-- ---------------------------------------------------------------------------
-- appeal_listing: as 0030, with up to three files as evidence, by the
-- business's own manager.
-- ---------------------------------------------------------------------------
create or replace function appeal_listing(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_listing discover_listing%rowtype;
  v_evidence jsonb := coalesce(p->'evidence', '[]'::jsonb);
  v_file jsonb;
begin
  select * into v_listing from discover_listing
  where id = (p->>'listing_id')::uuid for update;
  if not found then
    raise exception 'listing_not_found';
  end if;
  if v_listing.status <> 'suspended' then
    raise exception 'nothing_to_appeal';
  end if;
  if coalesce(p->>'note', '') = '' then
    raise exception 'note_required';
  end if;
  if jsonb_typeof(v_evidence) <> 'array' or jsonb_array_length(v_evidence) > 3 then
    raise exception 'evidence_invalid';
  end if;
  for v_file in select * from jsonb_array_elements(v_evidence) loop
    if (v_file->>'path') !~ ('^' || v_listing.business_id::text || '/appeal-[0-9a-f-]{36}\.(pdf|jpg|png)$') then
      raise exception 'evidence_invalid';
    end if;
  end loop;
  update discover_listing
  set status = 'pending_review',
      appeal_note = p->>'note',
      appeal_evidence = v_evidence,
      appealed_at = now()
  where id = v_listing.id;
  insert into discover_moderation_event (
    listing_id, from_status, to_status, note, actor
  ) values (
    v_listing.id, 'suspended', 'pending_review', p->>'note',
    coalesce(p->>'actor_membership_id', 'business')
  );
  return jsonb_build_object('listing_id', v_listing.id, 'status', 'pending_review');
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_listing: Ascend decides a resubmission or an appeal. An appeal
-- against a removal is decided by someone other than who removed it.
-- p: admin_person_id, listing_id, restore (bool), reason (when refused)
-- ---------------------------------------------------------------------------
create or replace function decide_listing(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_restore boolean := coalesce((p->>'restore')::boolean, false);
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  l discover_listing%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into l from discover_listing where id = (p->>'listing_id')::uuid for update;
  if not found then raise exception 'listing_not_found'; end if;
  if l.status <> 'pending_review' then raise exception 'nothing_to_decide'; end if;
  if l.appealed_at is not null and l.removed_by = v_admin then
    raise exception 'different_reviewer: someone other than who removed it decides the appeal';
  end if;
  if not v_restore and (v_reason is null or length(v_reason) < 10) then
    raise exception 'reason_needed: say why, in at least 10 characters';
  end if;

  update discover_listing
     set status = case when v_restore then 'eligible'::listing_status else 'suspended'::listing_status end,
         suspended_reason = case when v_restore then null else v_reason end,
         change_reason = case when v_restore then null else change_reason end,
         flagged_text = case when v_restore then null else flagged_text end,
         flagged_field = case when v_restore then null else flagged_field end,
         reviewed_at = now()
   where id = l.id;

  insert into discover_moderation_event (listing_id, from_status, to_status, reason, actor)
  values (l.id, 'pending_review', case when v_restore then 'eligible'::listing_status else 'suspended'::listing_status end,
          coalesce(v_reason, 'Back on Discover'), 'platform');

  return jsonb_build_object('listing_id', l.id, 'restored', v_restore);
end
$fn$;

-- ---------------------------------------------------------------------------
-- refresh_discover_listings: as 0050, except that a listing waiting for
-- Ascend's decision (pending_review) keeps waiting. Before, any edit to the
-- product put it straight back on Discover, appeal or not.
-- ---------------------------------------------------------------------------
create or replace function refresh_discover_listings(p_business uuid)
returns void
language plpgsql security definer
as $fn$
declare
  v_live_shop boolean;
  v_has_products boolean;
  v_city text;
begin
  select exists (
    select 1 from entitlement e
    where e.business_id = p_business
      and e.product_set_key = 'shop'
      and e.status in ('active', 'grace')
  ) into v_live_shop;

  select exists (
    select 1
    from catalogue_item ci
    join channel_listing cl on cl.item_id = ci.id
    where ci.business_id = p_business
      and ci.active
      and cl.channel = 'shop'
      and cl.visible
      and coalesce(cl.price_override, ci.base_price) is not null
  ) into v_has_products;

  if not (v_live_shop and v_has_products) then
    update discover_listing
       set status = 'withdrawn'::listing_status
     where business_id = p_business
       and status not in ('suspended', 'pending_review');
    return;
  end if;

  select l.city into v_city
  from location l
  where l.business_id = p_business and l.active
  order by l.created_at
  limit 1;

  -- The shop itself.
  insert into discover_listing (business_id, item_id, status, city)
  values (p_business, null, 'eligible'::listing_status, v_city)
  on conflict (business_id) where item_id is null
  do update set status = case
                  when discover_listing.status in ('suspended', 'pending_review')
                    then discover_listing.status
                  else 'eligible'::listing_status
                end,
                city = excluded.city;

  -- Each product that qualifies, under a category Discover can group by.
  insert into discover_listing (business_id, item_id, status, category, city)
  select p_business, ci.id, 'eligible'::listing_status,
         canonical_category(ci.category), v_city
  from catalogue_item ci
  join channel_listing cl on cl.item_id = ci.id
  where ci.business_id = p_business
    and ci.active
    and cl.channel = 'shop'
    and cl.visible
    and coalesce(cl.price_override, ci.base_price) is not null
  on conflict (business_id, item_id)
  do update set status = case
                  when discover_listing.status in ('suspended', 'pending_review')
                    then discover_listing.status
                  else 'eligible'::listing_status
                end,
                category = excluded.category,
                city = excluded.city;

  -- Anything that no longer qualifies comes off, unless a moderator put it
  -- off, in which case their decision stands.
  update discover_listing dl
     set status = 'withdrawn'::listing_status
   where dl.business_id = p_business
     and dl.item_id is not null
     and dl.status not in ('suspended', 'pending_review')
     and not exists (
       select 1
       from catalogue_item ci
       join channel_listing cl on cl.item_id = ci.id
       where ci.id = dl.item_id
         and ci.active
         and cl.channel = 'shop'
         and cl.visible
         and coalesce(cl.price_override, ci.base_price) is not null
     );

  -- Being listed is what earns the entitlement. It is never taken back
  -- here, because a shop that empties for a week has not lost the right to
  -- be found (DSC-001).
  insert into entitlement (business_id, product_set_key, source, status, grant_reason)
  select p_business, 'discover', 'free_start', 'active',
         'eligible: products and a live shop'
  where not exists (
    select 1 from entitlement e
    where e.business_id = p_business and e.product_set_key = 'discover'
  );
end;
$fn$;
revoke all on function moderate_listing(jsonb) from public, anon, authenticated;
revoke all on function fix_listing(jsonb) from public, anon, authenticated;
revoke all on function decide_listing(jsonb) from public, anon, authenticated;
grant execute on function moderate_listing(jsonb) to service_role;
grant execute on function fix_listing(jsonb) to service_role;
grant execute on function decide_listing(jsonb) to service_role;
