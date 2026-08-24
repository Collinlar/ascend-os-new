-- AscendSME Connected Platform. Migration 0028: keep message variables.
--
-- WhatsApp templates take ordered parameters ({{1}}, {{2}}, ...), but the
-- engine only stored the rendered sentence. Individual values cannot be
-- recovered from a substituted string, so a template send would have had to
-- guess — and would have sent the wrong values to real customers.
--
-- The variables are now kept alongside the message, and the dispatcher
-- picks them in the template's registered order.

alter table message add column variables jsonb not null default '{}'::jsonb;

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
