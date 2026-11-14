-- ---------------------------------------------------------------------------
-- 0077  Phase 1, step 1d: high-risk actions are checked in the database
--
-- The route check (steps 1b and 1c) decides who may call a route. For the
-- actions that move money, change who can do what, or open the business to
-- outsiders, that is not enough: a route that gets its policy wrong, or a
-- future caller that skips the route, would still reach the database. So
-- the functions that perform those actions now check the permission
-- themselves (PHASE_1_PLAN.md section 3.2).
--
-- require_permission(actor, business, keys)
--   Refuses unless the actor is a member of that business, the membership is
--   active and not expired, and it holds at least one of the permissions.
--   The answer comes from membership_permissions (0074), so the database
--   and the route ask exactly the same question.
--
-- The ten functions that already receive the actor:
--   decide_approval         refunds, voids, discounts: refunds.approve;
--                           anything else: approvals.decide
--   request_refund          refunds.approve
--   update_catalogue_item   catalogue.manage, and prices.change when the
--                           price changes
--   change_member_role      staff.manage or roles.change (role rules stay)
--   add_team_member         staff.manage; adding a manager: roles.change
--   remove_team_member      staff.manage; removing a manager: roles.change
--   set_staff_pin           staff.manage; a manager's or owner's PIN:
--                           roles.change, unless it is your own
--   enable_product_set      business.settings
--   disable_product_set     business.settings
--   revoke_report_share     external_access.authorize
-- Every caller already passes the actor (checked before writing), so this
-- migration is safe to run before or after the app is deployed.
--
-- Not here, on purpose: set_channel_listing, clear_staff_pin, save_location
-- and grant_report_share do not receive the actor yet. Requiring it now would
-- break those four actions until the app sends it, so they come in 0078,
-- to be run after the deploy that sends the actor.
--
-- Also in this migration: audit_log gains reason, before, after and
-- authorization_source (Identity spec section 13), and record_audit() writes
-- a row with them. audit_log stays append-only (0072); adding columns is not
-- an update to any row.
--
-- Each function body is its latest definition with one counted insertion
-- (the file was generated, and the generator aborts if an anchor does not
-- match exactly once).
-- ---------------------------------------------------------------------------

create or replace function require_permission(p_actor uuid, p_business uuid, p_keys text[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_actor is null then
    raise exception 'permission_denied: no actor given (needs %)', array_to_string(p_keys, ' or ');
  end if;
  if not exists (
    select 1 from business_membership
    where id = p_actor and business_id = p_business
  ) then
    raise exception 'permission_denied: not a member of this business';
  end if;
  if not exists (
    select 1 from membership_permissions(p_actor) mp
    where mp.permission_key = any(p_keys)
  ) then
    raise exception 'permission_denied: needs %', array_to_string(p_keys, ' or ');
  end if;
end;
$$;

revoke all on function require_permission(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function require_permission(uuid, uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Audit to the spec's standard.
-- ---------------------------------------------------------------------------
alter table audit_log add column if not exists reason text;
alter table audit_log add column if not exists before jsonb;
alter table audit_log add column if not exists after jsonb;
alter table audit_log add column if not exists authorization_source text;

create or replace function record_audit(p jsonb)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  if nullif(p->>'action', '') is null then
    raise exception 'record_audit: action is required';
  end if;

  insert into audit_log (
    business_id, actor_person_id, actor_membership_id, action,
    entity_type, entity_id, detail, reason, before, after, authorization_source
  ) values (
    nullif(p->>'business_id', '')::uuid,
    nullif(p->>'actor_person_id', '')::uuid,
    nullif(p->>'actor_membership_id', '')::uuid,
    p->>'action',
    nullif(p->>'entity_type', ''),
    nullif(p->>'entity_id', '')::uuid,
    coalesce(p->'detail', '{}'::jsonb),
    nullif(p->>'reason', ''),
    p->'before',
    p->'after',
    nullif(p->>'authorization_source', '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function record_audit(jsonb) from public, anon, authenticated;
grant execute on function record_audit(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The ten high-risk functions.
-- ---------------------------------------------------------------------------

-- decide_approval (latest definition was 0031_pos_refunds_discounts.sql)
create or replace function decide_approval(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_request approval_request%rowtype;
  v_decider uuid := (p->>'decider_membership_id')::uuid;
  v_approved boolean := coalesce((p->>'approved')::boolean, false);
  v_expense expense%rowtype;
begin
  select * into v_request from approval_request
  where id = (p->>'approval_id')::uuid
  for update;

  if not found then
    raise exception 'approval_not_found';
  end if;

  -- 0077: deciding is a permission, checked here as well as at the route.
  -- Refunds, voids and discounts move money and need refunds.approve; everything
  -- else needs approvals.decide.
  perform require_permission(
    v_decider, v_request.business_id,
    case when v_request.kind in ('refund', 'void', 'discount')
         then array['refunds.approve']
         else array['approvals.decide'] end
  );
  if v_request.status <> 'requested' then
    raise exception 'already_decided';
  end if;
  if v_request.requested_by = v_decider then
    raise exception 'cannot_approve_own_request';
  end if;

  update approval_request
  set status = case when v_approved then 'approved'::approval_status else 'rejected'::approval_status end,
      decided_by = v_decider,
      decided_at = now(),
      note = coalesce(p->>'note', note)
  where id = v_request.id;

  if v_approved and v_request.kind = 'expense' then
    select * into v_expense from expense where approval_id = v_request.id;
    if found then
      insert into ledger_entry (
        business_id, location_id, kind, amount, currency_code,
        source_entity_type, source_entity_id, business_date
      ) values (
        v_expense.business_id, v_expense.location_id, 'expense',
        -1 * v_expense.amount, v_expense.currency_code,
        'expense', v_expense.id, v_expense.business_date
      );
    end if;
  end if;

  -- An approved refund is performed here, not left as a note for someone to
  -- action later and forget.
  if v_approved and v_request.kind = 'refund'
     and v_request.source_entity_type = 'sale' then
    perform execute_sale_reversal(jsonb_build_object(
      'sale_id', v_request.source_entity_id,
      'actor_membership_id', v_decider
    ));
  end if;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_request.business_id, v_decider,
    case when v_approved then 'approval.approved' else 'approval.rejected' end,
    'approval_request', v_request.id,
    jsonb_build_object('kind', v_request.kind, 'amount', v_request.amount)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'office.approval.decided', v_request.business_id, v_decider,
    'business_mobile', 'office', 'approval_request', v_request.id,
    v_request.amount, v_request.currency_code, 'merchant_declared',
    jsonb_build_object('kind', v_request.kind, 'approved', v_approved),
    current_date
  );

  return jsonb_build_object('approval_id', v_request.id, 'approved', v_approved);
end;
$$;

-- request_refund (latest definition was 0029_refunds_settlement.sql)
create or replace function request_refund(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_payment payment%rowtype;
  v_already numeric(14,2);
  v_amount numeric(14,2) := (p->>'amount')::numeric;
  v_request uuid;
begin
  select * into v_payment from payment where id = (p->>'payment_id')::uuid for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  -- 0077: returning money needs refunds.approve.
  perform require_permission(nullif(p->>'requested_by', '')::uuid, v_payment.business_id, array['refunds.approve']);
  if v_payment.status <> 'confirmed' then
    raise exception 'payment_not_refundable';
  end if;

  select coalesce(sum(amount), 0) into v_already
  from refund_request
  where payment_id = v_payment.id and status in ('requested', 'pending', 'completed');

  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if v_already + v_amount > v_payment.amount then
    raise exception 'exceeds_refundable_amount';
  end if;

  insert into refund_request (
    business_id, payment_id, amount, currency_code, reason,
    status, requested_by
  ) values (
    v_payment.business_id, v_payment.id, v_amount, v_payment.currency_code,
    coalesce(p->>'reason', 'refund'), 'requested',
    nullif(p->>'requested_by', '')::uuid
  )
  returning id into v_request;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_payment.business_id, nullif(p->>'requested_by', '')::uuid, 'refund.requested',
    'refund_request', v_request,
    jsonb_build_object('amount', v_amount, 'payment', v_payment.id)
  );

  return jsonb_build_object('refund_id', v_request, 'amount', v_amount);
end;
$$;

-- update_catalogue_item (latest definition was 0038_product_editing.sql)
create or replace function update_catalogue_item(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
  v_new_price numeric(14,2);
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_photo text;
begin
  select * into v_item from catalogue_item
  where id = (p->>'item_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'item_not_found';
  end if;

  -- 0077: editing needs catalogue.manage, and changing the price needs
  -- prices.change as well.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_item.business_id, array['catalogue.manage']);
  if nullif(p->>'base_price', '') is not null
     and nullif(p->>'base_price', '')::numeric is distinct from v_item.base_price then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_item.business_id, array['prices.change']);
  end if;

  if p ? 'name' and length(trim(coalesce(p->>'name', ''))) < 2 then
    raise exception 'name_required';
  end if;

  if v_barcode is not null and exists (
    select 1 from catalogue_item
    where business_id = v_item.business_id
      and id <> v_item.id
      and barcode = v_barcode
  ) then
    raise exception 'barcode_taken';
  end if;

  v_new_price := coalesce(nullif(p->>'base_price', '')::numeric, v_item.base_price);
  v_photo := case when p ? 'photo_url'
                  then nullif(trim(coalesce(p->>'photo_url', '')), '')
                  else v_item.photo_url end;

  update catalogue_item
  set name = case when p ? 'name' then trim(p->>'name') else name end,
      description = case when p ? 'description'
                         then nullif(trim(coalesce(p->>'description', '')), '')
                         else description end,
      category = case when p ? 'category'
                      then nullif(trim(coalesce(p->>'category', '')), '')
                      else category end,
      photo_url = v_photo,
      base_price = v_new_price,
      barcode = case when p ? 'barcode' then v_barcode else barcode end,
      track_stock = coalesce((p->>'track_stock')::boolean, track_stock),
      active = coalesce((p->>'active')::boolean, active),
      low_stock_threshold = case
        when p ? 'low_stock_threshold'
        then nullif(p->>'low_stock_threshold', '')::numeric
        else low_stock_threshold
      end,
      updated_at = now()
  where id = v_item.id;

  -- Price history, kept whether or not anyone is looking at it yet. A sale
  -- already captures its own price, so receipts were never at risk; what was
  -- missing was any record of the shape of a merchant's pricing over time,
  -- which is exactly the operating history the readiness score is built on.
  if v_new_price is distinct from v_item.base_price and v_new_price is not null then
    insert into price_version (item_id, price, effective_from, created_by)
    values (v_item.id, v_new_price, now(), v_actor);
  end if;

  -- One picture, one meaning. The item carries the primary photo and the
  -- Shop listing carries the gallery; letting them drift means the till and
  -- the storefront show different things for the same product.
  if p ? 'photo_url' then
    update channel_listing
    set media = case when v_photo is null then '[]'::jsonb
                     else jsonb_build_array(v_photo) end
    where item_id = v_item.id and channel = 'shop';
  end if;

  return jsonb_build_object('item_id', v_item.id);
end;
$$;

-- change_member_role (latest definition was 0063_office_completion.sql)
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

  -- 0077: changing what someone may do needs staff.manage or roles.change.
  -- The role rules below (only the owner makes managers, nobody changes the
  -- owner) still apply on top.
  perform require_permission(v_actor.id, v_membership.business_id, array['staff.manage', 'roles.change']);

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

-- add_team_member (latest definition was 0039_add_team_member.sql)
create or replace function add_team_member(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_name text := nullif(trim(coalesce(p->>'full_name', '')), '');
  v_phone text := nullif(trim(coalesce(p->>'phone_e164', '')), '');
  v_role_key text := coalesce(p->>'role_key', 'cashier');
  v_role uuid;
  v_person uuid;
  v_membership uuid;
  v_existing business_membership%rowtype;
begin
  if v_name is null or length(v_name) < 2 then
    raise exception 'name_required';
  end if;

  -- Only the roles that mean something at a counter. Accountant and staff
  -- belong to other product sets, and handing an owner role to somebody is
  -- a heavier decision than this screen should quietly allow.
  if v_role_key not in ('cashier', 'manager') then
    raise exception 'role_not_allowed';
  end if;

  -- 0077: adding people needs staff.manage; adding a manager needs
  -- roles.change, which only owners hold.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['staff.manage']);
  if v_role_key = 'manager' then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['roles.change']);
  end if;

  select id into v_role from role
  where key = v_role_key and business_id is null;
  if v_role is null then
    raise exception 'role_not_found';
  end if;

  -- One person, whatever number of businesses they work for.
  if v_phone is not null then
    select id into v_person from person where phone_e164 = v_phone;
  end if;

  if v_person is null then
    insert into person (full_name, phone_e164)
    values (v_name, v_phone)
    returning id into v_person;
  end if;

  -- Already here? Reinstating somebody who left should not be an error, and
  -- should not lose the sales already attributed to them.
  select * into v_existing from business_membership
  where business_id = v_business and person_id = v_person;

  if found then
    if v_existing.status = 'active' then
      raise exception 'already_a_member';
    end if;
    update business_membership
    set status = 'active',
        role_id = v_role,
        staff_pin_hash = nullif(p->>'pin_hash', ''),
        pin_salt = nullif(p->>'pin_salt', ''),
        pin_set_at = case when nullif(p->>'pin_hash', '') is null then null else now() end,
        pin_failed_attempts = 0,
        pin_locked_until = null,
        updated_at = now()
    where id = v_existing.id;
    v_membership := v_existing.id;
  else
    insert into business_membership (
      business_id, person_id, role_id, status,
      staff_pin_hash, pin_salt, pin_set_at
    ) values (
      v_business, v_person, v_role, 'active',
      nullif(p->>'pin_hash', ''),
      nullif(p->>'pin_salt', ''),
      case when nullif(p->>'pin_hash', '') is null then null else now() end
    )
    returning id into v_membership;
  end if;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'team.member.added', 'business_membership', v_membership,
    jsonb_build_object('name', v_name, 'role', v_role_key,
                       'with_pin', nullif(p->>'pin_hash', '') is not null)
  );

  return jsonb_build_object('membership_id', v_membership, 'person_id', v_person);
end;
$$;

-- remove_team_member (latest definition was 0039_add_team_member.sql)
create or replace function remove_team_member(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_membership business_membership%rowtype;
  v_role_key text;
begin
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid
    and business_id = (p->>'business_id')::uuid;
  if not found then
    raise exception 'member_not_found';
  end if;

  select key into v_role_key from role where id = v_membership.role_id;
  -- A business with nobody who owns it has nobody who can let anyone back in.
  if v_role_key = 'owner' then
    raise exception 'cannot_remove_owner';
  end if;

  -- 0077: removing people needs staff.manage; removing a manager needs
  -- roles.change, which only owners hold.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_membership.business_id, array['staff.manage']);
  if v_role_key = 'manager' then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_membership.business_id, array['roles.change']);
  end if;

  update business_membership
  set status = 'removed',
      staff_pin_hash = null,
      pin_salt = null,
      pin_set_at = null,
      updated_at = now()
  where id = v_membership.id;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_membership.business_id, nullif(p->>'actor_membership_id', '')::uuid,
    'team.member.removed', 'business_membership', v_membership.id,
    jsonb_build_object('role', v_role_key)
  );

  return jsonb_build_object('membership_id', v_membership.id);
end;
$$;

-- set_staff_pin (latest definition was 0032_staff_pin.sql)
create or replace function set_staff_pin(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_membership business_membership%rowtype;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
begin
  select * into v_membership from business_membership
  where id = (p->>'membership_id')::uuid;
  if not found then
    raise exception 'membership_not_found';
  end if;

  -- 0077: setting someone's PIN needs staff.manage; a manager's or the
  -- owner's needs roles.change, unless it is your own.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_membership.business_id, array['staff.manage']);
  if v_membership.id is distinct from nullif(p->>'actor_membership_id', '')::uuid
     and exists (select 1 from role r where r.id = v_membership.role_id and r.key in ('owner', 'manager')) then
    perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_membership.business_id, array['roles.change']);
  end if;

  if coalesce(p->>'pin_hash', '') = '' or coalesce(p->>'pin_salt', '') = '' then
    raise exception 'pin_required';
  end if;

  update business_membership
  set staff_pin_hash = p->>'pin_hash',
      pin_salt = p->>'pin_salt',
      pin_set_at = now(),
      pin_failed_attempts = 0,
      pin_locked_until = null
  where id = v_membership.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_membership.business_id, v_actor, 'staff_pin.set',
    'business_membership', v_membership.id,
    jsonb_build_object('for_membership', v_membership.id)
  );

  return jsonb_build_object('membership_id', v_membership.id);
end;
$$;

-- enable_product_set (latest definition was 0069_entitlement_windows_are_real.sql)
create or replace function enable_product_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_key text := p->>'product_set_key';
  v_existing entitlement%rowtype;
begin
  if not exists (select 1 from product_set where key = v_key) then
    raise exception 'unknown_product_set';
  end if;

  -- 0077: taking on a product set is a business setting.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['business.settings']);

  -- Already on, in any usable state. Turning something on twice is a
  -- merchant tapping twice, not an error worth showing them.
  select * into v_existing from entitlement
  where business_id = v_business
    and product_set_key = v_key
    and entitlement_in_force(status, starts_at, expires_at, grace_until)
  limit 1;
  if found then
    return jsonb_build_object('entitlement_id', v_existing.id, 'already', true);
  end if;

  -- A set that was switched off before comes back rather than stacking a
  -- second grant beside the old one. Only a free grant is revived.
  select * into v_existing from entitlement
  where business_id = v_business
    and product_set_key = v_key
    and source = 'free_start'
  limit 1;

  if found then
    update entitlement
    set status = 'active', starts_at = now(), expires_at = null, grace_until = null,
        grant_reason = coalesce(p->>'reason', 'merchant enabled')
    where id = v_existing.id;
    return jsonb_build_object('entitlement_id', v_existing.id, 'already', false);
  end if;

  -- free_start, the same source a business's first set is granted under.
  -- entitlement_source has no value meaning a merchant switched something
  -- on themselves, and inventing one here would need an enum change for no
  -- gain: taking on a second free set is the same commercial event as the
  -- first, and grant_reason carries the difference.
  insert into entitlement (business_id, product_set_key, source, status, grant_reason)
  values (v_business, v_key, 'free_start', 'active',
          coalesce(p->>'reason', 'merchant enabled'))
  returning * into v_existing;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'entitlement.enabled', 'entitlement', v_existing.id,
    jsonb_build_object('product_set', v_key)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, verification, payload, business_date
  ) values (
    'business.product_set.enabled', v_business,
    nullif(p->>'actor_membership_id', '')::uuid,
    'business_mobile', v_key::text, 'entitlement', v_existing.id,
    'merchant_declared', jsonb_build_object('product_set', v_key), current_date
  );

  return jsonb_build_object('entitlement_id', v_existing.id, 'already', false);
end;
$$;

-- disable_product_set (latest definition was 0069_entitlement_windows_are_real.sql)
create or replace function disable_product_set(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_key text := p->>'product_set_key';
  v_remaining int;
begin
  -- 0077: setting a product set down is a business setting.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_business, array['business.settings']);

  select count(*) into v_remaining
  from entitlement
  where business_id = v_business
    and product_set_key is not null
    and product_set_key <> v_key
    and entitlement_in_force(status, starts_at, expires_at, grace_until);

  if v_remaining = 0 then
    raise exception 'cannot_disable_last_set';
  end if;

  update entitlement
  set status = 'expired', expires_at = now()
  where business_id = v_business
    and product_set_key = v_key
    and status in ('active', 'grace');

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'entitlement.disabled', 'business', v_business,
    jsonb_build_object('product_set', v_key)
  );

  return jsonb_build_object('product_set', v_key, 'disabled', true);
end;
$$;

-- revoke_report_share (latest definition was 0023_institutional_layer.sql)
create or replace function revoke_report_share(p jsonb)
returns void
language plpgsql security definer
as $$
declare
  v_share report_share%rowtype;
begin
  select * into v_share from report_share where id = (p->>'share_id')::uuid;
  if not found then
    raise exception 'share_not_found';
  end if;

  -- 0077: ending a share is authorising external access.
  perform require_permission(nullif(p->>'actor_membership_id', '')::uuid, v_share.business_id, array['external_access.authorize']);

  update report_share
  set status = 'revoked', revoked_at = now()
  where id = v_share.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_share.business_id, nullif(p->>'actor_membership_id', '')::uuid,
    'report_share.revoked', 'report_share', v_share.id,
    jsonb_build_object('reason', p->>'reason')
  );
end;
$$;
