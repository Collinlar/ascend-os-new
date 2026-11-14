-- ---------------------------------------------------------------------------
-- 0079  Phase 1, step 1d: the last three high-risk actions checked in the
--       database
--
-- RUN THIS ONLY AFTER THE APP DEPLOY THAT SENDS THE ACTOR.
-- These three functions did not receive the member acting, so they could not
-- check anything. The app now sends it (catalogue/items, staff/pin and
-- office/actions). Run before that deploy and these three actions refuse,
-- because the old app sends no actor: setting a product's shop price or
-- visibility, clearing a PIN, and saving a location.
--
--   set_channel_listing   catalogue.manage; prices.change when the shop price
--                         is set or cleared
--   clear_staff_pin       staff.manage; a manager's or owner's PIN needs
--                         roles.change unless it is your own. It now also
--                         requires the membership to belong to the business
--                         named, where before it cleared any membership id it
--                         was given.
--   save_location         business.settings
--
-- set_channel_listing and save_location are their latest definitions with one
-- counted insertion each. clear_staff_pin was a single SQL statement with
-- nowhere to put a check, so it becomes a small PL/pgSQL function that checks
-- first and then runs the same update, word for word. Signatures and return
-- types are unchanged.
-- ---------------------------------------------------------------------------

-- set_channel_listing (latest definition was 0038_product_editing.sql)
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

  -- 0079: changing how a product shows in the shop needs catalogue.manage,
  -- and setting or clearing its shop price needs prices.change as well.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_item.business_id, array['catalogue.manage']);
  if p ? 'price_override' then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_item.business_id, array['prices.change']);
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

-- save_location (latest definition was 0063_office_completion.sql)
create or replace function save_location(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid := nullif(p->>'location_id', '')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
begin
  if length(v_name) < 2 then
    raise exception 'location_needs_a_name';
  end if;

  -- 0079: where the business trades from is a business setting.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['business.settings']);

  if v_id is null then
    insert into location (business_id, name, address, city, region, active)
    values (
      v_business, v_name,
      nullif(btrim(coalesce(p->>'address', '')), ''),
      nullif(btrim(coalesce(p->>'city', '')), ''),
      nullif(btrim(coalesce(p->>'region', '')), ''),
      true
    )
    returning id into v_id;
  else
    update location
       set name = v_name,
           address = nullif(btrim(coalesce(p->>'address', '')), ''),
           city = nullif(btrim(coalesce(p->>'city', '')), ''),
           region = nullif(btrim(coalesce(p->>'region', '')), ''),
           active = coalesce((p->>'active')::boolean, active)
     where id = v_id and business_id = v_business;
    if not found then
      raise exception 'location_not_found';
    end if;
  end if;

  -- A business always needs somewhere to trade from. Closing the last one
  -- would leave tills and bookings pointing at nothing.
  if not exists (
    select 1 from location where business_id = v_business and active
  ) then
    raise exception 'cannot_close_the_last_location';
  end if;

  return jsonb_build_object('location_id', v_id);
end;
$fn$;

-- clear_staff_pin (latest definition was 0032_staff_pin.sql)
create or replace function clear_staff_pin(p jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_membership business_membership%rowtype;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
begin
  -- 0079: the membership must belong to the business named, and clearing a
  -- PIN needs staff.manage; a manager's or the owner's needs roles.change,
  -- unless it is your own. Before this the function cleared whatever
  -- membership it was given.
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid
    and business_id = nullif(p->>'business_id', '')::uuid;
  if not found then
    raise exception 'membership_not_found';
  end if;

  perform require_permission(v_actor, v_membership.business_id, array['staff.manage']);
  if v_membership.id is distinct from v_actor
     and exists (select 1 from role r where r.id = v_membership.role_id and r.key in ('owner', 'manager')) then
    perform require_permission(v_actor, v_membership.business_id, array['roles.change']);
  end if;

  -- The same update as 0032_staff_pin.sql, unchanged.
  update business_membership
  set staff_pin_hash = null, pin_salt = null, pin_set_at = null,
      pin_failed_attempts = 0, pin_locked_until = null
  where id = (p->>'membership_id')::uuid;
end;
$$;

revoke all on function set_channel_listing(jsonb) from public, anon, authenticated;
revoke all on function save_location(jsonb) from public, anon, authenticated;
revoke all on function clear_staff_pin(jsonb) from public, anon, authenticated;
grant execute on function set_channel_listing(jsonb) to service_role;
grant execute on function save_location(jsonb) to service_role;
grant execute on function clear_staff_pin(jsonb) to service_role;
