-- ---------------------------------------------------------------------------
-- 0049  Discover shows the picture
--
-- discover_search was written in 0026. Product photos arrived in 0036, ten
-- migrations later, so the function never had a photo to hand back and
-- Discover has been drawing a coloured tile with the product's initials for
-- every result. Sixteen of the thirty-eight products in the database have a
-- real photograph sitting in storage that nobody can see.
--
-- Two changes, both about showing the customer the truth:
--
--   photo_url is returned, so a product that has a picture shows it.
--
--   The price is the shop price, coalesce(price_override, base_price),
--   rather than base_price alone. 0046 decided eligibility on the shop
--   price, so a product priced only through its shop listing was admitted
--   to Discover and then displayed with no price at all. Nothing sets an
--   override today, which is exactly why it is worth closing now rather
--   than after somebody does.
--
-- Dropped first: this changes the return type, and CREATE OR REPLACE will
-- not do that.
-- ---------------------------------------------------------------------------

drop function if exists discover_search(text, text, text, int);

create function discover_search(
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
  promoted boolean,
  campaign_id uuid,
  shop_slug text
)
language sql stable
as $$
  with eligible as (
    select
      l.id as listing_id, l.business_id, b.name as business_name,
      l.item_id, ci.name as item_name,
      coalesce(cl.price_override, ci.base_price) as price,
      ci.photo_url,
      l.city, l.category, b.shop_slug
    from discover_listing l
    join business b on b.id = l.business_id
    left join catalogue_item ci on ci.id = l.item_id and ci.active
    left join channel_listing cl
      on cl.item_id = l.item_id and cl.channel = 'shop'
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
    p.price, p.photo_url, p.city, p.category, true as promoted,
    p.campaign_id, p.shop_slug
  from promoted p
  union all
  select
    e.listing_id, e.business_id, e.business_name, e.item_id, e.item_name,
    e.price, e.photo_url, e.city, e.category, false as promoted,
    null::uuid, e.shop_slug
  from eligible e
  where e.listing_id not in (select listing_id from promoted)
  limit p_limit;
$$;
