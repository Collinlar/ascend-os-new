-- AscendSME Connected Platform. Migration 0046: what makes a business
-- discoverable (DSC-001, DSC-005).
--
-- Discover has had a search, click charging, campaign budgets, performance
-- reporting and an appeals path since migration 0026. It has never had a
-- single row to search. Nothing in the app or in any migration inserts a
-- discover_listing, so discover_search reads an empty table and returns
-- nothing for anybody, for every business on the platform.
--
-- The rule: a business becomes eligible once it has products and a live
-- shop. Both halves matter. A shop switched on with nothing in it is a
-- door onto an empty room, and products with no shop are not for sale to
-- anybody who finds them.
--
-- Eligibility is derived, not declared. It is maintained by triggers on
-- the three things that decide it, so a listing cannot drift out of step
-- with the shop it describes and no future code path can forget to keep
-- it honest.

-- A business has exactly one business-level row. Postgres treats NULLs as
-- distinct in a unique constraint, so unique (business_id, item_id) does
-- not stop a second one, and duplicates would show a business twice in
-- every search.
create unique index if not exists discover_listing_one_per_business
  on discover_listing (business_id)
  where item_id is null;

-- ---------------------------------------------------------------------------
-- refresh_discover_listings: recompute one business's rows from scratch.
--
-- Suspension is never touched. It is a moderation decision, and a merchant
-- who could clear it by relisting a product would make it worthless
-- (DSC-005).
-- ---------------------------------------------------------------------------
create or replace function refresh_discover_listings(p_business uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_live_shop boolean;
  v_has_products boolean;
  v_eligible boolean;
  v_city text;
begin
  select exists (
    select 1 from entitlement
    where business_id = p_business
      and product_set_key = 'shop'
      and status in ('active', 'grace')
  ) into v_live_shop;

  -- What a customer could actually buy: on the shop channel, visible, and
  -- carrying a price. The same test the storefront itself applies.
  select exists (
    select 1
    from catalogue_item ci
    join channel_listing cl
      on cl.item_id = ci.id and cl.channel = 'shop' and cl.visible
    where ci.business_id = p_business
      and ci.active
      and coalesce(cl.price_override, ci.base_price) is not null
  ) into v_has_products;

  v_eligible := v_live_shop and v_has_products;

  select city into v_city
  from location
  where business_id = p_business and active
  order by created_at
  limit 1;

  if not v_eligible then
    -- Withdrawn rather than deleted: campaigns reference listings, and a
    -- business that relists should come back rather than start again.
    update discover_listing
    set status = 'withdrawn'
    where business_id = p_business
      and status <> 'suspended';
    return;
  end if;

  -- The business itself, found by name.
  insert into discover_listing (business_id, item_id, status, city)
  values (p_business, null, 'eligible', v_city)
  on conflict (business_id) where item_id is null
  do update set status = case
                  when discover_listing.status = 'suspended' then 'suspended'
                  else 'eligible'
                end,
                city = excluded.city;

  -- One row per sellable product, so a customer searching for a thing
  -- finds the thing rather than only the shop that happens to stock it.
  insert into discover_listing (business_id, item_id, status, category, city)
  select p_business, ci.id, 'eligible', ci.category, v_city
  from catalogue_item ci
  join channel_listing cl
    on cl.item_id = ci.id and cl.channel = 'shop' and cl.visible
  where ci.business_id = p_business
    and ci.active
    and coalesce(cl.price_override, ci.base_price) is not null
  on conflict (business_id, item_id)
  do update set status = case
                  when discover_listing.status = 'suspended' then 'suspended'
                  else 'eligible'
                end,
                category = excluded.category,
                city = excluded.city;

  -- Anything that used to be sellable and is not any more.
  update discover_listing dl
  set status = 'withdrawn'
  where dl.business_id = p_business
    and dl.item_id is not null
    and dl.status <> 'suspended'
    and not exists (
      select 1
      from catalogue_item ci
      join channel_listing cl
        on cl.item_id = ci.id and cl.channel = 'shop' and cl.visible
      where ci.id = dl.item_id
        and ci.active
        and coalesce(cl.price_override, ci.base_price) is not null
    );

  -- Being found is free (DSC-001), and the listings above already achieve
  -- it: discover_search asks about status, never about entitlements. This
  -- grant is what puts /promote in reach, so a business that appears can
  -- see where it appears, appeal a suspension, and decide for itself
  -- whether to pay for placement. Campaigns still cost Ascend Balance.
  --
  -- It is never taken back. A business that stops being eligible has its
  -- listings withdrawn, and /promote then tells it so, which is more use
  -- than the page disappearing.
  if not exists (
    select 1 from entitlement
    where business_id = p_business
      and product_set_key = 'discover'
      and status in ('active', 'grace')
  ) then
    insert into entitlement (business_id, product_set_key, source, status, grant_reason)
    values (p_business, 'discover', 'free_start', 'active',
            'eligible: products and a live shop');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The three things that change the answer.
-- ---------------------------------------------------------------------------
create or replace function discover_refresh_from_item()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform refresh_discover_listings(coalesce(new.business_id, old.business_id));
  return null;
end;
$$;

create or replace function discover_refresh_from_listing()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  select business_id into v_business
  from catalogue_item
  where id = coalesce(new.item_id, old.item_id);
  if v_business is not null then
    perform refresh_discover_listings(v_business);
  end if;
  return null;
end;
$$;

create or replace function discover_refresh_from_entitlement()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Only the shop set decides eligibility, and the discover grant below
  -- must not send this round again.
  if coalesce(new.product_set_key, old.product_set_key) = 'shop' then
    perform refresh_discover_listings(coalesce(new.business_id, old.business_id));
  end if;
  return null;
end;
$$;

drop trigger if exists discover_item_changed on catalogue_item;
create trigger discover_item_changed
  after insert or update or delete on catalogue_item
  for each row execute function discover_refresh_from_item();

drop trigger if exists discover_listing_changed on channel_listing;
create trigger discover_listing_changed
  after insert or update or delete on channel_listing
  for each row execute function discover_refresh_from_listing();

drop trigger if exists discover_entitlement_changed on entitlement;
create trigger discover_entitlement_changed
  after insert or update on entitlement
  for each row execute function discover_refresh_from_entitlement();

revoke all on function refresh_discover_listings(uuid) from public, anon, authenticated;
grant execute on function refresh_discover_listings(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Everything that was already eligible and had no way to say so.
-- ---------------------------------------------------------------------------
do $$
declare
  b uuid;
begin
  for b in select id from business loop
    perform refresh_discover_listings(b);
  end loop;
end;
$$;
