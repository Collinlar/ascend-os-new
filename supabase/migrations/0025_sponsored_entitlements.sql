-- AscendSME Connected Platform. Migration 0025: sponsored entitlements.
--
-- An institution can fund setup, access and balance for a cohort of
-- businesses. The rules that make this safe for the *business* rather than
-- only convenient for the sponsor:
--
--   * Sponsorship funds access. It never buys ownership of the records
--     (INS-003, ONB-011) or owner-equivalent access (IDN-018).
--   * What happens when the money stops is defined at the start, shown to
--     the business, and honoured automatically (INS-002, XST-012).
--   * Ending sponsorship never deletes anything. Records stay readable and
--     exportable (PRI-004, ENT-008, INS-014).
--   * Sponsor credit is purpose-restricted and cannot be spent outside what
--     was funded (INS-015, ENT-005).

create type sponsorship_status as enum ('active', 'ended', 'withdrawn');

create table sponsorship (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institution(id),
  cohort_id uuid references cohort(id),
  business_id uuid not null references business(id),
  funded_product_sets text[] not null default '{}',
  -- What the business keeps, loses, and must decide when funding stops.
  -- Written at the start so it can be shown before anyone signs up.
  transition_plan jsonb not null default '{}'::jsonb,
  status sponsorship_status not null default 'active',
  starts_at date not null default current_date,
  ends_at date,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, institution_id, cohort_id)
);
create index sponsorship_business_idx on sponsorship(business_id, status);

alter table sponsorship enable row level security;

-- Sponsor money is restricted money. The restriction rides on the credit
-- itself so it cannot be lost by moving the balance around.
alter table balance_entry
  add column restricted_to text[],
  add column sponsorship_id uuid references sponsorship(id);

-- ---------------------------------------------------------------------------
-- available_balance: what a business can actually spend on a given service.
--
-- Unrestricted funds are spendable on anything. Sponsor credit only counts
-- toward services the sponsor funded (INS-015). Without this, restricted
-- money would silently behave like general money.
-- ---------------------------------------------------------------------------
create or replace function available_balance(p_business uuid, p_service_key text)
returns numeric
language sql stable
as $$
  select coalesce(sum(amount), 0)
  from balance_entry
  where business_id = p_business
    and (
      restricted_to is null
      or exists (
        select 1 from unnest(restricted_to) r
        where p_service_key = r or p_service_key like r || '%'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- queue_message now spends against the balance that is actually available
-- for the service being paid for, rather than the headline total.
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

  v_body := v_template.body;
  v_body := replace(v_body, '{{business_name}}', coalesce(v_business_name, ''));
  v_body := replace(v_body, '{{customer_name}}', coalesce(v_customer.display_name, 'there'));
  for v_pair in select key, value from jsonb_each_text(coalesce(p->'variables', '{}'::jsonb))
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
      v_service_key, 'message', v_message
    )
    returning id into v_entry;

    update message set balance_entry_id = v_entry where id = v_message;
  end if;

  return jsonb_build_object('message_id', v_message, 'status', 'queued', 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_sponsorship: fund a business, with the ending written down first.
-- ---------------------------------------------------------------------------
create or replace function create_sponsorship(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sponsorship uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_set text;
  v_sets text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p->'funded_product_sets', '[]'::jsonb))),
    '{}'
  );
  v_credit numeric := coalesce((p->>'balance_credit')::numeric, 0);
begin
  insert into sponsorship (
    institution_id, cohort_id, business_id, funded_product_sets,
    transition_plan, starts_at, ends_at
  ) values (
    (p->>'institution_id')::uuid,
    nullif(p->>'cohort_id', '')::uuid,
    v_business,
    v_sets,
    coalesce(p->'transition_plan', jsonb_build_object(
      'records', 'The business keeps every record. Nothing is deleted.',
      'export', 'The business can export its data at any time, during and after.',
      'access', 'Funded products move to the free tier unless the business chooses to pay.',
      'credit', 'Unspent sponsor credit returns to the sponsor. It does not become the business''s money.'
    )),
    coalesce((p->>'starts_at')::date, current_date),
    nullif(p->>'ends_at', '')::date
  )
  returning id into v_sponsorship;

  -- Funded product sets become entitlements marked as sponsored, so it is
  -- always clear who paid for what (ENT-015).
  foreach v_set in array v_sets
  loop
    insert into entitlement (
      business_id, product_set_key, source, status,
      starts_at, expires_at, granted_by, grant_reason
    ) values (
      v_business, v_set, 'sponsorship', 'active',
      coalesce((p->>'starts_at')::date, current_date),
      nullif(p->>'ends_at', '')::date,
      p->>'institution_id',
      'sponsored: ' || v_sponsorship::text
    );
  end loop;

  -- Sponsor credit is restricted to what the sponsor agreed to fund.
  if v_credit > 0 then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id,
      restricted_to, sponsorship_id, promo_conditions
    ) values (
      v_business, 'sponsor_credit', v_credit, 'GHS', 'sponsorship.credit',
      'sponsorship', v_sponsorship,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(p->'credit_restricted_to', '["messaging."]'::jsonb))),
        array['messaging.']
      ),
      v_sponsorship,
      jsonb_build_object('returns_to_sponsor_on_end', true)
    );
  end if;

  insert into audit_log (business_id, action, entity_type, entity_id, detail)
  values (
    v_business, 'sponsorship.created', 'sponsorship', v_sponsorship,
    jsonb_build_object('institution', p->>'institution_id', 'credit', v_credit)
  );

  return jsonb_build_object('sponsorship_id', v_sponsorship);
end;
$$;

-- ---------------------------------------------------------------------------
-- end_sponsorship: the moment that matters.
--
-- Funded access lapses. Records do not move, are not deleted, and stay
-- exportable. Unspent restricted credit returns to the sponsor rather than
-- becoming the business's money, because it never was.
-- ---------------------------------------------------------------------------
create or replace function end_sponsorship(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_sponsorship sponsorship%rowtype;
  v_unspent numeric;
  v_lapsed int;
begin
  select * into v_sponsorship from sponsorship
  where id = (p->>'sponsorship_id')::uuid
  for update;

  if not found then
    raise exception 'sponsorship_not_found';
  end if;
  if v_sponsorship.status <> 'active' then
    return jsonb_build_object('sponsorship_id', v_sponsorship.id, 'unchanged', true);
  end if;

  update sponsorship
  set status = coalesce((p->>'status')::sponsorship_status, 'ended'),
      ended_at = now()
  where id = v_sponsorship.id;

  -- Sponsored entitlements lapse into grace, not straight to nothing, so a
  -- business is not cut off mid-transaction (ENT-009).
  update entitlement
  set status = 'grace',
      grace_until = now() + interval '30 days'
  where business_id = v_sponsorship.business_id
    and source = 'sponsorship'
    and grant_reason = 'sponsored: ' || v_sponsorship.id::text
    and status = 'active';
  get diagnostics v_lapsed = row_count;

  -- Return whatever the sponsor funded and the business did not spend.
  select coalesce(sum(amount), 0) into v_unspent
  from balance_entry
  where sponsorship_id = v_sponsorship.id;

  if v_unspent > 0 then
    insert into balance_entry (
      business_id, kind, amount, currency_code, service_key,
      source_entity_type, source_entity_id, sponsorship_id, promo_conditions
    ) values (
      v_sponsorship.business_id, 'reversal', -1 * v_unspent, 'GHS',
      'sponsorship.credit_returned', 'sponsorship', v_sponsorship.id,
      v_sponsorship.id,
      jsonb_build_object('reason', 'unspent sponsor credit returned at end of sponsorship')
    );
  end if;

  insert into audit_log (business_id, action, entity_type, entity_id, detail)
  values (
    v_sponsorship.business_id, 'sponsorship.ended', 'sponsorship', v_sponsorship.id,
    jsonb_build_object(
      'entitlements_moved_to_grace', v_lapsed,
      'credit_returned', v_unspent,
      'records_deleted', 0
    )
  );

  return jsonb_build_object(
    'sponsorship_id', v_sponsorship.id,
    'entitlements_in_grace', v_lapsed,
    'credit_returned', v_unspent,
    'records_kept', true,
    'unchanged', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- What the business is told, before and after. A transition nobody can read
-- is not a transition plan.
-- ---------------------------------------------------------------------------
create or replace function sponsorship_outlook(p_business uuid)
returns jsonb
language plpgsql stable
as $$
declare
  v_sponsorship sponsorship%rowtype;
  v_credit numeric;
begin
  select * into v_sponsorship from sponsorship
  where business_id = p_business and status = 'active'
  order by created_at desc limit 1;

  if not found then
    return jsonb_build_object('sponsored', false);
  end if;

  select coalesce(sum(amount), 0) into v_credit
  from balance_entry where sponsorship_id = v_sponsorship.id;

  return jsonb_build_object(
    'sponsored', true,
    'funded_product_sets', v_sponsorship.funded_product_sets,
    'ends_at', v_sponsorship.ends_at,
    'sponsor_credit_remaining', v_credit,
    'transition_plan', v_sponsorship.transition_plan,
    'your_records', 'Yours. They stay with the business whatever happens to the funding.'
  );
end;
$$;
