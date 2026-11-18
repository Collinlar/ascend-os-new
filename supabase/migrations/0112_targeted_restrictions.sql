-- ---------------------------------------------------------------------------
-- 0112  Risk and Trust, step R2: targeted restrictions
--
-- RISK_AND_TRUST_PLAN.md, decision 4 approved 18 Nov 2026. Spec 09 section
-- 7. Until now a business could only be stopped completely (suspension).
-- Now one thing can be limited and everything else left working.
--
-- The four controls, each enforced where the action happens:
--   payment_collection   no online payment can be started for the business's
--                        customers (payment_intent). A business topping up
--                        its own Ascend Balance is not collecting, and is not
--                        stopped.
--   refunds              no refund request (refund_request) and no till
--                        reversal (a sale written with reversal_of).
--   marketing_messages   queue_message refuses marketing, recorded as
--                        'blocked_restricted', never charged. Receipts,
--                        invoices and staff messages still go.
--   discover_listing     discover_search leaves the business out; promoted
--                        results are drawn from the same list, so promotion
--                        cannot bring it back.
--
-- business_restriction   one row per control set, with its case, who set it
--                        and why; lifted rows are kept (lifted_at, lifted_by).
-- set_business_restriction({case_id, control, reason, admin_person_id})
--   one admin, through an open case; moves the business to 'restricted' if
--   it was lower.
-- lift_business_restriction({case_id, control, reason, admin_person_id})
-- has_restriction(business, control)
--
-- Moving a business below 'restricted' (normal, monitor or review) lifts
-- every restriction it has, on the same case: a business cannot be "normal"
-- and limited at once.
--
-- Generated from their latest definitions, edits counted: queue_message
-- (0110), discover_search (0050), risk_apply_state (0111).
--
-- Tables and columns read: risk_case, business_risk, payment_intent
-- (business_id, purpose), refund_request (business_id), sale (business_id,
-- reversal_of), message, discover_listing.
-- ---------------------------------------------------------------------------

alter type message_status add value if not exists 'blocked_restricted';

create table if not exists business_restriction (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  control text not null check (control in ('payment_collection', 'refunds', 'marketing_messages', 'discover_listing')),
  case_id uuid not null references risk_case(id),
  reason text not null,
  set_by uuid not null references person(id),
  set_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references person(id),
  lift_reason text
);
create unique index if not exists business_restriction_active
  on business_restriction (business_id, control) where lifted_at is null;
alter table business_restriction enable row level security;
revoke all on business_restriction from anon, authenticated;

alter table risk_case_event drop constraint if exists risk_case_event_action_check;
alter table risk_case_event add constraint risk_case_event_action_check check (action in (
  'opened', 'note', 'state_changed', 'state_requested', 'state_confirmed', 'state_declined', 'resolved',
  'restriction_set', 'restriction_lifted'));

create or replace function has_restriction(p_business uuid, p_control text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (select 1 from business_restriction
                  where business_id = p_business and control = p_control and lifted_at is null)
$fn$;

-- queue_message (0110), with the marketing restriction after the daily cap.
create or replace function queue_message(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_template message_template%rowtype;
  v_customer customer%rowtype;
  v_business_name text;
  v_body text;
  v_pair record;
  v_balance numeric;
  v_message uuid;
  v_entry uuid;
  v_service_key text;
  v_recipient text;
  v_in_window boolean;
  v_use_template boolean;
  v_vars jsonb;
  v_client_ref text := p->>'client_ref';
  v_existing message%rowtype;
begin
  if v_client_ref is not null then
    select * into v_existing from message where client_ref = v_client_ref and business_id = (p->>'business_id')::uuid;
    if found then
      return jsonb_build_object('message_id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
    end if;
  end if;

  select * into v_template from message_template
  where key = p->>'template_key' and active;
  if not found then
    raise exception 'unknown_template';
  end if;

  v_service_key := 'messaging.' || v_template.key;

  if nullif(p->>'customer_id', '') is not null then
    select * into v_customer from customer where id = (p->>'customer_id')::uuid;
  end if;

  v_recipient := coalesce(p->>'recipient', v_customer.phone_e164, '');

  if v_template.purpose = 'marketing' then
    if v_customer.id is null
       or not coalesce(v_customer.marketing_consent, false)
       or v_customer.marketing_opt_out_at is not null then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, failure_reason,
        source_entity_type, source_entity_id
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose, v_recipient, '', 'blocked_no_consent',
        'customer has not agreed to marketing messages',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'blocked_no_consent', 'duplicate', false);
    end if;
  end if;

  -- The daily marketing cap (0110): refused and recorded, never charged.
  if v_template.purpose::text = 'marketing'
     and (select count(*) from message m
           where m.business_id = (p->>'business_id')::uuid and m.purpose::text = 'marketing'
             and m.status::text in ('queued', 'sent', 'delivered', 'read')
             and m.created_at >= date_trunc('day', now()))
         >= messaging_daily_cap((p->>'business_id')::uuid) then
    insert into message (
      client_ref, business_id, customer_id, template_key, channel, purpose,
      recipient, rendered_body, status, failure_reason,
      source_entity_type, source_entity_id
    ) values (
      v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
      v_template.channel, v_template.purpose, v_recipient, '', 'blocked_limit',
      'the daily limit of ' || messaging_daily_cap((p->>'business_id')::uuid) || ' marketing messages has been reached',
      p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
    )
    returning id into v_message;
    return jsonb_build_object('message_id', v_message, 'status', 'blocked_limit', 'duplicate', false);
  end if;

  -- A marketing restriction from a risk case (0112): refused and recorded, never charged.
  if v_template.purpose::text = 'marketing' and has_restriction((p->>'business_id')::uuid, 'marketing_messages') then
    insert into message (
      client_ref, business_id, customer_id, template_key, channel, purpose,
      recipient, rendered_body, status, failure_reason,
      source_entity_type, source_entity_id
    ) values (
      v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
      v_template.channel, v_template.purpose, v_recipient, '', 'blocked_restricted',
      'marketing messages are paused for this business by Ascend',
      p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
    )
    returning id into v_message;
    return jsonb_build_object('message_id', v_message, 'status', 'blocked_restricted', 'duplicate', false);
  end if;

  select name into v_business_name from business where id = (p->>'business_id')::uuid;

  -- Every value the template can reference, kept whole so the dispatcher
  -- can send them in the provider's required order.
  v_vars := coalesce(p->'variables', '{}'::jsonb)
    || jsonb_build_object(
         'business_name', coalesce(v_business_name, ''),
         'customer_name', coalesce(v_customer.display_name, 'there')
       );

  if v_template.channel = 'whatsapp' then
    v_in_window := in_session_window((p->>'business_id')::uuid, v_recipient);
    v_use_template := not v_in_window;

    if v_use_template and v_template.approval_status <> 'approved' then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, failure_reason,
        source_entity_type, source_entity_id, sent_in_session, used_template, variables
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose, v_recipient, '', 'failed',
        'WhatsApp will not deliver this outside a customer conversation until the template is approved',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
        false, true, v_vars
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'failed',
                                'reason', 'template_not_approved', 'duplicate', false);
    end if;
  else
    v_in_window := null;
    v_use_template := false;
  end if;

  v_body := v_template.body;
  for v_pair in select key, value from jsonb_each_text(v_vars)
  loop
    v_body := replace(v_body, '{{' || v_pair.key || '}}', coalesce(v_pair.value, ''));
  end loop;
  v_body := regexp_replace(v_body, '\{\{[a-z_]+\}\}', '', 'g');

  if v_template.unit_cost > 0 then
    v_balance := available_balance((p->>'business_id')::uuid, v_service_key);

    if v_balance < v_template.unit_cost then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, cost, failure_reason,
        source_entity_type, source_entity_id, sent_in_session, used_template, variables
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose, v_recipient, v_body,
        'blocked_no_balance', v_template.unit_cost,
        'not enough Ascend Balance to send this message',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
        v_in_window, v_use_template, v_vars
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'blocked_no_balance', 'duplicate', false);
    end if;
  end if;

  insert into message (
    client_ref, business_id, customer_id, template_key, channel, purpose,
    recipient, rendered_body, status, cost,
    source_entity_type, source_entity_id, sent_in_session, used_template, variables
  ) values (
    v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
    v_template.channel, v_template.purpose, v_recipient, v_body, 'queued',
    v_template.unit_cost,
    p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
    v_in_window, v_use_template, v_vars
  )
  returning id into v_message;

  if v_template.unit_cost > 0 then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id
    ) values (
      (p->>'business_id')::uuid, 'deduction', -1 * v_template.unit_cost, 'GHS',
      v_service_key, 'message', v_message
    )
    returning id into v_entry;

    update message set balance_entry_id = v_entry where id = v_message;
  end if;

  return jsonb_build_object(
    'message_id', v_message,
    'status', 'queued',
    'as_template', v_use_template,
    'duplicate', false
  );
end;
$$;

-- discover_search (0050), leaving out a business restricted on Discover.
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
      -- A Discover restriction from a risk case (0112) leaves the business out.
      and not has_restriction(l.business_id, 'discover_listing')
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

-- risk_apply_state (0111), lifting every restriction below 'restricted'.
create or replace function risk_apply_state(p_case risk_case, p_state text, p_admin uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from text := risk_state(p_case.business_id);
  v_switched boolean := coalesce((select switched_off_business from business_risk where business_id = p_case.business_id), false);
  v_status text;
begin
  select status into v_status from business where id = p_case.business_id;
  if p_state in ('suspended', 'terminated') then
    if v_status = 'active' then
      perform set_business_status(jsonb_build_object(
        'business_id', p_case.business_id, 'status', 'suspended', 'actor_person_id', p_admin,
        'reason', case p_state when 'terminated' then 'Terminated by Ascend: ' else 'Suspended by Ascend: ' end || p_reason));
      v_switched := true;
    end if;
  elsif v_from in ('suspended', 'terminated') and v_switched and v_status = 'suspended' then
    -- Risk switched it off, so risk switches it back on.
    perform set_business_status(jsonb_build_object(
      'business_id', p_case.business_id, 'status', 'active', 'actor_person_id', p_admin,
      'reason', 'Risk case moved to ' || p_state || ': ' || p_reason));
    v_switched := false;
  end if;
  -- Below restricted, nothing stays limited (0112).
  if p_state in ('normal', 'monitor', 'review') then
    with lifted as (
      update business_restriction
         set lifted_at = now(), lifted_by = p_admin, lift_reason = 'Moved to ' || p_state || ': ' || p_reason
       where business_id = p_case.business_id and lifted_at is null
      returning control
    )
    insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
    select p_case.id, p_case.business_id, 'restriction_lifted', control, 'Moved to ' || p_state, p_admin from lifted;
  end if;
  insert into business_risk (business_id, state, case_id, changed_by, changed_at, switched_off_business)
  values (p_case.business_id, p_state, p_case.id, p_admin, now(), v_switched)
  on conflict (business_id) do update
     set state = excluded.state, case_id = excluded.case_id, changed_by = excluded.changed_by,
         changed_at = now(), switched_off_business = excluded.switched_off_business;
  insert into risk_case_event (case_id, business_id, action, from_state, to_state, detail, by_person_id)
  values (p_case.id, p_case.business_id,
          case when p_state in ('suspended', 'terminated') then 'state_confirmed' else 'state_changed' end,
          v_from, p_state, p_reason, p_admin);
end
$fn$;


create or replace function set_business_restriction(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_control text := p->>'control';
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  c risk_case%rowtype;
  v_id uuid;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid for update;
  if not found then raise exception 'case_not_found'; end if;
  if c.status = 'resolved' then raise exception 'case_resolved: open a new case to restrict this business'; end if;
  if v_control not in ('payment_collection', 'refunds', 'marketing_messages', 'discover_listing') then
    raise exception 'control_unknown: %', coalesce(v_control, '(none)');
  end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  if has_restriction(c.business_id, v_control) then
    return jsonb_build_object('case_id', c.id, 'control', v_control, 'already', true);
  end if;
  insert into business_restriction (business_id, control, case_id, reason, set_by)
  values (c.business_id, v_control, c.id, v_reason, v_admin) returning id into v_id;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (c.id, c.business_id, 'restriction_set', v_control, v_reason, v_admin);
  if risk_state(c.business_id) in ('normal', 'monitor', 'review') then
    perform risk_apply_state(c, 'restricted', v_admin, 'Restricted: ' || v_control);
  end if;
  return jsonb_build_object('case_id', c.id, 'control', v_control, 'restriction_id', v_id, 'state', risk_state(c.business_id));
end
$fn$;

create or replace function lift_business_restriction(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_control text := p->>'control';
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  c risk_case%rowtype;
begin
  perform risk_admin_check(v_admin);
  select * into c from risk_case where id = (p->>'case_id')::uuid;
  if not found then raise exception 'case_not_found'; end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  update business_restriction set lifted_at = now(), lifted_by = v_admin, lift_reason = v_reason
   where business_id = c.business_id and control = v_control and lifted_at is null;
  if not found then return jsonb_build_object('case_id', c.id, 'control', v_control, 'not_restricted', true); end if;
  insert into risk_case_event (case_id, business_id, action, to_state, detail, by_person_id)
  values (c.id, c.business_id, 'restriction_lifted', v_control, v_reason, v_admin);
  return jsonb_build_object('case_id', c.id, 'control', v_control, 'lifted', true, 'state', risk_state(c.business_id));
end
$fn$;

-- Enforcement where the action happens.
create or replace function restriction_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_table_name = 'payment_intent' then
    if coalesce(new.purpose::text, '') <> 'balance_topup' and has_restriction(new.business_id, 'payment_collection') then
      raise exception 'restricted_payment_collection: online payments are paused for this business';
    end if;
  elsif tg_table_name = 'refund_request' then
    if has_restriction(new.business_id, 'refunds') then
      raise exception 'restricted_refunds: refunds are paused for this business by Ascend';
    end if;
  elsif tg_table_name = 'sale' then
    if new.reversal_of is not null and has_restriction(new.business_id, 'refunds') then
      raise exception 'restricted_refunds: refunds are paused for this business by Ascend';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists restriction_guard on payment_intent;
create trigger restriction_guard before insert on payment_intent for each row execute function restriction_guard();
drop trigger if exists restriction_guard on refund_request;
create trigger restriction_guard before insert on refund_request for each row execute function restriction_guard();
drop trigger if exists restriction_guard on sale;
create trigger restriction_guard before insert on sale for each row execute function restriction_guard();

revoke all on function has_restriction(uuid, text) from public, anon, authenticated;
revoke all on function set_business_restriction(jsonb) from public, anon, authenticated;
revoke all on function lift_business_restriction(jsonb) from public, anon, authenticated;
grant execute on function has_restriction(uuid, text) to service_role;
grant execute on function set_business_restriction(jsonb) to service_role;
grant execute on function lift_business_restriction(jsonb) to service_role;
