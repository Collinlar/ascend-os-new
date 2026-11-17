-- ---------------------------------------------------------------------------
-- 0108  Communications Engine, step C2: replies, STOP and DELETE
--
-- COMMUNICATIONS_ENGINE_PLAN.md 2.2 and 2.3, decisions 1 to 3 approved by
-- Collins on 17 Nov 2026. Spec 05 section 6.
--
-- One Ascend WhatsApp number (decision 1), so a reply cannot name the
-- business it is for. handle_whatsapp_reply works it out:
--
--   The window. Only the business that last messaged this number has its
--   24-hour window opened. Until now every business that had the number as
--   a customer got one, so a reply to business A let business B write
--   freely too.
--
--   STOP (decision 2). The whole reply, and only the whole reply, is one of:
--   STOP, STOP ALL, UNSUBSCRIBE, CANCEL, OPT OUT, END, QUIT, GYAE (Twi for
--   stop). Marketing from every business that has the number is switched
--   off: each standing marketing consent is withdrawn, recording how, and
--   each customer row is marked opted out. Receipts, invoices and booking
--   reminders continue: they are transactional, and queue_message has never
--   asked consent for them. "Please stop the delivery" is not a STOP.
--
--   DELETE (decision 3): DELETE, DELETE ME, DELETE MY DATA, REMOVE MY DATA.
--   A deletion request is recorded for BVM to complete within 30 days,
--   marketing is switched off as for STOP, and the reply is acknowledged. It
--   erases nothing by itself.
--
--   START, SUBSCRIBE: marketing is NOT switched back on from a message. The
--   reply says to tell the business, which records consent properly.
--
-- Each keyword reply gets an acknowledgement inside the window just opened,
-- free-form, at no cost to the business, through queue_message like every
-- other message. A number no business has as a customer gets nothing back.
--
-- whatsapp_reply          every keyword reply: number, action, the keyword,
--                         the businesses it reached. The rest of a message is
--                         never stored.
-- data_deletion_request   what BVM acts on: number, when, the businesses
--                         that hold it, status, who completed it.
-- complete_data_deletion  for a platform admin: removes the person's
--                         contact details (phone, email, notes) from every
--                         customer row with that number, their WhatsApp
--                         windows, and the number from message records.
--                         Invoices, receipts and orders stay: they are the
--                         business's books (decision 3). Their names stay
--                         on those records; the count of orders and bookings
--                         linked to them is reported for BVM.
--
-- consent_record gains scope and withdrawn_source: how a withdrawal came.
--
-- Tables and columns read: customer (id, business_id, phone_e164, email,
-- notes, marketing_consent, marketing_opt_out_at), consent_record, message
-- (business_id, recipient, channel, status, created_at), whatsapp_session,
-- platform_admin (person_id, role), shop_order, service_booking
-- (customer_id).
-- ---------------------------------------------------------------------------

alter table consent_record add column if not exists scope text;
alter table consent_record add column if not exists withdrawn_source text;

create table if not exists whatsapp_reply (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone text not null,
  action text not null check (action in ('stop', 'delete', 'start')),
  keyword text not null,
  businesses uuid[] not null default '{}',
  window_business uuid references business(id),
  received_at timestamptz not null default now()
);
create index if not exists whatsapp_reply_phone on whatsapp_reply (phone, received_at);
alter table whatsapp_reply enable row level security;
revoke all on whatsapp_reply from anon, authenticated;

create table if not exists data_deletion_request (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  source text not null default 'whatsapp_reply',
  reply_id uuid references whatsapp_reply(id),
  businesses uuid[] not null default '{}',
  status text not null default 'received' check (status in ('received', 'completed', 'withdrawn')),
  requested_at timestamptz not null default now(),
  due_by timestamptz not null default now() + interval '30 days',
  completed_at timestamptz,
  completed_by uuid references person(id),
  outcome jsonb
);
create index if not exists data_deletion_request_open on data_deletion_request (status, requested_at);
alter table data_deletion_request enable row level security;
revoke all on data_deletion_request from anon, authenticated;

insert into message_template (key, purpose, channel, country_code, body, unit_cost) values
  ('reply.stopped', 'transactional', 'whatsapp', 'GH',
   'You will not get offers or promotions from businesses on AscendSME any more. Receipts, invoices and booking reminders you asked for will still come. To get offers again, tell the business.', 0),
  ('reply.deletion_received', 'transactional', 'whatsapp', 'GH',
   'We have your request to delete your details. We will complete it within 30 days and let you know. Receipts and invoices a business must keep for tax stay with that business.', 0),
  ('reply.start', 'transactional', 'whatsapp', 'GH',
   'To get offers again, tell the business directly and they will record that you agreed. We do not switch offers back on from a message.', 0)
on conflict (key) do nothing;

create or replace function whatsapp_reply_action(p_text text)
returns text
language sql immutable
as $fn$
  select case
    when t in ('STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'OPT OUT', 'OPTOUT', 'END', 'QUIT', 'GYAE') then 'stop'
    when t in ('DELETE', 'DELETE ME', 'DELETE MY DATA', 'REMOVE MY DATA') then 'delete'
    when t in ('START', 'SUBSCRIBE', 'UNSTOP') then 'start'
  end
  from (select btrim(regexp_replace(upper(coalesce(p_text, '')), '[^A-Z ]+', ' ', 'g')) as raw) r,
       lateral (select regexp_replace(r.raw, ' +', ' ', 'g') as t) x
$fn$;

create or replace function handle_whatsapp_reply(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_phone text := p->>'phone';
  v_ref text := nullif(p->>'provider_message_id', '');
  v_action text := whatsapp_reply_action(p->>'text');
  v_window uuid;
  v_window_customer uuid;
  v_businesses uuid[];
  v_reply uuid;
  v_request uuid;
  v_ack text;
  c record;
begin
  if v_phone is null or v_phone = '' then return jsonb_build_object('ignored', true, 'reason', 'no_number'); end if;
  if v_ref is not null and exists (select 1 from whatsapp_reply where provider_message_id = v_ref) then
    return jsonb_build_object('duplicate', true);
  end if;

  select array_agg(distinct business_id) into v_businesses from customer where phone_e164 = v_phone;

  -- The window opens for the business that last messaged this number.
  select m.business_id into v_window
    from message m
   where m.recipient = v_phone and m.channel = 'whatsapp'
     and m.status in ('queued', 'sent', 'delivered', 'read')
     and m.business_id = any (coalesce(v_businesses, '{}'))
   order by m.created_at desc limit 1;
  if v_window is not null then
    perform open_whatsapp_window(jsonb_build_object('business_id', v_window, 'customer_phone', v_phone));
    select id into v_window_customer from customer
     where business_id = v_window and phone_e164 = v_phone order by created_at limit 1;
  end if;

  if v_action is null then
    return jsonb_build_object('action', 'none', 'window_business', v_window);
  end if;

  insert into whatsapp_reply (provider_message_id, phone, action, keyword, businesses, window_business)
  values (coalesce(v_ref, 'no-ref-' || gen_random_uuid()), v_phone, v_action,
          upper(btrim(p->>'text')), coalesce(v_businesses, '{}'), v_window)
  returning id into v_reply;

  if v_action in ('stop', 'delete') then
    for c in select id, business_id from customer where phone_e164 = v_phone loop
      update consent_record
         set withdrawn_at = now(), withdrawn_source = 'whatsapp_reply', scope = coalesce(scope, 'business')
       where customer_id = c.id and purpose = 'marketing' and withdrawn_at is null;
      update customer
         set marketing_consent = false, marketing_opt_out_at = coalesce(marketing_opt_out_at, now()), updated_at = now()
       where id = c.id;
    end loop;
  end if;

  if v_action = 'delete' then
    select id into v_request from data_deletion_request where phone = v_phone and status = 'received' limit 1;
    if v_request is null then
      insert into data_deletion_request (phone, reply_id, businesses)
      values (v_phone, v_reply, coalesce(v_businesses, '{}'))
      returning id into v_request;
    end if;
  end if;

  -- The acknowledgement, inside the window just opened, through the one send path.
  v_ack := case v_action when 'stop' then 'reply.stopped' when 'delete' then 'reply.deletion_received' else 'reply.start' end;
  if v_window is not null then
    begin
      perform queue_message(jsonb_build_object(
        'business_id', v_window, 'customer_id', v_window_customer, 'recipient', v_phone,
        'template_key', v_ack, 'client_ref', 'reply:' || v_reply::text,
        'source_entity_type', 'whatsapp_reply', 'source_entity_id', v_reply));
    exception when others then
      -- The opt-out stands even if the acknowledgement cannot be queued.
      null;
    end;
  end if;

  return jsonb_build_object('action', v_action, 'reply_id', v_reply, 'businesses', coalesce(array_length(v_businesses, 1), 0),
                            'window_business', v_window, 'deletion_request', v_request,
                            'acknowledged', v_window is not null);
end
$fn$;

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
  if v_admin is null or not exists (select 1 from platform_admin where person_id = v_admin and role = 'admin') then
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

revoke all on function whatsapp_reply_action(text) from public, anon, authenticated;
revoke all on function handle_whatsapp_reply(jsonb) from public, anon, authenticated;
revoke all on function complete_data_deletion(jsonb) from public, anon, authenticated;
grant execute on function whatsapp_reply_action(text) to service_role;
grant execute on function handle_whatsapp_reply(jsonb) to service_role;
grant execute on function complete_data_deletion(jsonb) to service_role;
