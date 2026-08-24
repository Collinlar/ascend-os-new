-- AscendSME Connected Platform. Migration 0015: the shared messaging engine
-- (Master PRD §20). One place owns templates, consent, delivery status,
-- cost and channel policy; POS, Shop, Services, Documents and Office all
-- send through it rather than each growing their own (MSG-008, CAP-009).

-- ---------------------------------------------------------------------------
-- Templates. Purpose decides the consent rule: a receipt is the service the
-- customer asked for, a promotion is not (MSG-002).
-- ---------------------------------------------------------------------------
create type message_purpose as enum ('transactional', 'marketing');
create type message_channel as enum ('whatsapp', 'sms', 'email', 'in_app', 'secure_link');
create type message_status as enum (
  'queued', 'sent', 'delivered', 'read', 'failed', 'blocked_no_consent', 'blocked_no_balance'
);

create table message_template (
  key text primary key,                    -- document.issued | order.confirmed | shift.summary
  purpose message_purpose not null,
  channel message_channel not null,
  country_code text references country_config(code),
  language text not null default 'en',
  -- Body carries {{variables}} the caller fills. Approved fields only
  -- (MSG-005); the engine rejects anything it was not given.
  body text not null,
  -- Third-party cost per send in local currency. Zero means Ascend absorbs
  -- it; anything above zero is disclosed and deducted (MSG-006, MON-019).
  unit_cost numeric(10,4) not null default 0,
  active boolean not null default true
);

insert into message_template (key, purpose, channel, country_code, body, unit_cost) values
  ('document.issued', 'transactional', 'whatsapp', 'GH',
   'Hello {{customer_name}}, {{business_name}} has sent you {{document_type}} {{document_number}} for {{amount}}. Open it here: {{link}}', 0.05),
  ('order.confirmed', 'transactional', 'whatsapp', 'GH',
   'Hello {{customer_name}}, {{business_name}} has confirmed your order of {{amount}}. They will reach you on this number.', 0.05),
  ('receipt.sent', 'transactional', 'whatsapp', 'GH',
   'Thank you for buying from {{business_name}}. Your receipt {{document_number}} for {{amount}} is here: {{link}}', 0.05)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Every message sent, with who, what, which template, and what happened to
-- it (MSG-004). This is also the record support reads when a merchant says
-- "my customer never got it".
-- ---------------------------------------------------------------------------
create table message (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  business_id uuid not null references business(id),
  customer_id uuid references customer(id),
  template_key text not null references message_template(key),
  channel message_channel not null,
  purpose message_purpose not null,
  recipient text not null,
  rendered_body text not null,
  status message_status not null default 'queued',
  cost numeric(10,4) not null default 0,
  balance_entry_id uuid references balance_entry(id),
  source_entity_type text,
  source_entity_id uuid,
  provider_reference text,
  failure_reason text,
  retry_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
create index message_business_idx on message(business_id, created_at);
create index message_source_idx on message(source_entity_type, source_entity_id);

alter table message enable row level security;
alter table message_template enable row level security;

-- ---------------------------------------------------------------------------
-- Secure document links (DOC-007). A customer opens a document from a
-- WhatsApp link with no account; the token is unguessable, scoped to one
-- document, and revocable.
-- ---------------------------------------------------------------------------
create table document_access_token (
  token_hash text primary key,
  document_id uuid not null references document(id),
  business_id uuid not null references business(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table document_access_token enable row level security;

-- ---------------------------------------------------------------------------
-- queue_message: the single gate every send passes through.
--
-- Order matters. Consent first, because a message the customer refused
-- should never cost the merchant money. Balance second, because a merchant
-- who cannot pay should be told before the message goes out, not after.
-- Both refusals are recorded, not silently dropped (MSG-002, MSG-006).
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
  v_balance numeric(14,2);
  v_message uuid;
  v_entry uuid;
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

  if nullif(p->>'customer_id', '') is not null then
    select * into v_customer from customer where id = (p->>'customer_id')::uuid;
  end if;

  -- Marketing needs consent; transactional messages are the service the
  -- customer already asked for.
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
        v_template.channel, v_template.purpose,
        coalesce(p->>'recipient', v_customer.phone_e164, ''), '', 'blocked_no_consent',
        'customer has not agreed to marketing messages',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'blocked_no_consent', 'duplicate', false);
    end if;
  end if;

  select name into v_business_name from business where id = (p->>'business_id')::uuid;

  -- Render from approved variables only: anything not supplied stays as a
  -- blank rather than leaking a placeholder to the customer.
  v_body := v_template.body;
  v_body := replace(v_body, '{{business_name}}', coalesce(v_business_name, ''));
  v_body := replace(v_body, '{{customer_name}}', coalesce(v_customer.display_name, 'there'));
  for v_pair in select key, value from jsonb_each_text(coalesce(p->'variables', '{}'::jsonb))
  loop
    v_body := replace(v_body, '{{' || v_pair.key || '}}', coalesce(v_pair.value, ''));
  end loop;
  v_body := regexp_replace(v_body, '\{\{[a-z_]+\}\}', '', 'g');

  -- Paid channels draw on Ascend Balance, and every deduction names what it
  -- bought (ENT-003).
  if v_template.unit_cost > 0 then
    select coalesce(sum(amount), 0) into v_balance
    from balance_entry where business_id = (p->>'business_id')::uuid;

    if v_balance < v_template.unit_cost then
      insert into message (
        client_ref, business_id, customer_id, template_key, channel, purpose,
        recipient, rendered_body, status, cost, failure_reason,
        source_entity_type, source_entity_id
      ) values (
        v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
        v_template.channel, v_template.purpose,
        coalesce(p->>'recipient', v_customer.phone_e164, ''), v_body,
        'blocked_no_balance', v_template.unit_cost,
        'not enough Ascend Balance to send this message',
        p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
      )
      returning id into v_message;
      return jsonb_build_object('message_id', v_message, 'status', 'blocked_no_balance', 'duplicate', false);
    end if;
  end if;

  insert into message (
    client_ref, business_id, customer_id, template_key, channel, purpose,
    recipient, rendered_body, status, cost,
    source_entity_type, source_entity_id
  ) values (
    v_client_ref, (p->>'business_id')::uuid, v_customer.id, v_template.key,
    v_template.channel, v_template.purpose,
    coalesce(p->>'recipient', v_customer.phone_e164, ''), v_body, 'queued',
    v_template.unit_cost,
    p->>'source_entity_type', nullif(p->>'source_entity_id', '')::uuid
  )
  returning id into v_message;

  if v_template.unit_cost > 0 then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id
    ) values (
      (p->>'business_id')::uuid, 'deduction', -1 * v_template.unit_cost, 'GHS',
      'messaging.' || v_template.key, 'message', v_message
    )
    returning id into v_entry;

    update message set balance_entry_id = v_entry where id = v_message;
  end if;

  return jsonb_build_object('message_id', v_message, 'status', 'queued', 'duplicate', false);
end;
$$;

-- A send that never reached the provider returns the money. Merchants
-- should not pay for messages that did not go (ENT-004).
create or replace function fail_message(p jsonb)
returns void
language plpgsql security definer
as $$
declare
  v_message message%rowtype;
begin
  select * into v_message from message where id = (p->>'message_id')::uuid;
  if not found then
    return;
  end if;

  update message
  set status = 'failed',
      failure_reason = p->>'reason',
      retry_count = retry_count + 1
  where id = v_message.id;

  if v_message.balance_entry_id is not null and v_message.status = 'queued' then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id, reversal_of
    ) values (
      v_message.business_id, 'reversal', v_message.cost, 'GHS',
      'messaging.refund', 'message', v_message.id, v_message.balance_entry_id
    );
  end if;
end;
$$;
