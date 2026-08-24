-- AscendSME Connected Platform. Migration 0030: Discover moderation, appeal
-- and campaign management (DSC-013, DSC-008, DSC-009).
--
-- Moderation without an appeal is just removal. A merchant suspended from
-- Discover loses reach they may have paid for, so they are entitled to know
-- why, to answer, and to have that answer recorded.

create table discover_moderation_event (
  id bigint generated always as identity primary key,
  listing_id uuid not null references discover_listing(id),
  from_status listing_status,
  to_status listing_status not null,
  reason text,
  note text,
  actor text not null,               -- 'platform' or the membership that appealed
  created_at timestamptz not null default now()
);
create index moderation_listing_idx on discover_moderation_event(listing_id, created_at);

alter table discover_moderation_event enable row level security;
revoke update, delete on discover_moderation_event from public;

-- ---------------------------------------------------------------------------
-- suspend_listing: removal with a reason attached, and running campaigns
-- paused rather than left burning a merchant's balance on reach they can no
-- longer receive.
-- ---------------------------------------------------------------------------
create or replace function suspend_listing(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_listing discover_listing%rowtype;
  v_paused int;
begin
  select * into v_listing from discover_listing
  where id = (p->>'listing_id')::uuid for update;
  if not found then
    raise exception 'listing_not_found';
  end if;

  if coalesce(p->>'reason', '') = '' then
    raise exception 'reason_required';
  end if;

  update discover_listing
  set status = 'suspended',
      suspended_reason = p->>'reason',
      reviewed_at = now()
  where id = v_listing.id;

  -- A suspended listing cannot be shown, so its campaigns must stop
  -- spending immediately.
  update discover_campaign
  set status = 'paused'
  where listing_id = v_listing.id and status = 'running';
  get diagnostics v_paused = row_count;

  insert into discover_moderation_event (
    listing_id, from_status, to_status, reason, actor
  ) values (
    v_listing.id, v_listing.status, 'suspended', p->>'reason', 'platform'
  );

  return jsonb_build_object(
    'listing_id', v_listing.id,
    'campaigns_paused', v_paused
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- appeal_listing: the merchant's right of reply. It does not restore the
-- listing; it puts it back in front of a human with the merchant's account
-- of what happened recorded permanently.
-- ---------------------------------------------------------------------------
create or replace function appeal_listing(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_listing discover_listing%rowtype;
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

  update discover_listing
  set status = 'pending_review',
      appeal_note = p->>'note'
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

create or replace function decide_appeal(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_listing discover_listing%rowtype;
  v_upheld boolean := coalesce((p->>'restore')::boolean, false);
begin
  select * into v_listing from discover_listing
  where id = (p->>'listing_id')::uuid for update;
  if not found then
    raise exception 'listing_not_found';
  end if;

  update discover_listing
  set status = case when v_upheld then 'eligible'::listing_status else 'suspended'::listing_status end,
      suspended_reason = case when v_upheld then null else coalesce(p->>'reason', suspended_reason) end,
      reviewed_at = now()
  where id = v_listing.id;

  insert into discover_moderation_event (
    listing_id, from_status, to_status, reason, actor
  ) values (
    v_listing.id, v_listing.status,
    case when v_upheld then 'eligible'::listing_status else 'suspended'::listing_status end,
    p->>'reason', 'platform'
  );

  return jsonb_build_object('listing_id', v_listing.id, 'restored', v_upheld);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_campaign: a merchant buying reach.
--
-- Refuses to start on a listing that is not eligible, and refuses to
-- promise reach the merchant's balance cannot fund (DSC-005, DSC-009).
-- ---------------------------------------------------------------------------
create or replace function start_campaign(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_listing discover_listing%rowtype;
  v_budget numeric(14,2) := (p->>'budget')::numeric;
  v_available numeric;
  v_campaign uuid;
begin
  select * into v_listing from discover_listing
  where id = (p->>'listing_id')::uuid;
  if not found then
    raise exception 'listing_not_found';
  end if;
  if v_listing.status <> 'eligible' then
    raise exception 'listing_not_eligible';
  end if;
  if v_budget is null or v_budget <= 0 then
    raise exception 'invalid_budget';
  end if;

  -- Reach is only sold against money that exists. Promising a budget the
  -- balance cannot cover would show a campaign that quietly never ran.
  v_available := available_balance(v_listing.business_id, 'discover.click');
  if v_available < v_budget then
    raise exception 'insufficient_balance';
  end if;

  insert into discover_campaign (
    business_id, listing_id, status, budget,
    cost_per_click, starts_at, ends_at, created_by
  ) values (
    v_listing.business_id, v_listing.id, 'running', v_budget,
    coalesce((p->>'cost_per_click')::numeric, 0.10),
    coalesce((p->>'starts_at')::date, current_date),
    nullif(p->>'ends_at', '')::date,
    nullif(p->>'created_by', '')::uuid
  )
  returning id into v_campaign;

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, payload, business_date
  ) values (
    'discover.promotion.purchased', v_listing.business_id,
    nullif(p->>'created_by', '')::uuid, 'business_web', 'discover',
    'discover_campaign', v_campaign, v_budget, 'GHS',
    jsonb_build_object('listing_id', v_listing.id),
    current_date
  );

  return jsonb_build_object('campaign_id', v_campaign, 'budget', v_budget);
end;
$$;
