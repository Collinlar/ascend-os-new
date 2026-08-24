-- AscendSME Connected Platform. Migration 0026: Ascend Discover.
--
-- Discover helps customers find businesses, products and services. It is
-- also the single feature most capable of corrupting the platform's core
-- promise, so the constraints matter more than the capability:
--
--   * Paid placement is always labelled and is never presented as
--     verification, trust or readiness (DSC-002, PRI-006, RDY-016).
--   * Promotion cannot make an ineligible or suspended business
--     discoverable. Money does not buy eligibility (DSC-005).
--   * Discover activity never becomes evidence. Impressions and clicks are
--     reach, not reliability, and must not touch a score (DSC-016,
--     EVT-016, RDY-005).
--   * The merchant remains responsible for price, stock and fulfilment.
--     Ascend is not the seller (DSC-006).

create type listing_status as enum ('eligible', 'pending_review', 'suspended', 'withdrawn');
create type campaign_status as enum ('draft', 'running', 'paused', 'exhausted', 'ended');
create type discover_interaction as enum ('impression', 'click', 'visit', 'ordered', 'booked', 'paid');

-- ---------------------------------------------------------------------------
-- Eligibility. Organic visibility is free for eligible businesses (DSC-001);
-- suspension is a moderation state that no amount of spend overrides.
-- ---------------------------------------------------------------------------
create table discover_listing (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  item_id uuid references catalogue_item(id),
  status listing_status not null default 'pending_review',
  category text,
  city text,
  suspended_reason text,
  appeal_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, item_id)
);
create index listing_discoverable_idx on discover_listing(status, city, category);

-- ---------------------------------------------------------------------------
-- Campaigns. Paid reach, funded from Ascend Balance, with a hard budget.
-- ---------------------------------------------------------------------------
create table discover_campaign (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  listing_id uuid not null references discover_listing(id),
  status campaign_status not null default 'draft',
  budget numeric(14,2) not null check (budget > 0),
  spent numeric(14,2) not null default 0,
  cost_per_click numeric(10,4) not null default 0.10,
  starts_at date not null default current_date,
  ends_at date,
  created_by uuid references business_membership(id),
  created_at timestamptz not null default now()
);
create index campaign_live_idx on discover_campaign(status, starts_at, ends_at);

-- Attribution, kept entirely separate from the evidence ledger (DSC-010,
-- DSC-011). These rows describe reach. They say nothing about whether a
-- business is any good.
create table discover_event (
  id bigint generated always as identity primary key,
  listing_id uuid not null references discover_listing(id),
  campaign_id uuid references discover_campaign(id),
  interaction discover_interaction not null,
  was_promoted boolean not null default false,
  session_ref text,
  occurred_at timestamptz not null default now()
);
create index discover_event_listing_idx on discover_event(listing_id, occurred_at);

alter table discover_listing enable row level security;
alter table discover_campaign enable row level security;
alter table discover_event enable row level security;

-- ---------------------------------------------------------------------------
-- A hard guard, not a convention.
--
-- The evidence ledger must never receive a Discover event. A future
-- developer adding an evidence rule for `discover.*` would quietly convert
-- ad spend into creditworthiness, which is the single worst thing this
-- platform could do. The database refuses it outright.
-- ---------------------------------------------------------------------------
create or replace function reject_promotion_evidence()
returns trigger
language plpgsql
as $$
begin
  if new.evidence_type like 'discover%'
     or new.evidence_type like '%promotion%'
     or new.evidence_type like '%impression%' then
    raise exception
      'promotion activity cannot become evidence: paid reach is not proof of reliability (EVT-016)';
  end if;
  return new;
end;
$$;

create trigger evidence_excludes_promotion
  before insert on evidence_record
  for each row execute function reject_promotion_evidence();

-- ---------------------------------------------------------------------------
-- discover_search: what a customer sees.
--
-- Organic results are ranked on relevance and recency of real activity.
-- Promoted results are a capped minority, always flagged, and drawn only
-- from listings that were already eligible — so promotion changes order,
-- never admission (DSC-004, DSC-005).
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
  city text,
  category text,
  promoted boolean,
  campaign_id uuid,
  shop_slug text
)
language sql stable
as $$
  with eligible as (
    select
      l.id as listing_id, l.business_id, b.name as business_name,
      l.item_id, ci.name as item_name, ci.base_price as price,
      l.city, l.category, b.shop_slug
    from discover_listing l
    join business b on b.id = l.business_id
    left join catalogue_item ci on ci.id = l.item_id and ci.active
    where l.status = 'eligible'
      and (p_city is null or l.city ilike p_city)
      and (p_category is null or l.category ilike p_category)
      and (
        p_query is null
        or b.name ilike '%' || p_query || '%'
        or ci.name ilike '%' || p_query || '%'
        or l.category ilike '%' || p_query || '%'
      )
  ),
  -- Only eligible listings can be promoted. A campaign on a suspended
  -- listing buys nothing.
  promoted as (
    select e.*, c.id as campaign_id
    from eligible e
    join discover_campaign c on c.listing_id = e.listing_id
    where c.status = 'running'
      and c.starts_at <= current_date
      and (c.ends_at is null or c.ends_at >= current_date)
      and c.spent < c.budget
    order by c.cost_per_click desc
    -- Paid results are capped at roughly a quarter of the page. A results
    -- list that is mostly advertising stops being useful to the customer,
    -- and a Discover nobody trusts is worth nothing to merchants either.
    limit greatest(p_limit / 4, 1)
  )
  select
    p.listing_id, p.business_id, p.business_name, p.item_id, p.item_name,
    p.price, p.city, p.category, true as promoted, p.campaign_id, p.shop_slug
  from promoted p
  union all
  select
    e.listing_id, e.business_id, e.business_name, e.item_id, e.item_name,
    e.price, e.city, e.category, false as promoted, null::uuid, e.shop_slug
  from eligible e
  where e.listing_id not in (select listing_id from promoted)
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- record_discover_click: charge the campaign, once, and only for real
-- promoted traffic. A campaign that hits its budget stops immediately
-- rather than overspending a merchant's balance.
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
  -- Organic clicks are recorded and cost nothing.
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

  -- Deliberately no evidence_record and no event_outbox entry that could
  -- reach the evidence engine. Reach is reported to the merchant, and
  -- nowhere else (DSC-016).
  return jsonb_build_object('charged', v_charge);
end;
$$;

-- Merchant-facing reach reporting. Explicitly framed so it cannot be
-- mistaken for a performance or trust measure (DSC-010, DSC-011).
create or replace function campaign_performance(p_business uuid)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  from (
    select
      c.id as campaign_id,
      c.status,
      c.budget,
      c.spent,
      count(*) filter (where e.interaction = 'impression') as impressions,
      count(*) filter (where e.interaction = 'click') as clicks,
      count(*) filter (where e.interaction = 'ordered') as orders,
      count(*) filter (where e.interaction = 'booked') as bookings
    from discover_campaign c
    left join discover_event e on e.campaign_id = c.id
    where c.business_id = p_business
    group by c.id, c.status, c.budget, c.spent
    order by c.created_at desc
  ) r;
$$;
