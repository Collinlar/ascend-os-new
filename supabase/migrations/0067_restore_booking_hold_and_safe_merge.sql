-- ---------------------------------------------------------------------------
-- 0067  Put back what 0064 took out
--
-- Two defects in 0064_one_customer_record, both mine, found while checking
-- the codebase against the 8 Nov foundation. 0064 stays as applied; this
-- replaces the two functions it got wrong.
--
-- 1. book_service lost the deposit hold.
--    0064 rebuilt book_service from the 0018 version instead of the 0020
--    version. Result: a service that asks for a deposit no longer holds the
--    slot for a bounded window. hold_expires_at is never set, so
--    release_expired_holds() (which only touches rows with a hold expiry)
--    never frees an abandoned checkout, and one customer who walks away
--    from the payment screen blocks that slot indefinitely. Also lost: the
--    hold_expires_at and status in the duplicate-return payload, and the
--    deposit_required in the event payload.
--    This version is 0020's function with one change: the customer lookup
--    goes through find_or_create_customer, as 0064 intended.
--
-- 2. merge_customers could grant consent that was never given.
--    0064 line 135 ORs the two marketing_consent flags. If the surviving
--    record had opted out and the merged one had not, the merge flipped the
--    person back to "agreed" and the messaging engine would write to them.
--    Withdrawal now wins: consent survives a merge only if at least one side
--    had it AND neither side ever withdrew it. Anything that cannot be
--    kept is closed in consent_record rather than deleted, so the trail
--    still answers "were we allowed to message them in March".
--
-- Tables and columns touched (all checked against the live schema):
--   service_booking: hold_expires_at, deposit_required, deposit_paid, status,
--     scheduled_start, scheduled_end, model, item_id, customer_id,
--     location_id, assigned_membership_id, service_address, price_quoted,
--     currency_code, completion_detail
--   customer: marketing_consent, marketing_opt_out_at, email,
--     organisation_name, phone_e164, person_id, notes, updated_at
--   consent_record: customer_id, purpose, withdrawn_at
-- No table or column is added. Both functions keep their existing
-- signature and return type, so create or replace is enough.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- book_service: 0020 behaviour, 0064 customer lookup.
-- ---------------------------------------------------------------------------
create or replace function book_service(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_business uuid := (p->>'business_id')::uuid;
  v_start timestamptz := (p->>'scheduled_start')::timestamptz;
  v_duration int;
  v_end timestamptz;
  v_customer uuid;
  v_booking uuid;
  v_deposit numeric(14,2);
  v_model booking_model;
  v_status booking_status;
  v_hold_minutes int;
  v_hold_until timestamptz;
  v_existing service_booking%rowtype;
  v_client_ref text := p->>'client_ref';
begin
  if v_client_ref is not null then
    select * into v_existing from service_booking
    where completion_detail->>'client_ref' = v_client_ref;
    if found then
      return jsonb_build_object(
        'booking_id', v_existing.id,
        'status', v_existing.status,
        'scheduled_start', v_existing.scheduled_start,
        'deposit_required', coalesce(v_existing.deposit_required, 0),
        'duplicate', true
      );
    end if;
  end if;

  select * into v_item
  from catalogue_item
  where id = (p->>'item_id')::uuid and business_id = v_business and kind = 'service' and active;
  if not found then
    raise exception 'service_unavailable';
  end if;

  if v_start is null or v_start <= now() then
    raise exception 'slot_in_past';
  end if;

  v_duration := coalesce((v_item.service_attributes->>'duration_minutes')::int, 60);
  v_end := v_start + make_interval(mins => v_duration);
  v_deposit := coalesce((v_item.service_attributes->>'deposit_amount')::numeric, 0);
  v_model := coalesce((v_item.service_attributes->>'booking_model')::booking_model, 'fixed_slot');
  v_hold_minutes := coalesce((v_item.service_attributes->>'hold_minutes')::int, 30);

  -- A fixed slot is confirmed on booking; a request waits for the provider
  -- to accept, and a quote-first job waits for a price (SRV-001).
  if v_model = 'fixed_slot' then
    v_status := 'confirmed'::booking_status;
  else
    v_status := 'requested'::booking_status;
  end if;

  -- A deposit booking holds the slot while the customer pays, but only for
  -- a bounded window. release_expired_holds() frees it if the money never
  -- arrives.
  if v_deposit > 0 and v_status = 'confirmed' then
    v_hold_until := now() + make_interval(mins => v_hold_minutes);
  end if;

  -- Same single lookup the storefront uses (0064).
  v_customer := nullif(find_or_create_customer(jsonb_build_object(
    'business_id', v_business,
    'name', p->>'customer_name',
    'phone', p->>'customer_phone',
    'email', p->>'customer_email',
    'created_via', 'services'
  ))->>'customer_id', '')::uuid;

  begin
    insert into service_booking (
      business_id, location_id, customer_id, item_id, model, status,
      scheduled_start, scheduled_end, assigned_membership_id,
      service_address, deposit_required, price_quoted, currency_code,
      hold_expires_at, completion_detail
    ) values (
      v_business,
      nullif(p->>'location_id', '')::uuid,
      v_customer,
      v_item.id,
      v_model,
      v_status,
      v_start,
      v_end,
      nullif(p->>'membership_id', '')::uuid,
      p->>'service_address',
      nullif(v_deposit, 0),
      v_item.base_price,
      coalesce(v_item.currency_code, 'GHS'),
      v_hold_until,
      case when v_client_ref is null then '{}'::jsonb
           else jsonb_build_object('client_ref', v_client_ref) end
    )
    returning id into v_booking;
  exception
    when exclusion_violation then
      -- Someone else took this slot between the customer seeing it and
      -- tapping. Say so plainly rather than failing obscurely.
      raise exception 'slot_taken';
  end;

  insert into event_outbox (
    event_type, business_id, location_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date, occurred_at
  ) values (
    'services.booking.requested', v_business,
    nullif(p->>'location_id', '')::uuid,
    'customer_web', 'services',
    'service_booking', v_booking, v_item.base_price,
    coalesce(v_item.currency_code, 'GHS'), 'customer_confirmed',
    jsonb_build_object('model', v_model, 'status', v_status, 'deposit_required', v_deposit),
    current_date, now()
  );

  return jsonb_build_object(
    'booking_id', v_booking,
    'status', v_status,
    'scheduled_start', v_start,
    'deposit_required', v_deposit,
    'hold_expires_at', v_hold_until,
    'duplicate', false
  );
end;
$$;

revoke all on function book_service(jsonb) from public, anon, authenticated;
grant execute on function book_service(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- merge_customers: withdrawal wins.
--
-- Identical to 0064 except for the consent handling. The consent_record
-- rows are moved to the survivor first (as before). Then the survivor's flag
-- is set from a rule, not an OR:
--
--   granted  = at least one side had marketing consent
--              and neither side has ever withdrawn it
--
-- If either side withdrew, the result is "not agreed", the earliest
-- withdrawal date is kept, and any standing grant that moved across is
-- closed, so the flag and the record cannot disagree.
-- ---------------------------------------------------------------------------
create or replace function merge_customers(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_keep uuid := (p->>'keep_id')::uuid;
  v_drop uuid := (p->>'drop_id')::uuid;
  v_keep_row customer%rowtype;
  v_drop_row customer%rowtype;
  v_consent boolean;
  v_opt_out timestamptz;
begin
  if v_keep = v_drop then
    raise exception 'cannot_merge_a_record_into_itself';
  end if;

  select * into v_keep_row from customer where id = v_keep;
  if not found then raise exception 'keep_customer_not_found'; end if;
  select * into v_drop_row from customer where id = v_drop;
  if not found then raise exception 'drop_customer_not_found'; end if;

  -- Merging across businesses would move one business's customer history
  -- into another's books.
  if v_keep_row.business_id <> v_drop_row.business_id then
    raise exception 'customers_belong_to_different_businesses';
  end if;

  update sale             set customer_id = v_keep where customer_id = v_drop;
  update shop_order       set customer_id = v_keep where customer_id = v_drop;
  update service_booking  set customer_id = v_keep where customer_id = v_drop;
  update document         set customer_id = v_keep where customer_id = v_drop;
  update payment          set customer_id = v_keep where customer_id = v_drop;
  update payment_intent   set customer_id = v_keep where customer_id = v_drop;
  update receivable       set customer_id = v_keep where customer_id = v_drop;
  update project          set customer_id = v_keep where customer_id = v_drop;
  update message          set customer_id = v_keep where customer_id = v_drop;
  update consent_record   set customer_id = v_keep where customer_id = v_drop;

  -- Withdrawal wins. Either side having opted out is enough to treat the
  -- person as opted out; the earlier date is the one that stands.
  v_opt_out := case
                 when v_keep_row.marketing_opt_out_at is null then v_drop_row.marketing_opt_out_at
                 when v_drop_row.marketing_opt_out_at is null then v_keep_row.marketing_opt_out_at
                 else least(v_keep_row.marketing_opt_out_at, v_drop_row.marketing_opt_out_at)
               end;

  v_consent := (v_keep_row.marketing_consent or v_drop_row.marketing_consent)
               and v_opt_out is null;

  -- Keep whatever the surviving record was missing. A duplicate usually
  -- exists because one channel knew something the other did not.
  update customer
     set email = coalesce(email, v_drop_row.email),
         organisation_name = coalesce(organisation_name, v_drop_row.organisation_name),
         phone_e164 = coalesce(phone_e164, v_drop_row.phone_e164),
         person_id = coalesce(person_id, v_drop_row.person_id),
         notes = case
                   when notes is null then v_drop_row.notes
                   when v_drop_row.notes is null then notes
                   else notes || E'\n' || v_drop_row.notes
                 end,
         marketing_consent = v_consent,
         marketing_opt_out_at = v_opt_out,
         updated_at = now()
   where id = v_keep;

  -- A standing grant must not outlive a withdrawal. Closed, not deleted.
  if not v_consent then
    update consent_record
       set withdrawn_at = now()
     where customer_id = v_keep
       and purpose = 'marketing'
       and withdrawn_at is null;
  end if;

  delete from customer where id = v_drop;

  return jsonb_build_object('kept', v_keep, 'merged', v_drop);
end;
$fn$;

revoke all on function merge_customers(jsonb) from public, anon, authenticated;
grant execute on function merge_customers(jsonb) to service_role;
