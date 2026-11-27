-- ---------------------------------------------------------------------------
-- 0149  Plans and billing (Modules round 3, P4)
--
-- 1. The price book at the design's prices (decision 7). Each entry now says
--    which part of the catalogue it sits in, what it switches on, and how it
--    is got: bought here ('buy'), arranged with Ascend ('ask': devices,
--    bundles, setup visits), or not built yet ('coming': CRM automation,
--    message packs, Smart Setup, verification). Nothing is sold that Ascend
--    cannot yet deliver.
-- 2. Documents Plus: a product set with the capability documents.plus.
--    Without it a document is stamped Classic, with no logo or colour, and
--    numbered the standard way. A business that set these up before they
--    had a price keeps them until 31 January 2027.
-- 3. Orders to Ascend. Until Paystack (decision 6) a business asks for
--    something here and pays by bank transfer or MoMo to Ascend's account;
--    an Ascend admin records the money and it switches on. The same tool
--    records a Balance top-up.
-- 4. Suggestions a business has dismissed, and its Account Manager
--    (decision 8), set by an admin.
--
-- Reads: price_book_entry, purchase, entitlement (0005, 0065), product_set,
-- capability, product_set_capability (0005, 0044), business_capabilities
-- (0069), record_purchase (0065), balance_entry (0005, 0025),
-- require_permission (0081), risk_admin_check (0111), document_branding,
-- document_sequence, document_prefix (0014, 0142), audit_log (0001).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The price book
-- ---------------------------------------------------------------------------
alter table price_book_entry
  add column if not exists section text,
  add column if not exists blurb text,
  add column if not exists offer_mode text not null default 'buy',
  add column if not exists product_set_key text references product_set(key),
  add column if not exists sort int not null default 100;

alter table price_book_entry drop constraint if exists price_book_entry_offer_mode_check;
alter table price_book_entry add constraint price_book_entry_offer_mode_check
  check (offer_mode in ('buy', 'ask', 'coming'));
alter table price_book_entry drop constraint if exists price_book_entry_section_check;
alter table price_book_entry add constraint price_book_entry_section_check
  check (section is null or section in ('run', 'packs', 'devices', 'grow', 'bundle', 'setup'));

insert into product_set (key, name, description) values
  ('documents_plus', 'Documents Plus', 'Your logo, colour, templates and your own numbering on every document.')
on conflict (key) do update set name = excluded.name, description = excluded.description;

insert into capability (key, name, owning_domain, class, description) values
  ('documents.plus', 'Documents Plus look', 'documents', 'advanced', 'Logo, colour, Modern and Compact templates, and your own numbering')
on conflict (key) do update
  set name = excluded.name, owning_domain = excluded.owning_domain,
      class = excluded.class, description = excluded.description;

insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('documents_plus', 'documents.plus', false)
on conflict (product_set_key, capability_key) do update set embedded = excluded.embedded;

insert into price_book_entry (country_code, sku, name, kind, amount, currency_code, duration_days, capacity,
                              section, blurb, offer_mode, product_set_key, sort, active)
values
  -- Run
  ('GH', 'documents_plus_12m',     'Documents Plus',             'duration_pass', 360,  'GHS', 365, null, 'run', 'Logo, colour, templates and your own numbering', 'buy', 'documents_plus', 10, true),
  ('GH', 'team_ops_5',             'Office Team Pass, up to 5 people',  'duration_pass', 600,  'GHS', 365, '{"staff": 5}',  'run', 'Team, approvals, attendance, leave', 'buy', 'office', 20, true),
  ('GH', 'team_ops_15',            'Office Team Pass, 6 to 15 people',  'duration_pass', 1200, 'GHS', 365, '{"staff": 15}', 'run', 'Team, approvals, attendance, leave', 'buy', 'office', 21, true),
  ('GH', 'team_ops_30',            'Office Team Pass, 16 to 30 people', 'duration_pass', 2400, 'GHS', 365, '{"staff": 30}', 'run', 'Team, approvals, attendance, leave', 'buy', 'office', 22, true),
  ('GH', 'advanced_inventory_12m', 'Multi-location inventory',   'duration_pass', 900,  'GHS', 365, null, 'run', 'Transfers and stock by branch', 'buy', 'advanced_inventory', 30, true),
  ('GH', 'crm_automation_12m',     'CRM automation, 12 months',  'duration_pass', 600,  'GHS', 365, null, 'run', 'Win-back, birthdays, follow-ups', 'coming', null, 40, true),
  ('GH', 'crm_automation_6m',      'CRM automation, 6 months',   'duration_pass', 360,  'GHS', 182, null, 'run', 'Win-back, birthdays, follow-ups', 'coming', null, 41, true),
  -- Packs
  ('GH', 'whatsapp_500',           'WhatsApp sends, 500',        'capacity', 250, 'GHS', null, '{"whatsapp_sends": 500}', 'packs', '500 messages to opted-in customers', 'coming', null, 50, true),
  ('GH', 'sms_1000',               'SMS sends, 1,000',           'capacity', 180, 'GHS', null, '{"sms_sends": 1000}', 'packs', '1,000 messages', 'coming', null, 51, true),
  ('GH', 'smart_setup_100',        'Smart Setup 100',            'capacity', 250, 'GHS', null, '{"smart_setup": 100}', 'packs', 'Turn 100 photos into products', 'coming', null, 52, true),
  -- Devices
  ('GH', 'smart_pos',              'Smart POS terminal',         'hardware', 3500, 'GHS', null, null, 'devices', 'Card, MoMo and a printer in one device', 'ask', null, 60, true),
  ('GH', 'counter_register',       'Counter Register',           'hardware', 2800, 'GHS', null, null, 'devices', 'Full till with cash drawer and scanner', 'ask', null, 61, true),
  ('GH', 'printer_58mm',           'Receipt printer, 58mm',      'hardware', 450,  'GHS', null, null, 'devices', 'Bluetooth, for receipts from a phone till', 'ask', null, 62, true),
  -- Grow and protect
  ('GH', 'enhanced_verification',  'Enhanced verification',      'verification', 150, 'GHS', null, null, 'grow', 'A stronger trust check on your business', 'coming', null, 70, true),
  ('GH', 'verified_reports_30d',   'Verified reports, one month', 'verification', 150, 'GHS', 30, null, 'grow', 'Verified reports for lenders and partners', 'coming', null, 71, true),
  -- Bundles, arranged with Ascend
  ('GH', 'bundle_grow_12m',        'Grow bundle, 12 months',     'duration_pass', 1800, 'GHS', 365, null, 'bundle', 'Bring customers back and get paid faster', 'ask', null, 80, true),
  ('GH', 'bundle_run_12m',         'Run bundle, 12 months',      'duration_pass', 3600, 'GHS', 365, null, 'bundle', 'Run several locations and a team', 'ask', null, 81, true),
  -- Setup visits
  ('GH', 'setup_starter',          'Done-for-you setup, one place',       'one_time', 500,  'GHS', null, '{"locations": 1}', 'setup', 'An Ascend field agent sets you up', 'ask', null, 90, true),
  ('GH', 'setup_multi',            'Done-for-you setup, several places',  'one_time', 1200, 'GHS', null, '{"locations": 5}', 'setup', 'An Ascend field agent sets you up', 'ask', null, 91, true)
on conflict (country_code, sku) do update
  set name = excluded.name, kind = excluded.kind, amount = excluded.amount,
      duration_days = excluded.duration_days, capacity = excluded.capacity,
      section = excluded.section, blurb = excluded.blurb, offer_mode = excluded.offer_mode,
      product_set_key = excluded.product_set_key, sort = excluded.sort, active = excluded.active;

-- Replaced by the design's catalogue: a 30-day inventory pass (now 12
-- months), product room (never enforced, so it bought nothing), the old
-- fixed boosts (campaigns since P2) and the annual Assurance.
update price_book_entry set active = false
 where country_code = 'GH'
   and sku in ('advanced_inventory_30d', 'catalogue_50', 'catalogue_250',
               'boost_product_7d', 'boost_shop_30d', 'assurance_annual');

-- ---------------------------------------------------------------------------
-- 2. Documents Plus
-- ---------------------------------------------------------------------------
create or replace function has_documents_plus(p_business uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from business_capabilities(p_business) c where c.capability_key = 'documents.plus');
$$;

-- Own numbering is part of Documents Plus.
create or replace function document_prefix_for(p_business uuid, p_type document_type)
returns text
language sql stable
as $$
  select coalesce(
    (select b.number_prefixes ->> p_type::text
       from document_branding b
      where b.business_id = p_business
        and (b.number_prefixes ->> p_type::text) ~ '^[A-Z]{2,6}$'
        and has_documents_plus(p_business)),
    document_prefix(p_type));
$$;

create or replace function next_document_number(
  p_business uuid,
  p_type document_type,
  p_period text
)
returns text
language plpgsql
as $$
declare
  v_next int;
  v_year boolean;
  v_key text;
  v_prefix text;
  v_number text;
begin
  select coalesce(b.number_year, true) into v_year
    from document_branding b where b.business_id = p_business;
  -- Numbering without the year is part of Documents Plus.
  v_year := coalesce(v_year, true) or not has_documents_plus(p_business);
  v_key := case when v_year then p_period else 'all' end;
  v_prefix := document_prefix_for(p_business, p_type);

  insert into document_sequence (business_id, type, period_key, last_number)
  values (p_business, p_type, v_key, 0)
  on conflict (business_id, type, period_key) do nothing;

  loop
    update document_sequence
       set last_number = last_number + 1
     where business_id = p_business and type = p_type and period_key = v_key
    returning last_number into v_next;

    v_number := v_prefix || '-' || case when v_year then p_period || '-' else '' end
                || lpad(v_next::text, 4, '0');

    exit when not exists (
      select 1 from document d
       where d.business_id = p_business and d.type = p_type and d.number = v_number);
  end loop;

  return v_number;
end;
$$;

-- The look stamped at issue: Classic, no logo and no colour without
-- Documents Plus. Business details, TIN, footer and signature areas stay free.
create or replace function document_stamp_branding()
returns trigger
language plpgsql
as $fn$
declare
  v_branding jsonb;
begin
  if new.number is null or old.number is not null then
    return new;
  end if;

  select to_jsonb(b) - 'business_id' - 'updated_at' - 'number_prefixes' - 'number_year'
  into v_branding
  from document_branding b
  where b.business_id = new.business_id;

  if v_branding is null then
    return new;
  end if;

  if not has_documents_plus(new.business_id) then
    v_branding := v_branding || jsonb_build_object('template', 'classic', 'logo_url', null, 'accent_colour', null);
  end if;

  if coalesce(old.branding, '{}'::jsonb) ? 'note' then
    v_branding := v_branding || jsonb_build_object('note', old.branding -> 'note');
  end if;

  new.branding := v_branding;

  if new.issued_snapshot is not null then
    new.issued_snapshot := jsonb_set(new.issued_snapshot, '{branding}', v_branding);
  end if;

  return new;
end;
$fn$;

-- Nobody loses a look they set up before it had a price: until the end of
-- January 2027, then it can be bought.
insert into entitlement (business_id, product_set_key, source, status, granted_by, grant_reason, expires_at)
select b.business_id, 'documents_plus', 'support_grant', 'active', 'migration 0149',
       'Kept the look set up before Documents Plus had a price', '2027-01-31 23:59:59+00'
  from document_branding b
 where ((b.template is distinct from 'classic' and b.template is not null)
    or b.logo_url is not null
    or b.accent_colour is not null
    or b.number_prefixes <> '{}'::jsonb
    or b.number_year = false)
   and not exists (select 1 from entitlement e
                    where e.business_id = b.business_id and e.product_set_key = 'documents_plus'
                      and e.granted_by = 'migration 0149');

-- ---------------------------------------------------------------------------
-- 3. Orders to Ascend
-- ---------------------------------------------------------------------------
create table if not exists ascend_order (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  reference text not null unique,
  kind text not null check (kind in ('purchase', 'top_up')),
  price_book_entry_id uuid references price_book_entry(id),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null default 'GHS',
  status text not null default 'waiting' check (status in ('waiting', 'paid', 'cancelled')),
  requested_by uuid references business_membership(id),
  requested_at timestamptz not null default now(),
  paid_with text check (paid_with in ('bank_transfer', 'momo', 'cash', 'card')),
  payment_reference text,
  recorded_by uuid references person(id),
  recorded_at timestamptz,
  purchase_id uuid references purchase(id),
  balance_entry_id uuid references balance_entry(id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (kind = 'top_up' or price_book_entry_id is not null)
);
create index if not exists ascend_order_business on ascend_order (business_id, requested_at desc);
create index if not exists ascend_order_waiting on ascend_order (requested_at) where status = 'waiting';
alter table ascend_order enable row level security;

create or replace function ascend_order_reference()
returns text
language sql volatile
as $$
  select 'ASC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- A business asks for something, or a top-up. One waiting order per thing.
create or replace function request_ascend_order(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_sku text := nullif(p->>'sku', '');
  v_amount numeric := nullif(p->>'top_up_amount', '')::numeric;
  v_entry price_book_entry%rowtype;
  v_existing ascend_order%rowtype;
  v_id uuid;
  v_ref text;
begin
  perform require_permission(v_actor, v_business, array['business.settings']);

  if v_sku is not null then
    select pbe.* into v_entry
      from price_book_entry pbe join business b on b.id = v_business
     where pbe.sku = v_sku and pbe.country_code = b.country_code and pbe.active;
    if not found then
      raise exception 'not_in_the_price_book: %', v_sku;
    end if;
    if v_entry.offer_mode <> 'buy' then
      raise exception 'not_for_sale_here: %', v_entry.offer_mode;
    end if;
    select * into v_existing from ascend_order
     where business_id = v_business and price_book_entry_id = v_entry.id and status = 'waiting';
    if found then
      return jsonb_build_object('order_id', v_existing.id, 'reference', v_existing.reference, 'amount', v_existing.amount, 'existing', true);
    end if;
    v_ref := ascend_order_reference();
    insert into ascend_order (business_id, reference, kind, price_book_entry_id, description, amount, currency_code, requested_by)
    values (v_business, v_ref, 'purchase', v_entry.id, v_entry.name, v_entry.amount, v_entry.currency_code, v_actor)
    returning id into v_id;
  else
    if v_amount is null or v_amount < 20 or v_amount > 20000 then
      raise exception 'top_up_out_of_range';
    end if;
    v_amount := round(v_amount, 2);
    select * into v_existing from ascend_order
     where business_id = v_business and kind = 'top_up' and status = 'waiting';
    if found then
      update ascend_order set amount = v_amount, description = 'Ascend Balance top-up', requested_at = now()
       where id = v_existing.id;
      return jsonb_build_object('order_id', v_existing.id, 'reference', v_existing.reference, 'amount', v_amount, 'existing', true);
    end if;
    v_ref := ascend_order_reference();
    insert into ascend_order (business_id, reference, kind, description, amount, requested_by)
    values (v_business, v_ref, 'top_up', 'Ascend Balance top-up', v_amount, v_actor)
    returning id into v_id;
  end if;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, 'ascend_order.requested', 'ascend_order', v_id,
          jsonb_build_object('reference', v_ref, 'sku', v_sku, 'top_up', v_amount));

  return jsonb_build_object('order_id', v_id, 'reference', v_ref,
                            'amount', coalesce(v_entry.amount, v_amount), 'existing', false);
end;
$fn$;

create or replace function cancel_ascend_order(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_order ascend_order%rowtype;
begin
  perform require_permission(v_actor, v_business, array['business.settings']);
  select * into v_order from ascend_order where id = (p->>'order_id')::uuid and business_id = v_business for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_order.status <> 'waiting' then
    raise exception 'order_not_waiting: %', v_order.status;
  end if;
  update ascend_order set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelled by the business'
   where id = v_order.id;
  return jsonb_build_object('cancelled', true);
end;
$fn$;

-- Ascend records money received. With order_id it settles that order;
-- with business_id and top_up_amount it records a top-up nobody asked for
-- in the app (a transfer that just arrived).
create or replace function record_ascend_payment(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := (p->>'admin_person_id')::uuid;
  v_with text := coalesce(nullif(p->>'paid_with', ''), 'bank_transfer');
  v_ref text := nullif(btrim(coalesce(p->>'payment_reference', '')), '');
  v_order ascend_order%rowtype;
  v_entry price_book_entry%rowtype;
  v_result jsonb;
  v_purchase uuid;
  v_balance uuid;
  v_ent uuid;
  v_until timestamptz;
begin
  perform risk_admin_check(v_admin);
  if v_with not in ('bank_transfer', 'momo', 'cash', 'card') then
    raise exception 'paid_with_unknown';
  end if;
  if v_ref is null or length(v_ref) < 4 then
    raise exception 'reference_needed';
  end if;
  if exists (select 1 from ascend_order where payment_reference = v_ref and status = 'paid') then
    raise exception 'reference_already_used';
  end if;

  if nullif(p->>'order_id', '') is not null then
    select * into v_order from ascend_order where id = (p->>'order_id')::uuid for update;
    if not found then
      raise exception 'order_not_found';
    end if;
    if v_order.status <> 'waiting' then
      raise exception 'order_not_waiting: %', v_order.status;
    end if;
  else
    if nullif(p->>'business_id', '') is null or coalesce((p->>'top_up_amount')::numeric, 0) <= 0
       or (p->>'top_up_amount')::numeric > 50000 then
      raise exception 'top_up_out_of_range';
    end if;
    insert into ascend_order (business_id, reference, kind, description, amount)
    values ((p->>'business_id')::uuid, ascend_order_reference(), 'top_up', 'Ascend Balance top-up',
            round((p->>'top_up_amount')::numeric, 2))
    returning * into v_order;
  end if;

  if v_order.kind = 'top_up' then
    insert into balance_entry (business_id, kind, amount, currency_code, service_key, source_entity_type, source_entity_id)
    values (v_order.business_id, 'top_up', v_order.amount, v_order.currency_code, 'balance.top_up', 'ascend_order', v_order.id)
    returning id into v_balance;
  else
    select * into v_entry from price_book_entry where id = v_order.price_book_entry_id;
    -- Bought at the price asked, even if the book has changed since.
    v_result := record_purchase(jsonb_build_object(
      'business_id', v_order.business_id, 'sku', v_entry.sku,
      'product_set_key', coalesce(v_entry.product_set_key, '')));
    v_purchase := (v_result->>'purchase_id')::uuid;
    update purchase set amount = v_order.amount, description = v_order.description where id = v_purchase;
    -- Bought again before the last one ended: the new time starts when the
    -- old one ends, so no days are lost.
    if v_entry.product_set_key is not null and v_entry.duration_days is not null then
      select max(e.expires_at) into v_until
        from entitlement e
       where e.business_id = v_order.business_id and e.product_set_key = v_entry.product_set_key
         and e.source in ('purchase', 'sponsorship') and e.purchase_id is distinct from v_purchase
         and e.status in ('active', 'grace') and e.expires_at > now();
      if v_until is not null then
        update entitlement set starts_at = now(), expires_at = v_until + (v_entry.duration_days || ' days')::interval
         where purchase_id = v_purchase
        returning id into v_ent;
      end if;
    end if;
  end if;

  update ascend_order
     set status = 'paid', paid_with = v_with, payment_reference = v_ref,
         recorded_by = v_admin, recorded_at = now(),
         purchase_id = v_purchase, balance_entry_id = v_balance
   where id = v_order.id;

  insert into audit_log (business_id, actor_person_id, action, entity_type, entity_id, detail)
  values (v_order.business_id, v_admin, 'ascend_order.paid', 'ascend_order', v_order.id,
          jsonb_build_object('reference', v_order.reference, 'amount', v_order.amount,
                             'paid_with', v_with, 'payment_reference', v_ref, 'recorded_by', v_admin));

  return jsonb_build_object('order_id', v_order.id, 'reference', v_order.reference,
                            'purchase_id', v_purchase, 'balance_entry_id', v_balance);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Dismissed suggestions and the Account Manager
-- ---------------------------------------------------------------------------
create table if not exists billing_suggestion_dismissal (
  business_id uuid not null references business(id),
  suggestion_key text not null check (suggestion_key ~ '^[a-z0-9_:-]{2,80}$'),
  dismissed_by uuid references business_membership(id),
  dismissed_at timestamptz not null default now(),
  primary key (business_id, suggestion_key)
);
alter table billing_suggestion_dismissal enable row level security;

create table if not exists account_manager (
  business_id uuid primary key references business(id),
  name text not null check (length(btrim(name)) between 2 and 60),
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  assigned_by uuid references person(id),
  assigned_at timestamptz not null default now()
);
alter table account_manager enable row level security;

revoke all on function has_documents_plus(uuid) from public, anon, authenticated;
revoke all on function request_ascend_order(jsonb) from public, anon, authenticated;
revoke all on function cancel_ascend_order(jsonb) from public, anon, authenticated;
revoke all on function record_ascend_payment(jsonb) from public, anon, authenticated;
grant execute on function has_documents_plus(uuid) to service_role;
grant execute on function request_ascend_order(jsonb) to service_role;
grant execute on function cancel_ascend_order(jsonb) to service_role;
grant execute on function record_ascend_payment(jsonb) to service_role;
