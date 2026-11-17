-- ---------------------------------------------------------------------------
-- 0093  Phase 5, step 5a: the event envelope, and the five-level ladder
--
-- PHASE_5_EVIDENCE_PLAN.md, approved by Collins on 17 Nov 2026 with every
-- recommendation. Spec 08 section 3 lists what every important business
-- event carries. event_outbox (0006) had most of it; this adds the rest:
--
--   actor_person_id    who acted (from their membership)
--   actor_role         their role at the moment they acted
--   source             how it entered: business_app, till, customer,
--                      provider or system
--   idempotency_key    the originating request's own reference where it has
--                      one (a till sale's client_ref), otherwise the event id
--   reversal_of        the event a reversal or refund undoes. The emitting
--                      functions write correction_of as null, so nothing
--                      linked a reversal to its sale or a refund to its
--                      payment; the original is found from the records
--                      (correction_of stays as each function sets it)
--   category           one of the spec's twelve (section 4)
--   verification       where an event carried none: system_recorded when the
--                      system acted on its own (system channel, nobody
--                      acting), merchant_declared otherwise. Events that
--                      carry a level keep it, so no evidence weight changes.
--
-- All filled by the database when an event is written, so none of the 26
-- functions that emit events is edited, and every existing event is filled
-- once below. The fill can never stop the product's own write: if it fails,
-- the event is saved without them.
--
-- THE FIVE-LEVEL LADDER (spec section 5) is enforced:
--   events     merchant_declared, system_recorded, customer_confirmed,
--              provider_confirmed (payment-verified), institution_verified
--   evidence   merchant_declared, system_recorded, customer_confirmed,
--              payment_verified, institution_verified
--
-- Nothing here changes a score or a piece of evidence.
--
-- Tables and columns touched: event_outbox (new columns; verification
-- filled where null), evidence_record (a check constraint only),
-- business_membership and role (read).
-- ---------------------------------------------------------------------------

alter table event_outbox add column if not exists actor_person_id uuid;
alter table event_outbox add column if not exists actor_role text;
alter table event_outbox add column if not exists source text;
alter table event_outbox add column if not exists idempotency_key text;
alter table event_outbox add column if not exists reversal_of uuid;
alter table event_outbox add column if not exists category text;

create index if not exists event_outbox_idempotency on event_outbox (business_id, idempotency_key);

-- The spec's twelve categories, from the event type.
create or replace function event_category(p_type text)
returns text language sql immutable as $$
  select case
    when p_type like 'business.%' then 'identity'
    when p_type like 'pos.sale.%' or p_type like 'pos.refund.%' then 'commerce'
    when p_type like 'pos.%' then 'operational'
    when p_type like 'shop.order.%' then 'commerce'
    when p_type like 'shop.%' or p_type like 'catalogue.%' then 'operational'
    when p_type like 'services.booking.%' then 'commerce'
    when p_type like 'documents.%' then 'document'
    when p_type like 'finance.payment.%' then 'payment'
    when p_type like 'inventory.%' then 'inventory'
    when p_type like 'office.attendance.%' then 'staff'
    when p_type like 'office.task.%' or p_type like 'office.expense.%' then 'work'
    when p_type like 'office.approval.%' then 'compliance'
    when p_type like 'customer.%' then 'customer'
    when p_type like 'message.%' or p_type like 'discover.%' then 'communication'
    when p_type like 'readiness.%' then 'verification'
    else 'operational'
  end
$$;

-- Fills what an event is missing. Used by the trigger and the backfill.
create or replace function event_envelope_fill(e event_outbox)
returns event_outbox language plpgsql stable as $$
declare
  v_person uuid;
  v_role text;
begin
  if e.actor_membership_id is not null and (e.actor_person_id is null or e.actor_role is null) then
    select bm.person_id, r.key into v_person, v_role
      from business_membership bm
      left join role r on r.id = bm.role_id
     where bm.id = e.actor_membership_id;
    e.actor_person_id := coalesce(e.actor_person_id, v_person);
    e.actor_role := coalesce(e.actor_role, v_role);
  end if;

  if e.verification is null then
    e.verification := case
      when coalesce(e.channel, 'system') = 'system' and e.actor_membership_id is null then 'system_recorded'
      else 'merchant_declared'
    end;
  end if;

  e.source := coalesce(e.source, case
    when e.verification = 'provider_confirmed' then 'provider'
    when e.channel like 'customer%' then 'customer'
    when e.channel = 'pos_terminal' then 'till'
    when e.channel like 'business%' then 'business_app'
    else 'system'
  end);

  e.idempotency_key := coalesce(e.idempotency_key, nullif(e.payload->>'client_ref', ''), e.event_id::text);
  e.category := coalesce(e.category, event_category(e.event_type));

  -- What a reversal or refund undoes. The emitting functions leave
  -- correction_of empty, so the original event is found from the records:
  --   pos.sale.reversed          the sale event of the sale it reverses
  --   finance.payment.refunded   the confirmation event of the refunded
  --                              payment (a cash payment has none)
  --   shop.order.refunded        the order's fulfilment event
  if e.reversal_of is null then
    e.reversal_of := coalesce(e.correction_of, case e.event_type
      when 'pos.sale.reversed' then (
        select o.event_id from event_outbox o
         where o.event_type = 'pos.sale.completed' and o.business_id = e.business_id
           and o.entity_id = (select s.reversal_of from sale s where s.id = e.entity_id)
         order by o.id limit 1)
      when 'finance.payment.refunded' then (
        select o.event_id from event_outbox o
         where o.event_type = 'finance.payment.confirmed' and o.business_id = e.business_id
           and o.entity_id = nullif(e.payload->>'refund_of', '')::uuid
         order by o.id limit 1)
      when 'shop.order.refunded' then (
        select o.event_id from event_outbox o
         where o.event_type = 'shop.order.fulfilled' and o.business_id = e.business_id
           and o.entity_id = e.entity_id
         order by o.id limit 1)
    end);
  end if;
  return e;
end $$;

create or replace function event_envelope_on_write()
returns trigger language plpgsql as $$
begin
  begin
    new := event_envelope_fill(new);
  exception when others then
    -- Never stop the product's write over the envelope.
    null;
  end;
  return new;
end $$;

drop trigger if exists event_envelope_on_write on event_outbox;
create trigger event_envelope_on_write
  before insert on event_outbox
  for each row execute function event_envelope_on_write();

-- Every existing event, once.
update event_outbox o
   set actor_person_id = f.actor_person_id,
       actor_role = f.actor_role,
       source = f.source,
       idempotency_key = f.idempotency_key,
       reversal_of = f.reversal_of,
       category = f.category,
       verification = f.verification
  from (select (event_envelope_fill(x)).* from event_outbox x) f
 where f.id = o.id
   and (o.category is null or o.source is null or o.idempotency_key is null or o.verification is null
        or (o.reversal_of is null and o.event_type in ('pos.sale.reversed', 'finance.payment.refunded', 'shop.order.refunded')));

-- The five-level ladder.
alter table event_outbox drop constraint if exists event_outbox_verification_ladder;
alter table event_outbox add constraint event_outbox_verification_ladder
  check (verification is null or verification in
    ('merchant_declared', 'system_recorded', 'customer_confirmed', 'provider_confirmed', 'institution_verified'));
alter table evidence_record drop constraint if exists evidence_record_verification_ladder;
alter table evidence_record add constraint evidence_record_verification_ladder
  check (verification in
    ('merchant_declared', 'system_recorded', 'customer_confirmed', 'payment_verified', 'institution_verified'));

revoke all on function event_category(text) from public, anon, authenticated;
revoke all on function event_envelope_fill(event_outbox) from public, anon, authenticated;
