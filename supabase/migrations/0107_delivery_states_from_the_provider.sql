-- ---------------------------------------------------------------------------
-- 0107  Communications Engine, step C1: delivery states from the provider
--
-- COMMUNICATIONS_ENGINE_PLAN.md 2.1, approved by Collins on 17 Nov 2026.
-- Spec 05 section 11: queued, submitted, delivered, failed, bounced, read.
--
-- Until now a message stopped at 'sent' (accepted by 360dialog or Resend),
-- and the status callbacks that follow were acknowledged and thrown away.
--
-- 'sent' stays the name for submitted: accepted by the provider, not yet
-- delivered. 'bounced' is new, for email that came back.
--
-- message_attempt         every call to a provider: accepted, rejected or
--                         an error, with the provider and its reference.
-- message_status_event    every status the provider reported, once per
--                         message and status, with when and any error.
--
-- record_message_attempt({message_id, provider, outcome, reference, reason})
--   What the dispatcher calls after each provider call. Accepted moves a
--   queued message to sent; rejected or an error fails it (fail_message,
--   which returns the merchant's balance).
--
-- record_delivery_status({provider, reference, status, at, error})
--   What the webhooks call for each callback. Finds the message by the
--   provider's reference and moves it forward only: sent, delivered, read.
--   failed or bounced end a message that was not yet delivered, and return
--   the merchant's balance once: a message that never arrived is not paid
--   for (ENT-004). A failure reported after delivery is kept as an event
--   but does not undo the delivery. 'complained' (an email marked as spam)
--   is kept as an event for the abuse signals (C5) and changes nothing.
--   A callback for an unknown reference is kept nowhere and reported back.
--
-- Tables and columns read: message (id, business_id, status,
-- provider_reference, balance_entry_id, cost), balance_entry (reversal_of).
-- ---------------------------------------------------------------------------

alter type message_status add value if not exists 'bounced';

alter table message add column if not exists read_at timestamptz;
alter table message add column if not exists failed_at timestamptz;
alter table message add column if not exists status_updated_at timestamptz;
alter table message add column if not exists provider text;
create index if not exists message_provider_reference on message (provider_reference) where provider_reference is not null;

create table if not exists message_attempt (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references message(id),
  business_id uuid not null references business(id),
  provider text not null,
  outcome text not null check (outcome in ('accepted', 'rejected', 'error')),
  provider_reference text,
  reason text,
  at timestamptz not null default now()
);
create index if not exists message_attempt_message on message_attempt (message_id, at);
alter table message_attempt enable row level security;
revoke all on message_attempt from anon, authenticated;

create table if not exists message_status_event (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references message(id),
  business_id uuid not null references business(id),
  provider text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed', 'bounced', 'complained')),
  reported_at timestamptz not null,
  error text,
  applied boolean not null,
  received_at timestamptz not null default now(),
  constraint message_status_event_once unique (message_id, status)
);
create index if not exists message_status_event_business on message_status_event (business_id, received_at);
alter table message_status_event enable row level security;
revoke all on message_status_event from anon, authenticated;

create or replace function record_message_attempt(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_msg message%rowtype;
  v_outcome text := p->>'outcome';
  v_provider text := coalesce(nullif(p->>'provider', ''), 'unknown');
begin
  select * into v_msg from message where id = (p->>'message_id')::uuid;
  if not found then raise exception 'message_not_found'; end if;
  if v_outcome not in ('accepted', 'rejected', 'error') then raise exception 'outcome_unknown: %', v_outcome; end if;

  insert into message_attempt (message_id, business_id, provider, outcome, provider_reference, reason)
  values (v_msg.id, v_msg.business_id, v_provider, v_outcome, nullif(p->>'reference', ''), nullif(p->>'reason', ''));

  if v_outcome = 'accepted' then
    update message
       set status = 'sent', sent_at = coalesce(sent_at, now()), provider = v_provider,
           provider_reference = coalesce(nullif(p->>'reference', ''), provider_reference),
           status_updated_at = now()
     where id = v_msg.id and status = 'queued';
  else
    perform fail_message(jsonb_build_object('message_id', v_msg.id,
                                            'reason', coalesce(nullif(p->>'reason', ''), v_outcome)));
    update message set failed_at = now(), provider = v_provider, status_updated_at = now() where id = v_msg.id;
  end if;
  return jsonb_build_object('message_id', v_msg.id, 'outcome', v_outcome);
end
$fn$;

create or replace function record_delivery_status(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_msg message%rowtype;
  v_status text := lower(coalesce(p->>'status', ''));
  v_at timestamptz := coalesce(nullif(p->>'at', '')::timestamptz, now());
  v_rank_now int;
  v_rank_new int;
  v_applied boolean := false;
  v_inserted int;
begin
  if v_status not in ('sent', 'delivered', 'read', 'failed', 'bounced', 'complained') then
    return jsonb_build_object('ignored', true, 'reason', 'status_unknown', 'status', v_status);
  end if;
  select * into v_msg from message
   where provider_reference = p->>'reference'
     and (nullif(p->>'provider', '') is null or provider is null or provider = p->>'provider')
   order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('ignored', true, 'reason', 'message_not_found');
  end if;

  v_rank_now := case v_msg.status::text when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 9 end;
  v_rank_new := case v_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;

  if v_status in ('sent', 'delivered', 'read') then
    if v_rank_new > v_rank_now and v_rank_now < 9 then
      update message
         set status = v_status::message_status,
             sent_at = coalesce(sent_at, v_at),
             delivered_at = case when v_status in ('delivered', 'read') then coalesce(delivered_at, v_at) else delivered_at end,
             read_at = case when v_status = 'read' then coalesce(read_at, v_at) else read_at end,
             status_updated_at = now()
       where id = v_msg.id;
      v_applied := true;
    end if;
  elsif v_status in ('failed', 'bounced') then
    -- Ends a message that was not yet delivered; a late failure after
    -- delivery is kept as an event only.
    if v_rank_now <= 1 then
      update message
         set status = v_status::message_status,
             failure_reason = coalesce(nullif(p->>'error', ''), 'the provider could not deliver it'),
             failed_at = v_at, status_updated_at = now()
       where id = v_msg.id;
      -- A message that never arrived is not paid for: return the balance once.
      if v_msg.balance_entry_id is not null
         and not exists (select 1 from balance_entry where reversal_of = v_msg.balance_entry_id) then
        insert into balance_entry (business_id, kind, amount, currency_code, service_key,
                                   source_entity_type, source_entity_id, reversal_of)
        values (v_msg.business_id, 'reversal', v_msg.cost, 'GHS', 'messaging.refund', 'message', v_msg.id,
                v_msg.balance_entry_id);
      end if;
      v_applied := true;
    end if;
  end if;

  insert into message_status_event (message_id, business_id, provider, status, reported_at, error, applied)
  values (v_msg.id, v_msg.business_id, coalesce(nullif(p->>'provider', ''), v_msg.provider, 'unknown'), v_status, v_at,
          nullif(p->>'error', ''), v_applied)
  on conflict (message_id, status) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('message_id', v_msg.id, 'status', v_status, 'applied', v_applied,
                            'duplicate', v_inserted = 0);
end
$fn$;

revoke all on function record_message_attempt(jsonb) from public, anon, authenticated;
revoke all on function record_delivery_status(jsonb) from public, anon, authenticated;
grant execute on function record_message_attempt(jsonb) to service_role;
grant execute on function record_delivery_status(jsonb) to service_role;
