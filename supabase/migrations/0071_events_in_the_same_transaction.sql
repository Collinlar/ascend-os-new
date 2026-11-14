-- ---------------------------------------------------------------------------
-- 0071  An event is written with the change it describes, or not at all
--
-- Most business events are written inside the Postgres function that makes
-- the change, so the change and its event share one transaction. Three were
-- not: the app made the change, then wrote the event in a second call.
--   * completing a task: a direct update to task, then the event
--   * checking in or out: record_attendance, then the event
--   * publishing a product: the item, its shop listing and the event as
--     three separate writes
-- A failure between the calls left a change with no event (so no evidence,
-- no relay, no audit trail of it) or, for products, an item with no shop
-- listing. The architecture says events are transactional; for these three
-- it was not true.
--
-- THE CHANGE
--   complete_task             NEW. Updates the task and writes the event.
--   record_attendance         Writes its own event for check-in and
--                             check-out. Generated from its latest
--                             definition (0070) with counted edits. Also
--                             returns the existing row on a repeated request
--                             instead of a null id.
--   publish_catalogue_item    NEW. Item, shop listing and event in one go.
-- The app's publishEvent helper loses its last callers and is removed.
--
-- ROLLOUT ORDER
--   Run this migration, then deploy. Between the two, the old app code still
--   writes its own attendance event, so a check-in in that window records
--   two events. Nothing else changes until the new code is live.
--
-- Tables and columns touched (checked against the live schema):
--   task: id, business_id, status, updated_at
--   attendance_record: id, business_id, location_id, client_ref, check_out
--   catalogue_item: business_id, kind, name, description, category,
--     base_price, currency_code, ai_suggestion, ai_content_approved_at,
--     photo_url
--   channel_listing: item_id, channel, media, visible
--   event_outbox: event_type, business_id, location_id, actor_membership_id,
--     channel, product_set, entity_type, entity_id, payload, business_date
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- complete_task: done, with its event, in one transaction.
-- ---------------------------------------------------------------------------
create or replace function complete_task(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_task task%rowtype;
begin
  select * into v_task from task
  where id = (p->>'task_id')::uuid
    and business_id = (p->>'business_id')::uuid
  for update;
  if not found then
    raise exception 'task_not_found';
  end if;

  -- Tapping done twice is not a second completion.
  if v_task.status = 'done' then
    return jsonb_build_object('task_id', v_task.id, 'status', 'done', 'unchanged', true);
  end if;

  update task set status = 'done', updated_at = now() where id = v_task.id;

  insert into event_outbox (
    event_type, business_id, actor_membership_id,
    channel, product_set, entity_type, entity_id, payload, business_date
  ) values (
    'office.task.completed', v_task.business_id,
    nullif(p->>'actor_membership_id', '')::uuid,
    coalesce(nullif(p->>'channel', ''), 'business_mobile'), 'office',
    'task', v_task.id, '{}'::jsonb, current_date
  );

  return jsonb_build_object('task_id', v_task.id, 'status', 'done', 'unchanged', false);
end;
$$;

revoke all on function complete_task(jsonb) from public, anon, authenticated;
grant execute on function complete_task(jsonb) to service_role;

-- record_attendance (latest definition was 0070_idempotency_keys_per_business.sql)
create or replace function record_attendance(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_membership uuid := (p->>'membership_id')::uuid;
  v_open attendance_record%rowtype;
begin
  select * into v_open from attendance_record
  where membership_id = v_membership and check_out is null
  order by check_in desc limit 1;

  if found then
    update attendance_record set check_out = now() where id = v_open.id;
    -- The event is written here, with the change, so the record and the
    -- event either both exist or neither does (0071).
    insert into event_outbox (
      event_type, business_id, location_id, actor_membership_id,
      channel, product_set, entity_type, entity_id, payload, business_date
    ) values (
      'office.attendance.recorded', v_open.business_id,
      v_open.location_id, v_membership,
      coalesce(nullif(p->>'channel', ''), 'business_mobile'), 'office',
      'attendance_record', v_open.id,
      jsonb_build_object('action', 'checked_out'), current_date
    );
    return jsonb_build_object('record_id', v_open.id, 'action', 'checked_out');
  end if;

  insert into attendance_record (
    client_ref, business_id, location_id, membership_id, check_in, source
  ) values (
    p->>'client_ref',
    (p->>'business_id')::uuid,
    nullif(p->>'location_id', '')::uuid,
    v_membership,
    now(),
    coalesce(p->>'source', 'mobile')
  )
  on conflict (business_id, client_ref) do nothing
  returning id into v_open.id;

  -- A repeated request lands on the row it already made. It used to return
  -- a null id, and the event written afterwards from the app then failed
  -- with the check-in already saved. A replay records no second event.
  if v_open.id is null then
    select id into v_open.id from attendance_record
    where business_id = (p->>'business_id')::uuid and client_ref = p->>'client_ref';
    return jsonb_build_object('record_id', v_open.id, 'action', 'checked_in', 'duplicate', true);
  end if;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id, payload, business_date
  ) values (
    'office.attendance.recorded', (p->>'business_id')::uuid,
    nullif(p->>'location_id', '')::uuid, v_membership,
    coalesce(nullif(p->>'channel', ''), 'business_mobile'), 'office',
    'attendance_record', v_open.id,
    jsonb_build_object('action', 'checked_in'), current_date
  );

  return jsonb_build_object('record_id', v_open.id, 'action', 'checked_in');
end;
$$;

revoke all on function record_attendance(jsonb) from public, anon, authenticated;
grant execute on function record_attendance(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- publish_catalogue_item: a product, its shop listing and its event, all or
-- nothing. A product with no listing is invisible in the shop with nothing
-- to say why, which is the failure this replaces.
-- ---------------------------------------------------------------------------
create or replace function publish_catalogue_item(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
  v_price numeric := nullif(p->>'base_price', '')::numeric;
  v_item uuid;
begin
  if v_business is null then
    raise exception 'business_required';
  end if;
  if v_name is null or length(v_name) < 2 then
    raise exception 'name_required';
  end if;
  if v_price is not null and v_price <= 0 then
    raise exception 'price_must_be_positive';
  end if;

  insert into catalogue_item (
    business_id, kind, name, description, category, base_price,
    currency_code, ai_suggestion, ai_content_approved_at, photo_url
  ) values (
    v_business, 'product', v_name,
    nullif(p->>'description', ''),
    nullif(p->>'category', ''),
    v_price,
    coalesce(nullif(p->>'currency_code', ''), 'GHS'),
    case when jsonb_typeof(p->'ai_suggestion') = 'object' then p->'ai_suggestion' end,
    case when jsonb_typeof(p->'ai_suggestion') = 'object' then now() end,
    nullif(p->>'photo_url', '')
  )
  returning id into v_item;

  insert into channel_listing (item_id, channel, media, visible)
  values (
    v_item, 'shop',
    case when jsonb_typeof(p->'media') = 'array' then p->'media' else '[]'::jsonb end,
    true
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id,
    channel, product_set, entity_type, entity_id, payload, business_date
  ) values (
    'shop.catalogue.published', v_business,
    nullif(p->>'actor_membership_id', '')::uuid,
    coalesce(nullif(p->>'channel', ''), 'business_web'), 'shop',
    'catalogue_item', v_item,
    jsonb_build_object('ai_assisted', jsonb_typeof(p->'ai_suggestion') = 'object'),
    current_date
  );

  return jsonb_build_object('item_id', v_item);
end;
$$;

revoke all on function publish_catalogue_item(jsonb) from public, anon, authenticated;
grant execute on function publish_catalogue_item(jsonb) to service_role;
