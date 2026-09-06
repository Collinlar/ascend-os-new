-- ---------------------------------------------------------------------------
-- 0063  The rest of Office
--
-- Four gaps that each need a database function, done together because none
-- is big enough to be its own migration and all four are the same shape:
-- something the schema already supports that nothing could do.
--
--   Changing somebody's role. add_team_member and remove_team_member have
--   existed since the POS work; nothing could change a role in between, so
--   promoting a cashier meant removing and re-adding them, which loses
--   their attendance history.
--
--   Managing locations. 31 rows in use by POS and Services, no way to add
--   or rename one.
--
--   Assigning a booking to a provider, and raising the work that goes with
--   it (Office PRD 26, Services + Office).
--
--   Asking to buy something. approval_request has carried the 'purchase'
--   kind since 0021 and nothing ever created one, so a purchase request
--   could never become the purchase order that 0054 made possible.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Roles
--
-- The owner's own role is not changeable here. A business with no owner is
-- a business nobody can administer, and the check that would let somebody
-- demote themselves out of their own shop is not worth the flexibility.
-- ---------------------------------------------------------------------------
create or replace function change_member_role(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_membership business_membership%rowtype;
  v_actor business_membership%rowtype;
  v_role_id uuid;
  v_current text;
  v_actor_role text;
begin
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  select * into v_actor from business_membership
  where id = (p->>'actor_membership_id')::uuid;
  if not found or v_actor.business_id <> v_membership.business_id then
    raise exception 'not_your_business';
  end if;

  select key into v_actor_role from role where id = v_actor.role_id;
  if v_actor_role not in ('owner', 'manager') then
    raise exception 'not_allowed';
  end if;

  select key into v_current from role where id = v_membership.role_id;
  if v_current = 'owner' then
    raise exception 'cannot_change_the_owner';
  end if;
  -- Only an owner hands out the keys to the business.
  if p->>'role_key' = 'owner' then
    raise exception 'cannot_make_another_owner';
  end if;
  if p->>'role_key' = 'manager' and v_actor_role <> 'owner' then
    raise exception 'only_the_owner_makes_managers';
  end if;

  select id into v_role_id from role where key = p->>'role_key';
  if v_role_id is null then
    raise exception 'unknown_role';
  end if;

  update business_membership
     set role_id = v_role_id, updated_at = now()
   where id = v_membership.id;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_membership.business_id, v_actor.id, 'staff.role.changed',
    'business_membership', v_membership.id,
    jsonb_build_object('was', v_current, 'now', p->>'role_key')
  );

  return jsonb_build_object('membership_id', v_membership.id, 'role', p->>'role_key');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create or replace function save_location(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid := nullif(p->>'location_id', '')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
begin
  if length(v_name) < 2 then
    raise exception 'location_needs_a_name';
  end if;

  if v_id is null then
    insert into location (business_id, name, address, city, region, active)
    values (
      v_business, v_name,
      nullif(btrim(coalesce(p->>'address', '')), ''),
      nullif(btrim(coalesce(p->>'city', '')), ''),
      nullif(btrim(coalesce(p->>'region', '')), ''),
      true
    )
    returning id into v_id;
  else
    update location
       set name = v_name,
           address = nullif(btrim(coalesce(p->>'address', '')), ''),
           city = nullif(btrim(coalesce(p->>'city', '')), ''),
           region = nullif(btrim(coalesce(p->>'region', '')), ''),
           active = coalesce((p->>'active')::boolean, active)
     where id = v_id and business_id = v_business;
    if not found then
      raise exception 'location_not_found';
    end if;
  end if;

  -- A business always needs somewhere to trade from. Closing the last one
  -- would leave tills and bookings pointing at nothing.
  if not exists (
    select 1 from location where business_id = v_business and active
  ) then
    raise exception 'cannot_close_the_last_location';
  end if;

  return jsonb_build_object('location_id', v_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Services + Office: a booking handed to a provider, with the preparation
-- work that goes with it.
-- ---------------------------------------------------------------------------
create or replace function assign_booking(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_booking service_booking%rowtype;
  v_member business_membership%rowtype;
  v_name text;
  v_service text;
begin
  select * into v_booking from service_booking
  where id = (p->>'booking_id')::uuid for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  select * into v_member from business_membership
  where id = (p->>'membership_id')::uuid
    and business_id = v_booking.business_id
    and status = 'active';
  if not found then
    raise exception 'not_on_this_team';
  end if;

  -- Somebody who has agreed time off over the booking cannot take it. This
  -- is the leave conflict the PRD asks for, checked where it cannot be
  -- skipped rather than in whichever screen happens to do the assigning.
  if exists (
    select 1 from staff_time_off t
    where t.membership_id = v_member.id
      and t.status = 'approved'
      and t.starts_at < coalesce(v_booking.scheduled_end, v_booking.scheduled_start)
      and t.ends_at > v_booking.scheduled_start
  ) then
    raise exception 'provider_is_on_leave';
  end if;

  update service_booking
     set assigned_membership_id = v_member.id, updated_at = now()
   where id = v_booking.id;

  select coalesce(pr.full_name, 'A team member') into v_name
  from person pr where pr.id = v_member.person_id;
  select coalesce(ci.name, 'a service') into v_service
  from catalogue_item ci where ci.id = v_booking.item_id;

  -- The work that comes with the job, so it shows up on the provider's
  -- list rather than only in a calendar they might not open.
  perform create_linked_task(jsonb_build_object(
    'business_id', v_booking.business_id,
    'title', 'Get ready for ' || v_service,
    'detail', v_name || ', ' || to_char(v_booking.scheduled_start, 'DD Mon HH24:MI'),
    'assigned_membership_id', v_member.id::text,
    'due_at', v_booking.scheduled_start::text,
    'source_entity_type', 'service_booking',
    'source_entity_id', v_booking.id
  ));

  return jsonb_build_object('booking_id', v_booking.id, 'assigned_to', v_name);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Office + Documents: asking to buy something, which becomes a purchase
-- order once somebody agrees to it.
-- ---------------------------------------------------------------------------
create or replace function request_purchase(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_approval uuid;
  v_detail text := btrim(coalesce(p->>'detail', ''));
  v_amount numeric(14,2) := nullif(p->>'amount', '')::numeric;
begin
  if length(v_detail) < 3 then
    raise exception 'purchase_needs_a_description';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'purchase_needs_an_amount';
  end if;

  insert into approval_request (
    business_id, kind, amount, currency_code, requested_by, status, note
  ) values (
    (p->>'business_id')::uuid, 'purchase', v_amount, 'GHS',
    (p->>'membership_id')::uuid, 'requested',
    v_detail || coalesce(' · from ' || nullif(btrim(coalesce(p->>'supplier', '')), ''), '')
  )
  returning id into v_approval;

  return jsonb_build_object('approval_id', v_approval);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- An approved purchase becomes a real purchase order, addressed to the
-- supplier the requester named. A trigger rather than another branch in
-- decide_approval, which every product set now depends on.
-- ---------------------------------------------------------------------------
create or replace function purchase_becomes_order()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_supplier uuid;
  v_supplier_name text;
  v_detail text;
  v_doc uuid;
begin
  if new.kind <> 'purchase' or new.status <> 'approved' or old.status = 'approved' then
    return null;
  end if;

  -- The note carries "what · from whom", which is what request_purchase
  -- wrote. No supplier named means no order to raise: the approval still
  -- stands as a decision, it simply has nobody to be addressed to.
  v_detail := split_part(coalesce(new.note, ''), ' · from ', 1);
  v_supplier_name := nullif(btrim(split_part(coalesce(new.note, ''), ' · from ', 2)), '');
  if v_supplier_name is null then
    return null;
  end if;

  select id into v_supplier from supplier
  where business_id = new.business_id
    and active
    and lower(btrim(name)) = lower(v_supplier_name)
  limit 1;

  if v_supplier is null then
    insert into supplier (business_id, name)
    values (new.business_id, v_supplier_name)
    returning id into v_supplier;
  end if;

  insert into document (
    business_id, type, status, currency_code,
    subtotal, tax_total, total, lines, supplier_id, created_by
  ) values (
    new.business_id, 'purchase_order', 'draft', coalesce(new.currency_code, 'GHS'),
    new.amount, 0, new.amount,
    jsonb_build_array(jsonb_build_object(
      'description', v_detail,
      'quantity', 1,
      'unit_price', new.amount,
      'line_total', new.amount
    )),
    v_supplier, new.decided_by
  )
  returning id into v_doc;

  perform issue_document(jsonb_build_object(
    'document_id', v_doc,
    'channel', 'business_web',
    'actor_membership_id', coalesce(new.decided_by::text, '')
  ));

  return null;
exception when others then
  -- A decision must stand even if the paperwork fails.
  insert into audit_log (business_id, action, entity_type, entity_id, detail)
  values (new.business_id, 'office.purchase_order.failed', 'approval_request',
          new.id, jsonb_build_object('error', sqlerrm));
  return null;
end;
$fn$;

drop trigger if exists purchase_becomes_order_trg on approval_request;

create trigger purchase_becomes_order_trg
  after update on approval_request
  for each row
  execute function purchase_becomes_order();

revoke all on function change_member_role(jsonb) from public, anon, authenticated;
revoke all on function save_location(jsonb) from public, anon, authenticated;
revoke all on function assign_booking(jsonb) from public, anon, authenticated;
revoke all on function request_purchase(jsonb) from public, anon, authenticated;
grant execute on function change_member_role(jsonb) to service_role;
grant execute on function save_location(jsonb) to service_role;
grant execute on function assign_booking(jsonb) to service_role;
grant execute on function request_purchase(jsonb) to service_role;
