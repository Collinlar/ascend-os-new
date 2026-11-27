-- ---------------------------------------------------------------------------
-- 0146  From seen to sold (Modules round 3, P1)
--
-- Discover has recorded that a promotion was seen and clicked since 0026,
-- and has had 'visit', 'ordered' and 'booked' in its vocabulary since then
-- too, but nothing ever wrote them: a click sent the customer to the shop
-- and the trail ended. So "orders from this campaign" and "earned per GHS 1"
-- could not be known.
--
-- Now each click carries a private reference (session_ref, made by the
-- server). The storefront and booking page keep it, and a visit, an order
-- or a booking within 7 days of the click is recorded against the click's
-- listing and campaign, with the order or booking and its amount.
--
-- Nothing here touches the evidence ledger: reach and attributed sales are
-- reported to the business and nowhere else (DSC-016, the trigger in 0026).
-- ---------------------------------------------------------------------------

alter table discover_event
  add column if not exists shop_order_id uuid references shop_order(id),
  add column if not exists service_booking_id uuid references service_booking(id),
  add column if not exists amount numeric(14,2);

create index if not exists discover_event_ref_idx on discover_event (session_ref, occurred_at desc)
  where session_ref is not null;
create index if not exists discover_event_campaign_idx on discover_event (campaign_id, occurred_at)
  where campaign_id is not null;
-- An order or a booking is attributed once, however often the page retries.
create unique index if not exists discover_event_order_once on discover_event (shop_order_id)
  where shop_order_id is not null;
create unique index if not exists discover_event_booking_once on discover_event (service_booking_id)
  where service_booking_id is not null;

-- ---------------------------------------------------------------------------
-- attribute_discover: a visit, an order or a booking that followed a click.
-- p: ref, step ('visit' | 'ordered' | 'booked'), business_id,
--    shop_order_id | service_booking_id
-- The amount is read from the order or booking, never from the request.
-- Silent when there is nothing to attribute: it must never stand between a
-- customer and their order.
-- ---------------------------------------------------------------------------
create or replace function attribute_discover(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ref text := nullif(btrim(coalesce(p->>'ref', '')), '');
  v_step text := p->>'step';
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_click discover_event%rowtype;
  v_order uuid := nullif(p->>'shop_order_id', '')::uuid;
  v_booking uuid := nullif(p->>'service_booking_id', '')::uuid;
  v_amount numeric(14,2);
begin
  if v_ref is null or length(v_ref) < 16 or v_step not in ('visit', 'ordered', 'booked') or v_business is null then
    return jsonb_build_object('attributed', false);
  end if;

  -- The latest click with this reference, on this business, in 7 days.
  select e.* into v_click
    from discover_event e
    join discover_listing l on l.id = e.listing_id
   where e.session_ref = v_ref
     and e.interaction = 'click'
     and l.business_id = v_business
     and e.occurred_at >= now() - interval '7 days'
   order by e.occurred_at desc
   limit 1;
  if not found then
    return jsonb_build_object('attributed', false);
  end if;

  if v_step = 'visit' then
    -- One visit per click and day is enough to show the step.
    if exists (select 1 from discover_event where session_ref = v_ref and interaction = 'visit'
                and occurred_at >= date_trunc('day', now())) then
      return jsonb_build_object('attributed', true, 'already', true);
    end if;
    insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref)
    values (v_click.listing_id, v_click.campaign_id, 'visit', v_click.was_promoted, v_ref);
    return jsonb_build_object('attributed', true);
  end if;

  if v_step = 'ordered' then
    select total into v_amount from shop_order where id = v_order and business_id = v_business;
    if v_amount is null then return jsonb_build_object('attributed', false); end if;
    insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref, shop_order_id, amount)
    values (v_click.listing_id, v_click.campaign_id, 'ordered', v_click.was_promoted, v_ref, v_order, v_amount)
    on conflict do nothing;
    return jsonb_build_object('attributed', true);
  end if;

  select coalesce(b.price_quoted, ci.base_price) into v_amount
    from service_booking b left join catalogue_item ci on ci.id = b.item_id
   where b.id = v_booking and b.business_id = v_business;
  if not found then return jsonb_build_object('attributed', false); end if;
  insert into discover_event (listing_id, campaign_id, interaction, was_promoted, session_ref, service_booking_id, amount)
  values (v_click.listing_id, v_click.campaign_id, 'booked', v_click.was_promoted, v_ref, v_booking, coalesce(v_amount, 0))
  on conflict do nothing;
  return jsonb_build_object('attributed', true);
end
$fn$;

revoke all on function attribute_discover(jsonb) from public, anon, authenticated;
grant execute on function attribute_discover(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- promotion_figures: what the Promotions pages show, for a business over
-- the last p_days. One row per campaign, plus the business's totals, plus
-- each campaign's days. Spend is what the Balance was actually charged.
-- ---------------------------------------------------------------------------
create or replace function promotion_figures(p_business uuid, p_days int default 30)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with since as (select now() - make_interval(days => greatest(1, least(p_days, 365))) as t),
  camp as (
    select c.id, c.status, c.budget, c.spent, c.cost_per_click, c.starts_at, c.ends_at, c.created_at,
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
      'listing_id', listing_id, 'listing_status', listing_status, 'city', city, 'category', category,
      'item_name', item_name, 'item_kind', item_kind,
      'seen', seen, 'clicks', clicks, 'visits', visits, 'orders', orders, 'bookings', bookings,
      'sales', sales, 'spent_period', spent_period) order by created_at desc) filter (where id is not null), '[]'::jsonb)
  )
  from per
$fn$;

-- One campaign's days, for its results page.
create or replace function promotion_days(p_business uuid, p_campaign uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(d order by d->>'day'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'day', to_char((e.occurred_at at time zone 'Africa/Accra')::date, 'YYYY-MM-DD'),
               'seen', count(*) filter (where e.interaction = 'impression'),
               'clicks', count(*) filter (where e.interaction = 'click'),
               'visits', count(*) filter (where e.interaction = 'visit'),
               'orders', count(*) filter (where e.interaction = 'ordered'),
               'bookings', count(*) filter (where e.interaction = 'booked'),
               'sales', coalesce(sum(e.amount) filter (where e.interaction in ('ordered', 'booked')), 0)) as d
        from discover_event e
        join discover_campaign c on c.id = e.campaign_id
       where c.id = p_campaign and c.business_id = p_business and e.was_promoted
       group by (e.occurred_at at time zone 'Africa/Accra')::date
    ) x
$fn$;

revoke all on function promotion_figures(uuid, int) from public, anon, authenticated;
revoke all on function promotion_days(uuid, uuid) from public, anon, authenticated;
grant execute on function promotion_figures(uuid, int) to service_role;
grant execute on function promotion_days(uuid, uuid) to service_role;
