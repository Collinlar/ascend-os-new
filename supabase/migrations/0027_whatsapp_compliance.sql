-- AscendSME Connected Platform. Migration 0027: WhatsApp session window and
-- template registration.
--
-- The gap this closes: WhatsApp only permits free-form business-initiated
-- messages inside a 24-hour window opened by the customer writing first.
-- Outside it, a message must use a template the provider has pre-approved.
-- Until now the engine sent plain text regardless, so every out-of-window
-- send would have been rejected by 360dialog in production — silently, as
-- far as the merchant was concerned, because the failure looked like an
-- ordinary delivery error.
--
-- Now the engine knows the rule, and refuses to spend a merchant's balance
-- on a message the provider will not accept.

create type template_approval as enum ('draft', 'submitted', 'approved', 'rejected');

alter table message_template
  add column provider_name text,              -- the name registered with 360dialog
  add column provider_namespace text,
  add column approval_status template_approval not null default 'draft',
  add column param_order text[] not null default '{}',
  add column rejection_reason text;

-- Free-form is only legal inside the window; a template send is legal
-- either way. Templates that are not approved cannot be used at all.
alter table message
  add column sent_in_session boolean,
  add column used_template boolean not null default false;

-- ---------------------------------------------------------------------------
-- The customer service window. Opened by an inbound message from the
-- customer, and open for 24 hours from their most recent one.
-- ---------------------------------------------------------------------------
create table whatsapp_session (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  customer_phone text not null,
  last_inbound_at timestamptz not null default now(),
  window_expires_at timestamptz not null default now() + interval '24 hours',
  unique (business_id, customer_phone)
);
create index whatsapp_session_window_idx on whatsapp_session(business_id, customer_phone, window_expires_at);

alter table whatsapp_session enable row level security;

create or replace function open_whatsapp_window(p jsonb)
returns void
language plpgsql security definer
as $$
begin
  insert into whatsapp_session (business_id, customer_phone, last_inbound_at, window_expires_at)
  values (
    (p->>'business_id')::uuid,
    p->>'customer_phone',
    now(),
    now() + interval '24 hours'
  )
  on conflict (business_id, customer_phone) do update
  set last_inbound_at = now(),
      window_expires_at = now() + interval '24 hours';
end;
$$;

create or replace function in_session_window(p_business uuid, p_phone text)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from whatsapp_session
    where business_id = p_business
      and customer_phone = p_phone
      and window_expires_at > now()
  );
$$;

-- The templates shipped in migration 0015 are business-initiated by nature
-- (a document is issued, an order is confirmed), so all of them need
-- provider approval before they can be relied on out of session.
update message_template
set provider_name = replace(key, '.', '_'),
    approval_status = 'draft',
    param_order = case key
      when 'document.issued' then array['customer_name','business_name','document_type','document_number','amount','link']
      when 'order.confirmed' then array['customer_name','business_name','amount']
      when 'receipt.sent' then array['business_name','document_number','amount','link']
      else '{}'
    end
where provider_name is null;

-- ---------------------------------------------------------------------------
-- queue_message now enforces the provider's rule before spending anything.
--
-- Order of checks matters: consent, then deliverability, then money. A
-- merchant should never be charged for a message the provider was always
-- going to reject.
-- ---------------------------------------------------------------------------
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
  v_client_ref text := p->>'client_ref';
  v_existing message%rowtype;
begin
  if v_client_ref is not null then
    select * into v_existing from message where client_ref = v_client_ref;
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

  -- 1. Consent.
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

  -- 2. Deliverability. Inside the customer's 24-hour window, free text is
  --    allowed. Outside it, only an approved template will be accepted.
  if v_template.channel = 'whatsapp' then
    v_in_window := in_session_window((p->>'business_id')::uuid, v_recipient);
    v_use_template := not v_in_window;

    if v_use_template and v_template.approval_status <> 'approved' then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, failure_reason,
        source_entity_type, source_entity_id, sent_in_session, used_template
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose, v_recipient, '', 'failed',
        'WhatsApp will not deliver this outside a customer conversation until the template is approved',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
        false, true
      )
      returning id into v_message;
      -- Nothing charged: the provider was never going to accept it.
      return jsonb_build_object('message_id', v_message, 'status', 'failed',
                                'reason', 'template_not_approved', 'duplicate', false);
    end if;
  else
    v_in_window := null;
    v_use_template := false;
  end if;

  select name into v_business_name from business where id = (p->>'business_id')::uuid;

  v_body := v_template.body;
  v_body := replace(v_body, '{{business_name}}', coalesce(v_business_name, ''));
  v_body := replace(v_body, '{{customer_name}}', coalesce(v_customer.display_name, 'there'));
  for v_pair in select key, value from jsonb_each_text(coalesce(p->'variables', '{}'::jsonb))
  loop
    v_body := replace(v_body, '{{' || v_pair.key || '}}', coalesce(v_pair.value, ''));
  end loop;
  v_body := regexp_replace(v_body, '\{\{[a-z_]+\}\}', '', 'g');

  -- 3. Money, last.
  if v_template.unit_cost > 0 then
    v_balance := available_balance((p->>'business_id')::uuid, v_service_key);

    if v_balance < v_template.unit_cost then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, cost, failure_reason,
        source_entity_type, source_entity_id, sent_in_session, used_template
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose, v_recipient, v_body,
        'blocked_no_balance', v_template.unit_cost,
        'not enough Ascend Balance to send this message',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
        v_in_window, v_use_template
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'blocked_no_balance', 'duplicate', false);
    end if;
  end if;

  insert into message (
    client_ref, business_id, customer_id, template_key, channel, purpose,
    recipient, rendered_body, status, cost,
    source_entity_type, source_entity_id, sent_in_session, used_template
  ) values (
    v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
    v_template.channel, v_template.purpose, v_recipient, v_body, 'queued',
    v_template.unit_cost,
    p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid,
    v_in_window, v_use_template
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
