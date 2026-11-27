-- ---------------------------------------------------------------------------
-- 0147  New campaign (Modules round 3, P2)
--
-- The design's New campaign: what to promote (Product, Service, Shop or
-- Location Boost), who should see it (near which of the business's places,
-- how far, and what people are looking for), a daily budget and a length,
-- an estimate, and review before it goes live.
--
-- Decision 1: a daily budget, charged only for days it runs. Clicks are
-- still charged one by one at the campaign's rate, but never past the day's
-- budget: once a day's budget is used, the campaign rests until tomorrow.
-- So "most you will pay" is the daily budget times the days.
--
-- Decision 2: "People looking for" are words the business chooses; a
-- search that matches one shows the campaign. Nothing about any person is
-- used. Places and radius are kept with the campaign; until Discover knows
-- where a customer is, a campaign shows to people searching in its places'
-- cities.
--
-- Decision 3: an estimate only from at least 10 campaigns in the same
-- category over 60 days.
--
-- Every campaign waits for Ascend's review (Discover moderation); approval
-- starts it that day and sets its last day.
-- ---------------------------------------------------------------------------

alter table discover_campaign
  add column if not exists kind text,
  add column if not exists daily_budget numeric(14,2),
  add column if not exists days int,
  add column if not exists place_ids uuid[],
  add column if not exists radius_km int,
  add column if not exists interests text[],
  add column if not exists review_status text not null default 'approved',
  add column if not exists review_note text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references person(id);

alter table discover_campaign drop constraint if exists discover_campaign_kind_check;
alter table discover_campaign add constraint discover_campaign_kind_check
  check (kind is null or kind in ('product', 'service', 'shop', 'location'));
alter table discover_campaign drop constraint if exists discover_campaign_review_check;
alter table discover_campaign add constraint discover_campaign_review_check
  check (review_status in ('pending', 'approved', 'declined'));
alter table discover_campaign drop constraint if exists discover_campaign_daily_check;
alter table discover_campaign add constraint discover_campaign_daily_check
  check (daily_budget is null or (daily_budget >= 5 and daily_budget <= 1000));
alter table discover_campaign drop constraint if exists discover_campaign_days_check;
alter table discover_campaign add constraint discover_campaign_days_check
  check (days is null or days between 1 and 90);
alter table discover_campaign drop constraint if exists discover_campaign_radius_check;
alter table discover_campaign add constraint discover_campaign_radius_check
  check (radius_km is null or radius_km in (3, 5, 10));

create index if not exists campaign_review_idx on discover_campaign (submitted_at) where review_status = 'pending';

-- What a campaign has spent today, by Accra's day.
create or replace function campaign_spent_today(p_campaign uuid)
returns numeric
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(-sum(amount), 0)
    from balance_entry
   where source_entity_type = 'discover_campaign' and source_entity_id = p_campaign
     and service_key = 'discover.click'
     and (created_at at time zone 'Africa/Accra')::date = (now() at time zone 'Africa/Accra')::date
$$;

-- ---------------------------------------------------------------------------
-- create_campaign: the business submits a campaign for review.
-- p: business_id, actor_membership_id, listing_id, kind, daily_budget, days,
--    place_ids[], radius_km, interests[]
-- ---------------------------------------------------------------------------
create or replace function create_campaign(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_listing discover_listing%rowtype;
  v_item_kind text;
  v_kind text := p->>'kind';
  v_daily numeric(14,2) := nullif(p->>'daily_budget', '')::numeric;
  v_days int := nullif(p->>'days', '')::int;
  v_radius int := coalesce(nullif(p->>'radius_km', '')::int, 5);
  v_places uuid[];
  v_interests text[];
  v_campaign uuid;
begin
  perform require_permission(v_actor, v_business, array['campaigns.send']);
  if has_restriction(v_business, 'discover_listing') then raise exception 'restricted_discover'; end if;

  select * into v_listing from discover_listing where id = (p->>'listing_id')::uuid and business_id = v_business;
  if not found then raise exception 'listing_not_found'; end if;
  if v_listing.status <> 'eligible' then raise exception 'listing_not_eligible'; end if;
  select kind into v_item_kind from catalogue_item where id = v_listing.item_id;

  -- What it promotes has to match the kind of boost.
  if v_kind not in ('product', 'service', 'shop', 'location') then raise exception 'kind_invalid'; end if;
  if v_kind = 'product' and (v_listing.item_id is null or coalesce(v_item_kind, 'product') = 'service') then raise exception 'kind_mismatch'; end if;
  if v_kind = 'service' and (v_listing.item_id is null or v_item_kind <> 'service') then raise exception 'kind_mismatch'; end if;
  if v_kind in ('shop', 'location') and v_listing.item_id is not null then raise exception 'kind_mismatch'; end if;

  if v_daily is null or v_daily < 5 or v_daily > 1000 then raise exception 'daily_budget_invalid'; end if;
  if v_days is null or v_days not in (7, 14, 30) then raise exception 'days_invalid'; end if;
  if v_radius not in (3, 5, 10) then raise exception 'radius_invalid'; end if;

  -- The business's own open places, at least one.
  select array_agg(id) into v_places from location
   where business_id = v_business and active
     and id = any (coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'place_ids', '[]'::jsonb)) x), '{}'));
  if v_places is null or array_length(v_places, 1) = 0 then raise exception 'places_needed'; end if;
  if v_kind = 'location' and array_length(v_places, 1) <> 1 then raise exception 'location_boost_one_place'; end if;

  -- Words people search for: up to 8, short, without repeats.
  select array_agg(distinct w) into v_interests from (
    select lower(btrim(x)) as w from jsonb_array_elements_text(coalesce(p->'interests', '[]'::jsonb)) x
  ) t where w <> '' and length(w) <= 30;
  if coalesce(array_length(v_interests, 1), 0) > 8 then raise exception 'too_many_interests'; end if;

  -- One day's budget has to be there; it pauses when the Balance runs out.
  if available_balance(v_business, 'discover.click') < v_daily then raise exception 'insufficient_balance'; end if;

  insert into discover_campaign (
    business_id, listing_id, status, budget, cost_per_click, starts_at, ends_at, created_by,
    kind, daily_budget, days, place_ids, radius_km, interests, review_status, submitted_at
  ) values (
    v_business, v_listing.id, 'draft', v_daily * v_days, 0.10, current_date, null, v_actor,
    v_kind, v_daily, v_days, v_places, v_radius, coalesce(v_interests, '{}'), 'pending', now()
  ) returning id into v_campaign;

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, payload, business_date
  ) values (
    'discover.promotion.submitted', v_business, v_actor, 'business_web', 'discover',
    'discover_campaign', v_campaign, v_daily * v_days, 'GHS',
    jsonb_build_object('listing_id', v_listing.id, 'kind', v_kind, 'daily_budget', v_daily, 'days', v_days),
    current_date
  );

  return jsonb_build_object('campaign_id', v_campaign, 'daily_budget', v_daily, 'days', v_days, 'most', v_daily * v_days);
end
$fn$;

-- ---------------------------------------------------------------------------
-- review_campaign: Ascend approves (it starts today) or declines (nothing
-- was ever charged).
-- ---------------------------------------------------------------------------
create or replace function review_campaign(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  c discover_campaign%rowtype;
  v_listing_status text;
begin
  perform risk_admin_check(v_admin);
  select * into c from discover_campaign where id = (p->>'campaign_id')::uuid for update;
  if not found then raise exception 'campaign_not_found'; end if;
  if c.review_status <> 'pending' then
    return jsonb_build_object('campaign_id', c.id, 'already', c.review_status);
  end if;

  if p->>'decision' = 'approve' then
    select status into v_listing_status from discover_listing where id = c.listing_id;
    if v_listing_status <> 'eligible' then raise exception 'listing_not_eligible'; end if;
    update discover_campaign
       set status = 'running', review_status = 'approved', review_note = v_note,
           reviewed_at = now(), reviewed_by = v_admin,
           starts_at = (now() at time zone 'Africa/Accra')::date,
           ends_at = (now() at time zone 'Africa/Accra')::date + (coalesce(c.days, 7) - 1)
     where id = c.id;
    return jsonb_build_object('campaign_id', c.id, 'status', 'running');
  elsif p->>'decision' = 'decline' then
    if v_note is null or length(v_note) < 10 then raise exception 'note_needed: say what to change, in at least 10 characters'; end if;
    update discover_campaign
       set status = 'ended', review_status = 'declined', review_note = v_note,
           reviewed_at = now(), reviewed_by = v_admin
     where id = c.id;
    return jsonb_build_object('campaign_id', c.id, 'status', 'declined');
  end if;
  raise exception 'decision_unknown: approve or decline';
end
$fn$;

-- ---------------------------------------------------------------------------
-- record_discover_click: as 0026, with the day's budget as a ceiling.
-- ---------------------------------------------------------------------------
create or replace function record_discover_click(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_campaign discover_campaign%rowtype;
  v_listing uuid := (p->>'listing_id')::uuid;
  v_charge numeric;
  v_available numeric;
begin
  if nullif(p->>'campaign_id', '') is null then
    insert into discover_event (listing_id, interaction, was_promoted, session_ref)
    values (v_listing, 'click', false, p->>'session_ref');
    return jsonb_build_object('charged', 0);
  end if;

  select * into v_campaign from discover_campaign
  where id = (p->>'campaign_id')::uuid
  for update;

  if not found or v_campaign.status <> 'running' then
    insert into discover_event (listing_id, interaction, was_promoted, session_ref)
    values (v_listing, 'click', false, p->>'session_ref');
    return jsonb_build_object('charged', 0);
  end if;

  v_charge := least(v_campaign.cost_per_click, v_campaign.budget - v_campaign.spent);
  -- Never past the day's budget (decision 1): the rest of the day is free,
  -- and the campaign rests until tomorrow.
  if v_campaign.daily_budget is not null then
    v_charge := least(v_charge, v_campaign.daily_budget - campaign_spent_today(v_campaign.id));
    if v_charge <= 0 then
      insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref)
      values (v_listing, v_campaign.id, 'click', false, p->>'session_ref');
      return jsonb_build_object('charged', 0, 'resting_until_tomorrow', true);
    end if;
  end if;
  v_available := available_balance(v_campaign.business_id, 'discover.click');

  if v_charge <= 0 or v_available < v_charge then
    update discover_campaign set status = 'exhausted' where id = v_campaign.id;
    insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref)
    values (v_listing, v_campaign.id, 'click', false, p->>'session_ref');
    return jsonb_build_object('charged', 0, 'campaign_status', 'exhausted');
  end if;

  insert into balance_entry (
    business_id, kind, amount, currency_code, service_key,
    source_entity_type, source_entity_id
  ) values (
    v_campaign.business_id, 'deduction', -1 * v_charge, 'GHS', 'discover.click',
    'discover_campaign', v_campaign.id
  );

  update discover_campaign
  set spent = spent + v_charge,
      status = case when spent + v_charge >= budget then 'exhausted'::campaign_status
                    else status end
  where id = v_campaign.id;

  insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref)
  values (v_listing, v_campaign.id, 'click', true, p->>'session_ref');

  return jsonb_build_object('charged', v_charge);
end;
$$;

-- ---------------------------------------------------------------------------
-- discover_search: as 0112, with promotion following the campaign's
-- review, its day's budget, its places' cities and its words.
-- ---------------------------------------------------------------------------
create or replace function discover_search(
  p_query text default null,
  p_city text default null,
  p_category text default null,
  p_limit int default 20
)
returns table (
  listing_id uuid,
  business_id uuid,
  business_name text,
  item_id uuid,
  item_name text,
  price numeric,
  photo_url text,
  city text,
  category text,
  category_label text,
  promoted boolean,
  campaign_id uuid,
  shop_slug text
)
language sql stable
as $fn$
  with base as (
    select
      l.id as listing_id, l.business_id, b.name as business_name,
      l.item_id, ci.name as item_name,
      coalesce(cl.price_override, ci.base_price) as price,
      ci.photo_url,
      l.city, l.category, dc.label as category_label, b.shop_slug,
      ci.category as item_category
    from discover_listing l
    join business b on b.id = l.business_id
    left join catalogue_item ci on ci.id = l.item_id and ci.active
    left join channel_listing cl
      on cl.item_id = l.item_id and cl.channel = 'shop'
    left join discover_category dc on dc.slug = l.category
    where l.status = 'eligible'
      and not has_restriction(l.business_id, 'discover_listing')
      and (p_category is null or l.category = p_category)
  ),
  -- The ordinary results: in the city asked for, matching the search.
  eligible as (
    select * from base
    where (p_city is null or city ilike p_city)
      and (p_query is null
       or business_name ilike '%' || p_query || '%'
       or item_name ilike '%' || p_query || '%'
       or item_category ilike '%' || p_query || '%'
       or category_label ilike '%' || p_query || '%')
  ),
  -- Only eligible listings can be promoted, only after review, only within
  -- the day's budget, only in the campaign's places' cities, and, when the
  -- customer searched, only when the search matches the listing or one of
  -- the words the business chose.
  promoted as (
    select e.listing_id, e.business_id, e.business_name, e.item_id, e.item_name,
           e.price, e.photo_url, e.city, e.category, e.category_label, e.shop_slug,
           c.id as campaign_id, c.cost_per_click
    from base e
    join discover_campaign c on c.listing_id = e.listing_id
    where c.status = 'running'
      and c.review_status = 'approved'
      and c.starts_at <= current_date
      and (c.ends_at is null or c.ends_at >= current_date)
      and c.spent < c.budget
      and (c.daily_budget is null or campaign_spent_today(c.id) < c.daily_budget)
      -- A campaign's places decide its city, so a Kumasi branch's boost
      -- shows in Kumasi even when the listing itself says Accra.
      and (p_city is null
           or (c.place_ids is null and e.city ilike p_city)
           or exists (select 1 from location lo where lo.id = any (c.place_ids) and lo.city ilike p_city))
      and (
        p_query is null
        or e.business_name ilike '%' || p_query || '%'
        or e.item_name ilike '%' || p_query || '%'
        or e.item_category ilike '%' || p_query || '%'
        or e.category_label ilike '%' || p_query || '%'
        or exists (select 1 from unnest(coalesce(c.interests, '{}')) w
                    where p_query ilike '%' || w || '%' or w ilike '%' || p_query || '%')
      )
    order by c.cost_per_click desc
    -- Paid results stay about a quarter of the page (0026).
    limit greatest(p_limit / 4, 1)
  )
  select
    p.listing_id, p.business_id, p.business_name, p.item_id, p.item_name,
    p.price, p.photo_url, p.city, p.category, p.category_label,
    true as promoted, p.campaign_id, p.shop_slug
  from promoted p
  union all
  select
    e.listing_id, e.business_id, e.business_name, e.item_id, e.item_name,
    e.price, e.photo_url, e.city, e.category, e.category_label,
    false as promoted, null::uuid, e.shop_slug
  from eligible e
  where e.listing_id not in (select listing_id from promoted)
  limit p_limit;
$fn$;

-- ---------------------------------------------------------------------------
-- promotion_estimate: decision 3. From at least 10 campaigns in the same
-- category over 60 days, what a GHS spent reached and how many clicked,
-- for the middle half of them. Null when there are fewer.
-- ---------------------------------------------------------------------------
create or replace function promotion_estimate(p_category text, p_daily numeric, p_days int)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with alike as (
    select c.id, c.spent,
           (select count(*) from discover_event e where e.campaign_id = c.id and e.interaction = 'impression' and e.was_promoted) as seen,
           (select count(*) from discover_event e where e.campaign_id = c.id and e.interaction = 'click' and e.was_promoted) as clicks
      from discover_campaign c
      join discover_listing l on l.id = c.listing_id
     where c.spent > 0
       and c.created_at >= now() - interval '60 days'
       and (p_category is null or l.category = p_category)
  ),
  rates as (
    select seen / spent as seen_per_cedi, clicks / spent as clicks_per_cedi from alike
  )
  select case when (select count(*) from alike) < 10 then null else jsonb_build_object(
    'campaigns', (select count(*) from alike),
    'reach_low', round((select percentile_cont(0.25) within group (order by seen_per_cedi) from rates) * p_daily * p_days),
    'reach_high', round((select percentile_cont(0.75) within group (order by seen_per_cedi) from rates) * p_daily * p_days),
    'clicks_low', round((select percentile_cont(0.25) within group (order by clicks_per_cedi) from rates) * p_daily * p_days),
    'clicks_high', round((select percentile_cont(0.75) within group (order by clicks_per_cedi) from rates) * p_daily * p_days)
  ) end
$fn$;

-- promotion_figures (0146), now with each campaign's type, daily budget,
-- length and review.
create or replace function promotion_figures(p_business uuid, p_days int default 30)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with since as (select now() - make_interval(days => greatest(1, least(p_days, 365))) as t),
  camp as (
    select c.id, c.status, c.budget, c.spent, c.cost_per_click, c.starts_at, c.ends_at, c.created_at,
           c.kind, c.daily_budget, c.days, c.review_status, c.review_note,
           l.id as listing_id, l.city, l.category, l.status as listing_status,
           ci.name as item_name, ci.kind as item_kind
      from discover_campaign c
      join discover_listing l on l.id = c.listing_id
      left join catalogue_item ci on ci.id = l.item_id
     where c.business_id = p_business
  ),
  ev as (
    select e.campaign_id, e.interaction, e.amount, e.shop_order_id, e.service_booking_id, e.occurred_at
      from discover_event e
      join camp on camp.id = e.campaign_id, since
     where e.occurred_at >= since.t and e.was_promoted
  ),
  spend as (
    select b.source_entity_id as campaign_id, -sum(b.amount) as spent
      from balance_entry b, since
     where b.business_id = p_business and b.service_key = 'discover.click'
       and b.source_entity_type = 'discover_campaign' and b.created_at >= since.t
     group by b.source_entity_id
  ),
  per as (
    select camp.*,
           coalesce((select count(*) from ev where ev.campaign_id = camp.id and interaction = 'impression'), 0) as seen,
           coalesce((select count(*) from ev where ev.campaign_id = camp.id and interaction = 'click'), 0) as clicks,
           coalesce((select count(*) from ev where ev.campaign_id = camp.id and interaction = 'visit'), 0) as visits,
           coalesce((select count(*) from ev where ev.campaign_id = camp.id and interaction = 'ordered'), 0) as orders,
           coalesce((select count(*) from ev where ev.campaign_id = camp.id and interaction = 'booked'), 0) as bookings,
           coalesce((select sum(amount) from ev where ev.campaign_id = camp.id and interaction in ('ordered', 'booked')), 0) as sales,
           coalesce((select s.spent from spend s where s.campaign_id = camp.id), 0) as spent_period
      from camp
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'totals', jsonb_build_object(
      'seen', coalesce(sum(seen), 0), 'clicks', coalesce(sum(clicks), 0), 'visits', coalesce(sum(visits), 0),
      'orders', coalesce(sum(orders), 0), 'bookings', coalesce(sum(bookings), 0),
      'sales', coalesce(sum(sales), 0), 'spent', coalesce(sum(spent_period), 0)),
    'campaigns', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'status', status, 'budget', budget, 'spent', spent, 'cost_per_click', cost_per_click,
      'starts_at', starts_at, 'ends_at', ends_at, 'created_at', created_at,
      'kind', kind, 'daily_budget', daily_budget, 'days', days, 'review_status', review_status, 'review_note', review_note,
      'listing_id', listing_id, 'listing_status', listing_status, 'city', city, 'category', category,
      'item_name', item_name, 'item_kind', item_kind,
      'seen', seen, 'clicks', clicks, 'visits', visits, 'orders', orders, 'bookings', bookings,
      'sales', sales, 'spent_period', spent_period) order by created_at desc) filter (where id is not null), '[]'::jsonb)
  )
  from per
$fn$;

revoke all on function create_campaign(jsonb) from public, anon, authenticated;
revoke all on function review_campaign(jsonb) from public, anon, authenticated;
revoke all on function promotion_estimate(text, numeric, int) from public, anon, authenticated;
grant execute on function create_campaign(jsonb) to service_role;
grant execute on function review_campaign(jsonb) to service_role;
grant execute on function promotion_estimate(text, numeric, int) to service_role;
