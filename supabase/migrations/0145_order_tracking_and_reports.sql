-- ---------------------------------------------------------------------------
-- 0145  Order tracking and reporting (Modules round 2, R5)
--
-- A customer who ordered from a storefront could not see the order again.
-- And a customer with a problem could only report the business to Ascend,
-- which is the right door for "this is not a real business" and the wrong
-- one for "a jar arrived broken": the shop can sort that in an hour, and
-- Ascend reading it first helps nobody.
--
-- 1. order_access_token: a private link to one order, stored as a hash,
--    like document_access_token (0015). The customer gets it when they
--    order; the owner can make another to share.
--
-- 2. Reports on an order (decision 7). The design's reasons: damaged,
--    missing, wrong item, never arrived, a return, and a problem with the
--    shop itself. The first five go to the shop first ('with_shop'), with
--    up to three photos. The shop replies or marks it sorted. If it is still
--    with the shop 48 hours later, it reaches Ascend's risk desk ('open'),
--    and the customer can send it on sooner with "Still not sorted". A
--    problem with the shop itself goes to Ascend at once, as before.
--
--    The desk lists a report that is past its 48 hours even if the relay
--    has not yet moved it, so escalation never waits on a tick.
--
-- 3. A private storage bucket for the photos. Nobody reads them without a
--    short-lived signed link made by the server.
-- ---------------------------------------------------------------------------

create table if not exists order_access_token (
  token_hash text primary key,
  order_id uuid not null references shop_order(id),
  business_id uuid not null references business(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  first_viewed_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists order_access_token_order_idx on order_access_token (order_id);
alter table order_access_token enable row level security;
revoke all on order_access_token from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports: the order, the photos, and the shop's turn
-- ---------------------------------------------------------------------------
alter table customer_report
  add column if not exists shop_order_id uuid references shop_order(id),
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists escalate_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_why text,
  add column if not exists shop_reply text,
  add column if not exists shop_replied_at timestamptz,
  add column if not exists shop_resolved_at timestamptz;

create index if not exists customer_report_order_idx on customer_report (shop_order_id) where shop_order_id is not null;
create index if not exists customer_report_with_shop_idx on customer_report (escalate_at) where status = 'with_shop';

alter table customer_report drop constraint if exists customer_report_source_check;
alter table customer_report add constraint customer_report_source_check
  check (source in ('invoice', 'shop', 'booking', 'order'));

alter table customer_report drop constraint if exists customer_report_reason_check;
alter table customer_report add constraint customer_report_reason_check
  check (reason in ('not_delivered', 'wrong_amount', 'refund_refused', 'fake_business', 'unwanted_messages', 'other',
                    'damaged', 'missing', 'wrong_item', 'never_arrived', 'return_item'));

alter table customer_report drop constraint if exists customer_report_status_check;
alter table customer_report add constraint customer_report_status_check
  check (status in ('open', 'dismissed', 'case_opened', 'added_to_case', 'with_shop', 'sorted_by_shop'));

alter table customer_report drop constraint if exists customer_report_photos_check;
alter table customer_report add constraint customer_report_photos_check
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 3);

alter table customer_report drop constraint if exists customer_report_reply_check;
alter table customer_report add constraint customer_report_reply_check
  check (shop_reply is null or length(shop_reply) <= 600);

create or replace function customer_report_label(p_reason text)
returns text language sql immutable
set search_path = public, pg_temp
as $fn$
  select case p_reason
    when 'not_delivered' then 'paid and nothing came'
    when 'wrong_amount' then 'charged more than agreed'
    when 'refund_refused' then 'refund not paid'
    when 'fake_business' then 'not a real business'
    when 'unwanted_messages' then 'unwanted messages'
    when 'damaged' then 'an item arrived damaged'
    when 'missing' then 'something was missing'
    when 'wrong_item' then 'the wrong item came'
    when 'never_arrived' then 'the order never arrived'
    when 'return_item' then 'a return'
    else 'something else' end
$fn$;

-- The reasons the shop sees first (decision 7).
create or replace function customer_report_shop_first(p_reason text)
returns boolean language sql immutable
set search_path = public, pg_temp
as $fn$
  select p_reason in ('damaged', 'missing', 'wrong_item', 'never_arrived', 'return_item')
$fn$;

-- ---------------------------------------------------------------------------
-- submit_customer_report: as 0114, with the order, the photos, and the
-- shop's turn first for an order problem.
-- ---------------------------------------------------------------------------
create or replace function submit_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := nullif(p->>'business_id', '')::uuid;
  v_document uuid := nullif(p->>'document_id', '')::uuid;
  v_order uuid := nullif(p->>'shop_order_id', '')::uuid;
  v_key text := nullif(btrim(coalesce(p->>'reporter_key', '')), '');
  v_phone text := nullif(btrim(coalesce(p->>'reporter_phone', '')), '');
  v_detail text := nullif(btrim(coalesce(p->>'detail', '')), '');
  v_photos jsonb := coalesce(p->'photos', '[]'::jsonb);
  v_reason text := p->>'reason';
  v_shop_first boolean;
  v_recent int;
  v_id uuid;
  v_photo jsonb;
begin
  if v_business is null or not exists (select 1 from business where id = v_business) then
    raise exception 'business_not_found';
  end if;
  if v_document is not null and not exists (select 1 from document where id = v_document and business_id = v_business) then
    raise exception 'document_not_for_business';
  end if;
  if v_order is not null and not exists (select 1 from shop_order where id = v_order and business_id = v_business) then
    raise exception 'order_not_for_business';
  end if;
  if v_key is null or length(v_key) < 16 then raise exception 'reporter_key_needed'; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone_not_e164'; end if;
  if v_detail is not null then v_detail := left(v_detail, 600); end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 3 then raise exception 'photos_invalid'; end if;
  for v_photo in select * from jsonb_array_elements(v_photos) loop
    if jsonb_typeof(v_photo) <> 'string' or (v_photo #>> '{}') !~ ('^' || v_business::text || '/[0-9a-f-]{36}\.jpg$') then
      raise exception 'photos_invalid';
    end if;
  end loop;
  -- An order problem needs the order it is about.
  v_shop_first := customer_report_shop_first(v_reason);
  if v_shop_first and v_order is null then raise exception 'order_needed'; end if;

  perform pg_advisory_xact_lock(hashtext('customer_report:' || v_key));
  select count(*) into v_recent from customer_report
   where created_at >= now() - interval '24 hours'
     and (reporter_key = v_key or (v_phone is not null and reporter_phone_e164 = v_phone));
  if v_recent >= 3 then
    return jsonb_build_object('status', 'limited');
  end if;

  insert into customer_report (business_id, source, document_id, shop_order_id, reason, detail,
                               reporter_phone_e164, reporter_key, photos, status, escalate_at)
  values (v_business, p->>'source', v_document, v_order, v_reason, v_detail, v_phone, v_key, v_photos,
          case when v_shop_first then 'with_shop' else 'open' end,
          case when v_shop_first then now() + interval '48 hours' end)
  returning id into v_id;

  return jsonb_build_object('status', 'received', 'report_id', v_id,
                            'with_shop', v_shop_first,
                            'escalate_at', case when v_shop_first then now() + interval '48 hours' end);
end
$fn$;

-- ---------------------------------------------------------------------------
-- The shop answers: a reply, and whether it is sorted.
-- ---------------------------------------------------------------------------
create or replace function reply_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_reply text := nullif(btrim(coalesce(p->>'reply', '')), '');
  v_sorted boolean := coalesce((p->>'sorted')::boolean, false);
  r customer_report%rowtype;
begin
  select * into r from customer_report where id = (p->>'report_id')::uuid and business_id = v_business for update;
  if not found then raise exception 'report_not_found'; end if;
  perform require_permission(v_actor, v_business, array['orders.manage']);
  if r.status <> 'with_shop' then
    -- Ascend has it now, or it is already sorted: the shop's turn is over.
    raise exception 'report_not_with_shop|%', r.status;
  end if;
  if v_reply is null or length(v_reply) < 5 then raise exception 'reply_needed'; end if;

  update customer_report
     set shop_reply = left(v_reply, 600),
         shop_replied_at = now(),
         status = case when v_sorted then 'sorted_by_shop' else status end,
         shop_resolved_at = case when v_sorted then now() else shop_resolved_at end
   where id = r.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_business, v_actor, case when v_sorted then 'shop.report.sorted' else 'shop.report.replied' end,
          'customer_report', r.id, jsonb_build_object('reason', r.reason, 'order', r.shop_order_id));

  return jsonb_build_object('report_id', r.id, 'status', case when v_sorted then 'sorted_by_shop' else 'with_shop' end);
end
$fn$;

-- The customer says it is still not sorted: Ascend reads it now.
create or replace function escalate_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  r customer_report%rowtype;
begin
  select * into r from customer_report
   where id = (p->>'report_id')::uuid and shop_order_id = (p->>'shop_order_id')::uuid for update;
  if not found then raise exception 'report_not_found'; end if;
  if r.status not in ('with_shop', 'sorted_by_shop') then
    return jsonb_build_object('report_id', r.id, 'status', r.status, 'already', true);
  end if;
  update customer_report set status = 'open', escalated_at = now(), escalated_why = 'customer'
   where id = r.id;
  return jsonb_build_object('report_id', r.id, 'status', 'open');
end
$fn$;

-- The 48-hour rule, run by the relay.
create or replace function escalate_customer_reports()
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare v_moved int;
begin
  with moved as (
    update customer_report set status = 'open', escalated_at = now(), escalated_why = '48 hours'
     where status = 'with_shop' and escalate_at <= now()
    returning 1)
  select count(*)::int into v_moved from moved;
  return v_moved;
end
$fn$;

-- ---------------------------------------------------------------------------
-- The desk: reports Ascend should read, including any past its 48 hours
-- that the relay has not moved yet. Same columns as 0114.
-- ---------------------------------------------------------------------------
create or replace function open_customer_reports()
returns table (report_id uuid, business_id uuid, business_name text, source text, reason text,
               reason_label text, detail text, number_ends text, reported_at timestamptz,
               open_case_id uuid, reports_on_business bigint)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select r.id, r.business_id, b.name, r.source, r.reason, customer_report_label(r.reason), r.detail,
         case when r.reporter_phone_e164 is null then null else right(r.reporter_phone_e164, 3) end,
         r.created_at,
         (select c.id from risk_case c where c.business_id = r.business_id and c.status <> 'resolved'
           order by c.opened_at desc limit 1),
         (select count(*) from customer_report x where x.business_id = r.business_id
            and (x.status = 'open' or (x.status = 'with_shop' and x.escalate_at <= now())))
    from customer_report r join business b on b.id = r.business_id
   where r.status = 'open' or (r.status = 'with_shop' and r.escalate_at <= now())
   order by r.created_at
$fn$;

-- review_customer_report: as 0114, taking a report past its 48 hours too,
-- and carrying the order, the photos and the shop's reply as evidence.
create or replace function review_customer_report(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_admin uuid := nullif(p->>'admin_person_id', '')::uuid;
  v_outcome text := p->>'outcome';
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  r customer_report%rowtype;
  v_case uuid;
  v_evidence jsonb;
begin
  perform risk_admin_check(v_admin);
  select * into r from customer_report where id = (p->>'report_id')::uuid for update;
  if not found then raise exception 'report_not_found'; end if;
  if r.status <> 'open' and not (r.status = 'with_shop' and r.escalate_at <= now()) then
    return jsonb_build_object('report_id', r.id, 'already', r.status, 'case_id', r.case_id);
  end if;
  if v_note is null or length(v_note) < 10 then
    raise exception 'note_needed: say what you found, in at least 10 characters';
  end if;

  v_evidence := jsonb_build_object('customer_report', jsonb_build_object(
    'report_id', r.id, 'reason', r.reason, 'source', r.source, 'detail', r.detail,
    'reported_at', r.created_at, 'number_given', r.reporter_phone_e164 is not null,
    'shop_order_id', r.shop_order_id, 'photos', jsonb_array_length(r.photos),
    'shop_reply', r.shop_reply, 'escalated_why', r.escalated_why));

  if v_outcome = 'dismiss' then
    update customer_report set status = 'dismissed', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'dismissed');

  elsif v_outcome = 'open_case' then
    v_case := (open_risk_case(jsonb_build_object(
      'business_id', r.business_id,
      'domain', coalesce(nullif(p->>'domain', ''), customer_report_domain(r.reason)),
      'trigger', 'Customer report, ' || customer_report_label(r.reason) || ': ' || v_note,
      'evidence', v_evidence,
      'admin_person_id', v_admin))->>'case_id')::uuid;
    update customer_report set status = 'case_opened', case_id = v_case, reviewed_by = v_admin,
           reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'case_opened', 'case_id', v_case);

  elsif v_outcome = 'add_to_case' then
    select id into v_case from risk_case
     where id = nullif(p->>'case_id', '')::uuid and business_id = r.business_id and status <> 'resolved';
    if v_case is null then raise exception 'case_not_open_for_business'; end if;
    insert into risk_case_event (case_id, business_id, action, detail, by_person_id)
    values (v_case, r.business_id, 'note',
            'Customer report added, ' || customer_report_label(r.reason) || ': ' || v_note, v_admin);
    update customer_report set status = 'added_to_case', case_id = v_case, reviewed_by = v_admin,
           reviewed_at = now(), review_note = v_note
     where id = r.id;
    return jsonb_build_object('report_id', r.id, 'status', 'added_to_case', 'case_id', v_case);
  end if;
  raise exception 'outcome_unknown: dismiss, open_case or add_to_case';
end
$fn$;

revoke all on function reply_customer_report(jsonb) from public, anon, authenticated;
revoke all on function escalate_customer_report(jsonb) from public, anon, authenticated;
revoke all on function escalate_customer_reports() from public, anon, authenticated;
grant execute on function reply_customer_report(jsonb) to service_role;
grant execute on function escalate_customer_report(jsonb) to service_role;
grant execute on function escalate_customer_reports() to service_role;

-- ---------------------------------------------------------------------------
-- The private bucket for report photos. Only where Supabase storage exists.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('reports', 'reports', false)
    on conflict (id) do nothing;
  end if;
end
$do$;
