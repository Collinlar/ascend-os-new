-- AscendSME Connected Platform. Migration 0036: somewhere for product
-- photos to live (SHP-002, SHP-004).
--
-- Photos were taken, shown on screen, and then dropped. The merchant
-- watched their shelf appear during setup and found monograms on the till,
-- because the picture only ever existed as a data URL in a browser tab.
--
-- Storage rather than a column: a till pulling two hundred products would
-- otherwise download megabytes of base64 over mobile data every sync, which
-- on a Ghanaian bundle is a real cost to a real person.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogue',
  'catalogue',
  -- Public read. These are product photos a merchant wants customers to
  -- see; the storefront and the till both serve them without a signed URL
  -- round trip, which also means they cache properly.
  true,
  -- Photos are downscaled in the browser before upload, so anything
  -- arriving near this ceiling is a bug or an abuse, not a product photo.
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads go through the API using the service role, which bypasses RLS, so
-- no write policy is granted to anon or authenticated here. A merchant can
-- only add a photo through a route that has already checked their session
-- and their membership of the business the photo is filed under.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'catalogue photos are publicly readable'
  ) then
    create policy "catalogue photos are publicly readable"
      on storage.objects for select
      using (bucket_id = 'catalogue');
  end if;
end;
$$;

-- The item's own record of its picture, so the till and the products page
-- do not have to join through channel_listing to know what to show. The
-- Shop listing keeps its own media array for gallery ordering.
alter table catalogue_item
  add column if not exists photo_url text;

-- The products screen and the till both read the photo through the same
-- function, so it has to hand it back.
--
-- Dropped first rather than replaced: Postgres refuses to change the return
-- type of an existing function through CREATE OR REPLACE, and this one
-- gains a column.
drop function if exists business_stock_levels(uuid, uuid);

create function business_stock_levels(p_business uuid, p_location uuid)
returns table (
  item_id uuid,
  name text,
  category text,
  base_price numeric,
  barcode text,
  photo_url text,
  track_stock boolean,
  active boolean,
  low_stock_threshold numeric,
  quantity_on_hand numeric,
  last_movement_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    ci.id, ci.name, ci.category, ci.base_price, ci.barcode, ci.photo_url,
    ci.track_stock, ci.active, ci.low_stock_threshold,
    coalesce(sb.quantity_on_hand, 0),
    sb.last_movement_at
  from catalogue_item ci
  left join stock_balance sb
    on sb.item_id = ci.id
   and sb.location_id = p_location
   and sb.variant_id is null
  where ci.business_id = p_business
  order by ci.active desc, ci.name;
$$;

revoke all on function business_stock_levels(uuid, uuid) from public, anon, authenticated;
grant execute on function business_stock_levels(uuid, uuid) to service_role;
