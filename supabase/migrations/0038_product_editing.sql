-- AscendSME Connected Platform. Migration 0038: a product a merchant can
-- actually change, and one item that presents itself per channel
-- (CAP-004, SHP-006, POS §18.2).
--
-- Four of the eight things that define a product were write-once: name,
-- description, category and photo. The name is what a cashier reads at the
-- counter and what a customer reads online, and it was whatever a vision
-- model guessed on the day. A wrong category was wrong forever, because it
-- drives the till's filters.
--
-- channel_listing was written once at creation and never read back for
-- editing, so the three columns that exist to let one item behave
-- differently per channel were all unreachable. In particular a merchant
-- could not hide a product from their Shop while still selling it at the
-- till: active was all or nothing across every channel, which is the
-- opposite of what a shared catalogue is for.

-- ---------------------------------------------------------------------------
-- update_catalogue_item, widened.
--
-- Fields absent from the payload are left alone, so a screen that edits one
-- thing cannot blank the rest.
-- ---------------------------------------------------------------------------
create or replace function update_catalogue_item(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
  v_new_price numeric(14,2);
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_photo text;
begin
  select * into v_item from catalogue_item
  where id = (p->>'item_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'item_not_found';
  end if;

  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) < 2 then
    raise exception 'name_required';
  end if;

  if v_barcode is not null and exists (
    select 1 from catalogue_item
    where business_id = v_item.business_id
      and id <> v_item.id
      and barcode = v_barcode
  ) then
    raise exception 'barcode_taken';
  end if;

  v_new_price := coalesce(nullif(p->>'base_price', '')::numeric, v_item.base_price);
  v_photo := case when p ? 'photo_url'
                  then nullif(trim(coalesce(p->>'photo_url', '')), '')
                  else v_item.photo_url end;

  update catalogue_item
  set name = case when p ? 'name' then trim(p->>'name') else name end,
      description = case when p ? 'description'
                         then nullif(trim(coalesce(p->>'description', '')), '')
                         else description end,
      category = case when p ? 'category'
                      then nullif(trim(coalesce(p->>'category', '')), '')
                      else category end,
      photo_url = v_photo,
      base_price = v_new_price,
      barcode = case when p ? 'barcode' then v_barcode else barcode end,
      track_stock = coalesce((p->>'track_stock')::boolean, track_stock),
      active = coalesce((p->>'active')::boolean, active),
      low_stock_threshold = case
        when p ? 'low_stock_threshold'
        then nullif(p->>'low_stock_threshold', '')::numeric
        else low_stock_threshold
      end,
      updated_at = now()
  where id = v_item.id;

  -- Price history, kept whether or not anyone is looking at it yet. A sale
  -- already captures its own price, so receipts were never at risk; what was
  -- missing was any record of the shape of a merchant's pricing over time,
  -- which is exactly the operating history the readiness score is built on.
  if v_new_price is distinct from v_item.base_price and v_new_price is not null then
    insert into price_version (item_id, price, effective_from, created_by)
    values (v_item.id, v_new_price, now(), v_actor);
  end if;

  -- One picture, one meaning. The item carries the primary photo and the
  -- Shop listing carries the gallery; letting them drift means the till and
  -- the storefront show different things for the same product.
  if p ? 'photo_url' then
    update channel_listing
    set media = case when v_photo is null then '[]'::jsonb
                     else jsonb_build_array(v_photo) end
    where item_id = v_item.id and channel = 'shop';
  end if;

  return jsonb_build_object('item_id', v_item.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_channel_listing: where an item sells, and how it looks there.
--
-- Upserts, because a business that gains Shop later should not find its
-- existing products unlistable.
-- ---------------------------------------------------------------------------
create or replace function set_channel_listing(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_channel text := coalesce(p->>'channel', 'shop');
begin
  select * into v_item from catalogue_item
  where id = (p->>'item_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'item_not_found';
  end if;

  insert into channel_listing (item_id, channel, visible, price_override, description_override, media)
  values (
    v_item.id,
    v_channel,
    coalesce((p->>'visible')::boolean, true),
    nullif(p->>'price_override', '')::numeric,
    nullif(trim(coalesce(p->>'description_override', '')), ''),
    case when v_item.photo_url is null then '[]'::jsonb
         else jsonb_build_array(v_item.photo_url) end
  )
  on conflict (item_id, channel) do update
  set visible = coalesce((p->>'visible')::boolean, channel_listing.visible),
      price_override = case when p ? 'price_override'
                            then nullif(p->>'price_override', '')::numeric
                            else channel_listing.price_override end,
      description_override = case when p ? 'description_override'
                                  then nullif(trim(coalesce(p->>'description_override', '')), '')
                                  else channel_listing.description_override end;

  return jsonb_build_object('item_id', v_item.id, 'channel', v_channel);
end;
$$;

-- ---------------------------------------------------------------------------
-- business_stock_levels gains the fields the editor needs.
--
-- Dropped and recreated: the return type changes, which CREATE OR REPLACE
-- refuses.
-- ---------------------------------------------------------------------------
drop function if exists business_stock_levels(uuid, uuid);

create function business_stock_levels(p_business uuid, p_location uuid)
returns table (
  item_id uuid,
  name text,
  description text,
  category text,
  base_price numeric,
  barcode text,
  photo_url text,
  track_stock boolean,
  active boolean,
  low_stock_threshold numeric,
  quantity_on_hand numeric,
  last_movement_at timestamptz,
  shop_visible boolean,
  shop_price_override numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    ci.id, ci.name, ci.description, ci.category, ci.base_price, ci.barcode,
    ci.photo_url, ci.track_stock, ci.active, ci.low_stock_threshold,
    coalesce(sb.quantity_on_hand, 0),
    sb.last_movement_at,
    cl.visible,
    cl.price_override
  from catalogue_item ci
  left join stock_balance sb
    on sb.item_id = ci.id
   and sb.location_id = p_location
   and sb.variant_id is null
  left join channel_listing cl
    on cl.item_id = ci.id
   and cl.channel = 'shop'
  where ci.business_id = p_business
  order by ci.active desc, ci.name;
$$;

revoke all on function update_catalogue_item(jsonb) from public, anon, authenticated;
revoke all on function set_channel_listing(jsonb) from public, anon, authenticated;
revoke all on function business_stock_levels(uuid, uuid) from public, anon, authenticated;
grant execute on function update_catalogue_item(jsonb) to service_role;
grant execute on function set_channel_listing(jsonb) to service_role;
grant execute on function business_stock_levels(uuid, uuid) to service_role;
