-- ---------------------------------------------------------------------------
-- 0050  One name per category
--
-- A business types its own category on a product, which is right: it is
-- their catalogue and their vocabulary. Discover then grouped listings by
-- that exact string, which is wrong, because it turns one category into
-- several. Today's data has eleven distinct strings standing for five
-- actual categories:
--
--   Rice, Rice & Grains, Rice and grains, Rice and Grains   -> one thing
--   Cooking Oil, Cooking oil                                -> one thing
--   Bath & Body, Bath and body                              -> one thing
--
-- A customer tapping "Rice" was shown a quarter of the rice. That gets
-- worse with every business that joins, because every business invents its
-- own capitalisation.
--
-- The fix keeps both truths. The merchant's own words stay on their
-- catalogue item, untouched. The listing, which is derived state already,
-- carries a canonical category instead.
--
-- The taxonomy is a table rather than an enum on purpose. Ghanaian
-- merchants sell things this list has not thought of yet, and adding a
-- category or teaching it a new word should be an insert, not a migration
-- and a deploy.
-- ---------------------------------------------------------------------------

create table if not exists discover_category (
  slug text primary key,
  label text not null,
  sort_order int not null default 100,
  active boolean not null default true
);

-- What a merchant might type for a category, mapped to the real one.
-- Only needed where normalising the label is not enough: "Rice" and
-- "Rice and grains" do not normalise to the same string, but "Rice &
-- Grains" and "Rice and Grains" both do.
create table if not exists discover_category_alias (
  alias text primary key,
  slug text not null references discover_category(slug) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Normalising. Case, ampersands and punctuation are noise here: a merchant
-- writing "Bath & Body" and one writing "Bath and body" mean the same
-- shelf, and Discover should not pretend otherwise.
-- ---------------------------------------------------------------------------
create or replace function normalise_category_text(p_text text)
returns text
language sql immutable
as $fn$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          replace(lower(btrim(coalesce(p_text, ''))), '&', ' and '),
          '[^a-z0-9]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$fn$;

-- The merchant's words in, a canonical slug out, or null when nothing
-- matches. Null is deliberate: a product whose category nobody recognises
-- still appears under Everything and still answers to search. It simply
-- does not invent a shelf of its own.
create or replace function canonical_category(p_text text)
returns text
language sql stable
as $fn$
  with n as (select normalise_category_text(p_text) as t)
  select coalesce(
    -- Taught explicitly.
    (select a.slug from discover_category_alias a, n where a.alias = n.t),
    -- Or it is simply the category's own name, however it was capitalised.
    (select c.slug from discover_category c, n
      where c.active and normalise_category_text(c.label) = n.t),
    -- Or the slug itself, for anything already canonical.
    (select c.slug from discover_category c, n
      where c.active and c.slug = replace(n.t, ' ', '-'))
  );
$fn$;

-- ---------------------------------------------------------------------------
-- The taxonomy. Short on purpose. A rail of forty chips helps a customer
-- no more than four chips all meaning rice did.
-- ---------------------------------------------------------------------------
insert into discover_category (slug, label, sort_order) values
  ('groceries',         'Groceries',                10),
  ('rice-grains',       'Rice and grains',          20),
  ('cooking-oil',       'Cooking oil',              30),
  ('drinks',            'Drinks',                   40),
  ('snacks',            'Snacks',                   50),
  ('bath-body',         'Bath and body',            60),
  ('beauty-hair',       'Beauty and hair',          70),
  ('household',         'Household',                80),
  ('clothing',          'Clothing and shoes',       90),
  ('textiles',          'Textiles and fabrics',    100),
  ('phones-electronics','Phones and electronics',  110),
  ('home-furniture',    'Home and furniture',      120),
  ('baby-kids',         'Baby and kids',           130),
  ('health',            'Health and pharmacy',     140),
  ('stationery',        'Stationery and printing', 150),
  ('building-hardware', 'Building and hardware',   160),
  ('services',          'Services',                170)
on conflict (slug) do update
  set label = excluded.label, sort_order = excluded.sort_order;

-- Words Ghanaian merchants actually use, alongside the variants already in
-- the data. Stored normalised, because that is what they are looked up by.
insert into discover_category_alias (alias, slug) values
  ('rice',                  'rice-grains'),
  ('grains',                'rice-grains'),
  ('rice and cereals',      'rice-grains'),
  ('cereals',               'rice-grains'),
  ('oil',                   'cooking-oil'),
  ('oils',                  'cooking-oil'),
  ('vegetable oil',         'cooking-oil'),
  ('provisions',            'groceries'),
  ('foodstuff',             'groceries'),
  ('foodstuffs',            'groceries'),
  ('food',                  'groceries'),
  ('food and drinks',       'groceries'),
  ('supermarket',           'groceries'),
  ('beverages',             'drinks'),
  ('minerals',              'drinks'),
  ('water',                 'drinks'),
  ('soap',                  'bath-body'),
  ('toiletries',            'bath-body'),
  ('personal care',         'bath-body'),
  ('cosmetics',             'beauty-hair'),
  ('hair',                  'beauty-hair'),
  ('hair products',         'beauty-hair'),
  ('makeup',                'beauty-hair'),
  ('cleaning',              'household'),
  ('detergent',             'household'),
  ('detergents',            'household'),
  ('kitchen',               'household'),
  ('clothes',               'clothing'),
  ('fashion',               'clothing'),
  ('shoes',                 'clothing'),
  ('footwear',              'clothing'),
  ('bags',                  'clothing'),
  ('fabric',                'textiles'),
  ('fabrics',               'textiles'),
  ('cloth',                 'textiles'),
  ('electronics',           'phones-electronics'),
  ('phones',                'phones-electronics'),
  ('phone accessories',     'phones-electronics'),
  ('accessories',           'phones-electronics'),
  ('gadgets',               'phones-electronics'),
  ('furniture',             'home-furniture'),
  ('home',                  'home-furniture'),
  ('home and living',       'home-furniture'),
  ('baby',                  'baby-kids'),
  ('babies',                'baby-kids'),
  ('kids',                  'baby-kids'),
  ('children',              'baby-kids'),
  ('pharmacy',              'health'),
  ('drugs',                 'health'),
  ('medicine',              'health'),
  ('supplements',           'health'),
  ('printing',              'stationery'),
  ('books',                 'stationery'),
  ('hardware',              'building-hardware'),
  ('building materials',    'building-hardware'),
  ('tools',                 'building-hardware'),
  ('service',               'services')
on conflict (alias) do update set slug = excluded.slug;

-- ---------------------------------------------------------------------------
-- The listing now carries the canonical category. Same function as 0046,
-- with the category passed through canonical_category on the way in.
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
       and status <> 'suspended';
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
                  when discover_listing.status = 'suspended'
                    then 'suspended'::listing_status
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
                  when discover_listing.status = 'suspended'
                    then 'suspended'::listing_status
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
     and dl.status <> 'suspended'
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

-- ---------------------------------------------------------------------------
-- Search returns the category's real name, and filters on the slug.
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
  category_label text,
  promoted boolean,
  campaign_id uuid,
  shop_slug text
)
language sql stable
as $fn$
  with eligible as (
    select
      l.id as listing_id, l.business_id, b.name as business_name,
      l.item_id, ci.name as item_name,
      coalesce(cl.price_override, ci.base_price) as price,
      ci.photo_url,
      l.city, l.category, dc.label as category_label, b.shop_slug
    from discover_listing l
    join business b on b.id = l.business_id
    left join catalogue_item ci on ci.id = l.item_id and ci.active
    left join channel_listing cl
      on cl.item_id = l.item_id and cl.channel = 'shop'
    left join discover_category dc on dc.slug = l.category
    where l.status = 'eligible'
      and (p_city is null or l.city ilike p_city)
      and (p_category is null or l.category = p_category)
      and (
        p_query is null
        or b.name ilike '%' || p_query || '%'
        or ci.name ilike '%' || p_query || '%'
        -- The merchant's own wording still answers to search even when it
        -- is not the name of a category.
        or ci.category ilike '%' || p_query || '%'
        or dc.label ilike '%' || p_query || '%'
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
-- What the taxonomy has not learned yet. A merchant's word that maps to
-- nothing is not a failure, it is the next alias to add, and this makes
-- that one query rather than an archaeology exercise.
-- ---------------------------------------------------------------------------
create or replace view discover_unmapped_categories as
  select ci.category as merchant_wording,
         normalise_category_text(ci.category) as normalised,
         count(*) as items
  from catalogue_item ci
  join discover_listing dl on dl.item_id = ci.id
  where ci.category is not null
    and canonical_category(ci.category) is null
  group by 1, 2
  order by 3 desc;

-- Re-derive every listing so the canonical categories land now rather than
-- at whatever moment each business next edits a product.
do $backfill$
declare r record;
begin
  for r in select id from business loop
    perform refresh_discover_listings(r.id);
  end loop;
end
$backfill$;

-- The refresh above only rewrites listings that are currently eligible. A
-- withdrawn or suspended one keeps whatever it was last given, which until
-- a moment ago was raw merchant text, so those are canonicalised directly
-- from the item they describe.
update discover_listing dl
   set category = canonical_category(ci.category)
  from catalogue_item ci
 where ci.id = dl.item_id
   and dl.category is distinct from canonical_category(ci.category);

-- And anything still holding a word the taxonomy does not know loses the
-- category rather than the listing. It stays in Everything and stays
-- searchable; it just does not get a shelf of its own. Whatever lands here
-- shows up in discover_unmapped_categories as the next alias to add.
update discover_listing
   set category = null
 where category is not null
   and category not in (select slug from discover_category);

-- ---------------------------------------------------------------------------
-- Now that every listing carries a canonical category or none, say so in
-- the schema. This is what stops the fragmentation coming back: a listing
-- can no longer hold a category that is not in the taxonomy, whatever a
-- future code path tries to write.
--
-- It has to come after the backfill, because the raw merchant strings that
-- were sitting here a moment ago would all violate it.
--
-- Retiring a category sets its listings loose rather than deleting them.
-- A shelf being renamed is not a reason for a product to vanish.
-- ---------------------------------------------------------------------------
alter table discover_listing
  drop constraint if exists discover_listing_category_fkey;

alter table discover_listing
  add constraint discover_listing_category_fkey
  foreign key (category) references discover_category(slug) on delete set null;
