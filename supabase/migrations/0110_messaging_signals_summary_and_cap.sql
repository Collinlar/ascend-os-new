-- ---------------------------------------------------------------------------
-- 0110  Communications Engine, step C5: abuse signals, the summary for the
--       Control Center, and the daily marketing cap
--
-- COMMUNICATIONS_ENGINE_PLAN.md 2.6, decision 5 approved 17 Nov 2026. Spec
-- 05 sections 9 and 13.
--
-- The daily cap. Until the signals have real data, a business may send 200
-- marketing messages a day (Ghana time, which is UTC). BVM can set another
-- figure for one business (set_messaging_limit, platform admins only, with a
-- reason). A send over the cap is refused in queue_message and recorded as
-- 'blocked_limit', like a send refused for consent or balance: never dropped
-- silently, never charged. Transactional and operational messages have no
-- cap.
--
-- messaging_summary(from, to)   per business: messages by class, cost,
--   delivered, read, failed and bounced, refused (consent, balance, limit),
--   opt-outs by reply, complaints, and the delivery and opt-out rates.
-- messaging_flags()             what BVM should look at, per business:
--   volume_spike       today more than 3 times the 7-day daily average,
--                      and more than 50
--   high_opt_out       5% or more of marketing recipients opted out in 30
--                      days, and at least 3
--   high_failure       20% or more failed or bounced in 7 days, of at least
--                      10
--   complaints         any email marked as spam in 30 days
--   bulk_to_unknown    20 or more marketing messages in 7 days to numbers
--                      that are not the business's customers
--   near_limit         today at 80% or more of the daily cap
-- open_deletion_requests()      for BVM: each request still to complete, the
--   number shown only by its last four digits, the businesses holding it,
--   and the days left of the 30.
--
-- queue_message is generated from its latest definition (0070); the one
-- edit, the cap, is counted. complete_data_deletion (0108) is regenerated
-- so that an admin whose access was revoked can no longer complete one.
--
-- Tables and columns read: message (business_id, purpose, status, cost,
-- customer_id, recipient, created_at), message_status_event (status),
-- whatsapp_reply (action, businesses), data_deletion_request, business
-- (name), platform_admin (person_id, role).
-- ---------------------------------------------------------------------------

alter type message_status add value if not exists 'blocked_limit';

create table if not exists business_messaging_limit (
  business_id uuid primary key references business(id),
  daily_marketing_cap int not null check (daily_marketing_cap >= 0),
  reason text not null,
  set_by uuid references person(id),
  updated_at timestamptz not null default now()
);
alter table business_messaging_limit enable row level security;
revoke all on business_messaging_limit from anon, authenticated;

create or replace function messaging_daily_cap(p_business uuid)
returns int language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((select daily_marketing_cap from business_messaging_limit where business_id = p_business), 200)
$fn$;

create or replace function set_messaging_limit(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_cap int := (p->>'daily_marketing_cap')::int;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
begin
  if v_admin is null or not exists (select 1 from platform_admin where person_id = v_admin and role = 'admin' and revoked_at is null) then
    raise exception 'admin_only: only a BVM platform admin can change a messaging limit';
  end if;
  if v_cap is null or v_cap < 0 then raise exception 'cap_needed: give a daily figure of 0 or more'; end if;
  if v_reason is null or length(v_reason) < 10 then raise exception 'reason_needed: say why, in at least 10 characters'; end if;
  insert into business_messaging_limit (business_id, daily_marketing_cap, reason, set_by, updated_at)
  values (v_business, v_cap, v_reason, v_admin, now())
  on conflict (business_id) do update
     set daily_marketing_cap = excluded.daily_marketing_cap, reason = excluded.reason,
         set_by = excluded.set_by, updated_at = now();
  insert into audit_log (business_id, action, entity_type, detail)
  values (v_business, 'messaging_limit.set', 'business_messaging_limit',
          jsonb_build_object('daily_marketing_cap', v_cap, 'reason', v_reason, 'set_by', v_admin));
  return jsonb_build_object('business_id', v_business, 'daily_marketing_cap', v_cap);
end
$fn$;

-- queue_message (0070), with the daily marketing cap after the consent check.
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

create or replace function messaging_summary(p_from date default (current_date - 29), p_to date default current_date)
returns table (
  business_id uuid, business_name text,
  messages bigint, transactional bigint, marketing bigint, operational bigint,
  cost numeric, delivered bigint, read bigint, failed bigint, bounced bigint,
  refused_consent bigint, refused_balance bigint, refused_limit bigint,
  opt_outs bigint, complaints bigint, delivery_rate numeric, opt_out_rate numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with m as (
    select * from message
     where created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz
  ),
  per as (
    select m.business_id,
           count(*) as messages,
           count(*) filter (where purpose::text = 'transactional') as transactional,
           count(*) filter (where purpose::text = 'marketing') as marketing,
           count(*) filter (where purpose::text = 'operational') as operational,
           coalesce(sum(cost) filter (where status::text in ('queued', 'sent', 'delivered', 'read')), 0) as cost,
           count(*) filter (where status::text in ('delivered', 'read')) as delivered,
           count(*) filter (where status::text = 'read') as read,
           count(*) filter (where status::text = 'failed') as failed,
           count(*) filter (where status::text = 'bounced') as bounced,
           count(*) filter (where status::text = 'blocked_no_consent') as refused_consent,
           count(*) filter (where status::text = 'blocked_no_balance') as refused_balance,
           count(*) filter (where status::text = 'blocked_limit') as refused_limit,
           count(distinct recipient) filter (where purpose::text = 'marketing'
                                             and status::text in ('sent', 'delivered', 'read')) as marketing_recipients,
           count(*) filter (where status::text in ('sent', 'delivered', 'read', 'failed', 'bounced')) as attempted
      from m group by m.business_id
  )
  select per.business_id, b.name, per.messages, per.transactional, per.marketing, per.operational,
         per.cost, per.delivered, per.read, per.failed, per.bounced,
         per.refused_consent, per.refused_balance, per.refused_limit,
         (select count(*) from whatsapp_reply r where r.action in ('stop', 'delete') and per.business_id = any (r.businesses)
             and r.received_at >= p_from::timestamptz and r.received_at < (p_to + 1)::timestamptz),
         (select count(*) from message_status_event e where e.business_id = per.business_id and e.status = 'complained'
             and e.received_at >= p_from::timestamptz and e.received_at < (p_to + 1)::timestamptz),
         case when per.attempted > 0 then round(per.delivered::numeric / per.attempted, 3) end,
         case when per.marketing_recipients > 0 then round(
           (select count(*) from whatsapp_reply r where r.action in ('stop', 'delete') and per.business_id = any (r.businesses)
               and r.received_at >= p_from::timestamptz and r.received_at < (p_to + 1)::timestamptz)::numeric
           / per.marketing_recipients, 3) end
    from per join business b on b.id = per.business_id
   order by per.messages desc
$fn$;

create or replace function messaging_flags()
returns table (business_id uuid, business_name text, flag text, detail text)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with day as (
    select m.business_id,
           count(*) filter (where m.created_at >= date_trunc('day', now())) as today,
           count(*) filter (where m.created_at >= date_trunc('day', now()) - interval '7 days'
                             and m.created_at < date_trunc('day', now())) / 7.0 as avg7,
           count(*) filter (where m.created_at >= date_trunc('day', now()) and m.purpose::text = 'marketing'
                             and m.status::text in ('queued', 'sent', 'delivered', 'read')) as marketing_today,
           count(*) filter (where m.created_at >= now() - interval '7 days'
                             and m.status::text in ('sent', 'delivered', 'read', 'failed', 'bounced')) as attempted7,
           count(*) filter (where m.created_at >= now() - interval '7 days' and m.status::text in ('failed', 'bounced')) as failed7,
           count(*) filter (where m.created_at >= now() - interval '7 days' and m.purpose::text = 'marketing'
                             and m.status::text in ('queued', 'sent', 'delivered', 'read')
                             and not exists (select 1 from customer c where c.business_id = m.business_id
                                              and c.phone_e164 = m.recipient)) as unknown7,
           count(distinct m.recipient) filter (where m.created_at >= now() - interval '30 days' and m.purpose::text = 'marketing'
                             and m.status::text in ('sent', 'delivered', 'read')) as recipients30
      from message m
     where m.created_at >= now() - interval '30 days'
     group by m.business_id
  ),
  signals as (
    select d.*,
           (select count(*) from whatsapp_reply r where r.action in ('stop', 'delete') and d.business_id = any (r.businesses)
               and r.received_at >= now() - interval '30 days') as opt_outs30,
           (select count(*) from message_status_event e where e.business_id = d.business_id and e.status = 'complained'
               and e.received_at >= now() - interval '30 days') as complaints30,
           messaging_daily_cap(d.business_id) as cap
      from day d
  )
  select s.business_id, b.name, f.flag, f.detail
    from signals s
    join business b on b.id = s.business_id
    cross join lateral (values
      ('volume_spike', case when s.today > 50 and s.today > 3 * s.avg7
         then s.today || ' messages today against a daily average of ' || round(s.avg7, 1) || ' this past week' end),
      ('high_opt_out', case when s.opt_outs30 >= 3 and s.recipients30 > 0 and s.opt_outs30::numeric / s.recipients30 >= 0.05
         then s.opt_outs30 || ' opt-outs from ' || s.recipients30 || ' marketing recipients in 30 days' end),
      ('high_failure', case when s.attempted7 >= 10 and s.failed7::numeric / s.attempted7 >= 0.2
         then s.failed7 || ' of ' || s.attempted7 || ' messages failed or bounced in 7 days' end),
      ('complaints', case when s.complaints30 > 0
         then s.complaints30 || ' email' || case when s.complaints30 = 1 then '' else 's' end || ' marked as spam in 30 days' end),
      ('bulk_to_unknown', case when s.unknown7 >= 20
         then s.unknown7 || ' marketing messages in 7 days to numbers that are not this business''s customers' end),
      ('near_limit', case when s.cap > 0 and s.marketing_today >= 0.8 * s.cap
         then s.marketing_today || ' of today''s ' || s.cap || ' marketing messages used' end)
    ) f(flag, detail)
   where f.detail is not null
   order by b.name, f.flag
$fn$;

create or replace function open_deletion_requests()
returns table (request_id uuid, number_ends text, requested_at timestamptz, due_by timestamptz, days_left int,
               businesses int, business_names text[])
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select r.id, '…' || right(r.phone, 4), r.requested_at, r.due_by,
         greatest(0, (r.due_by::date - current_date))::int,
         coalesce(array_length(r.businesses, 1), 0),
         (select array_agg(b.name order by b.name) from business b where b.id = any (r.businesses))
    from data_deletion_request r
   where r.status = 'received'
   order by r.due_by
$fn$;

-- complete_data_deletion (0108): a revoked admin can no longer complete one.
create or replace function complete_data_deletion(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req data_deletion_request%rowtype;
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_customers int; v_sessions int; v_messages int; v_orders int; v_bookings int;
begin
  if v_admin is null or not exists (select 1 from platform_admin where person_id = v_admin and role = 'admin' and revoked_at is null) then
    raise exception 'admin_only: only a BVM platform admin can complete a deletion';
  end if;
  select * into v_req from data_deletion_request where id = (p->>'request_id')::uuid;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status <> 'received' then
    return jsonb_build_object('request_id', v_req.id, 'already', v_req.status);
  end if;

  -- Orders and bookings stay with the business (its books); counted for BVM.
  select count(*) into v_orders from shop_order o join customer c on c.id = o.customer_id where c.phone_e164 = v_req.phone;
  select count(*) into v_bookings from service_booking b join customer c on c.id = b.customer_id where c.phone_e164 = v_req.phone;

  update customer
     set phone_e164 = null, email = null, notes = null,
         marketing_consent = false, marketing_opt_out_at = coalesce(marketing_opt_out_at, now()), updated_at = now()
   where phone_e164 = v_req.phone;
  get diagnostics v_customers = row_count;
  delete from whatsapp_session where customer_phone = v_req.phone;
  get diagnostics v_sessions = row_count;
  update message set recipient = 'removed at their request' where recipient = v_req.phone;
  get diagnostics v_messages = row_count;

  update data_deletion_request
     set status = 'completed', completed_at = now(), completed_by = v_admin,
         outcome = jsonb_build_object(
           'customer_records_cleared', v_customers, 'whatsapp_windows_removed', v_sessions,
           'message_records_cleared', v_messages,
           'kept_in_business_records', jsonb_build_object('shop_orders', v_orders, 'bookings', v_bookings),
           'note', nullif(btrim(coalesce(p->>'note', '')), ''))
   where id = v_req.id;
  insert into audit_log (action, entity_type, entity_id, detail)
  values ('data_deletion.completed', 'data_deletion_request', v_req.id,
          jsonb_build_object('completed_by', v_admin, 'customer_records_cleared', v_customers));
  return (select outcome || jsonb_build_object('request_id', id, 'status', status) from data_deletion_request where id = v_req.id);
end
$fn$;

revoke all on function messaging_daily_cap(uuid) from public, anon, authenticated;
revoke all on function set_messaging_limit(jsonb) from public, anon, authenticated;
revoke all on function messaging_summary(date, date) from public, anon, authenticated;
revoke all on function messaging_flags() from public, anon, authenticated;
revoke all on function open_deletion_requests() from public, anon, authenticated;
grant execute on function messaging_daily_cap(uuid) to service_role;
grant execute on function set_messaging_limit(jsonb) to service_role;
grant execute on function messaging_summary(date, date) to service_role;
grant execute on function messaging_flags() to service_role;
grant execute on function open_deletion_requests() to service_role;
