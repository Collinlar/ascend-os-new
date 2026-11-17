-- ---------------------------------------------------------------------------
-- 0091  Phase 3: a payment nobody has heard back about is "unknown", and
--       Ascend keeps asking until the provider answers
--
-- A digital payment is closed by the provider's webhook: confirm_payment_intent
-- on success, fail_payment_intent on failure. If the webhook never comes (the
-- customer ignores the MoMo prompt, a delivery is lost), the intent stayed
-- "initiated" forever and nothing ever asked the provider what happened.
--
-- Now a resolution step on the relay tick (lib/payments/resolve.ts) picks up
-- intents still open a few minutes after they started and asks the provider:
--   succeeded   confirm_payment_intent, as the webhook would
--   failed      fail_payment_intent, as the webhook would
--   abandoned   the provider says the customer never completed it
--   pending     the provider says it is still in progress
--   unknown     no definite answer: the provider could not be reached, did
--               not recognise the reference, or reversed it
-- Time alone never fails a payment: a MoMo approval can arrive late, and a
-- payment marked failed by the clock would be money taken and not recorded.
-- A webhook that arrives later still confirms an unknown or abandoned
-- intent; the provider's word wins whenever it comes.
--
-- Checks back off: about 2, 5, 15 and 60 minutes after the start, then
-- hourly, and stop after 7 days, leaving the intent as it stands for a
-- person to look at.
--
-- PAYMENT_INTENT STATUS gains "unknown". The value is only used inside
-- PL/pgSQL bodies here, which Postgres checks when they run, so adding it in
-- the same transaction is safe.
--
-- Tables and columns touched: payment_intent (status, and new columns
-- last_checked_at, check_count, resolution_note).
-- ---------------------------------------------------------------------------

alter type payment_intent_status add value if not exists 'unknown';

alter table payment_intent add column if not exists last_checked_at timestamptz;
alter table payment_intent add column if not exists check_count int not null default 0;
alter table payment_intent add column if not exists resolution_note text;

create index if not exists payment_intent_open
  on payment_intent (created_at)
  where status in ('initiated', 'pending');

-- The intents due a check now, oldest check first.
create or replace function intents_to_resolve(p_limit int default 20)
returns table (reference text, amount numeric, currency_code text, created_at timestamptz, check_count int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
begin
  return query
  select i.reference, i.amount, i.currency_code, i.created_at, i.check_count
    from payment_intent i
   where i.status::text in ('initiated', 'pending', 'unknown')
     and i.created_at < now() - interval '2 minutes'
     and i.created_at > now() - interval '7 days'
     and (
       i.last_checked_at is null
       or now() - i.last_checked_at >= case
            when i.check_count <= 1 then interval '3 minutes'
            when i.check_count = 2 then interval '10 minutes'
            when i.check_count = 3 then interval '45 minutes'
            else interval '60 minutes'
          end
     )
   order by i.last_checked_at nulls first, i.created_at
   limit greatest(coalesce(p_limit, 20), 1);
end
$fn$;

-- Records a check that did not close the intent: still pending, abandoned
-- by the customer, or no definite answer. A confirmed or failed intent is
-- never changed here.
create or replace function record_intent_check(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_outcome text := p->>'outcome';
  v_status text;
begin
  if v_outcome not in ('pending', 'abandoned', 'unknown') then
    raise exception 'record_intent_check: outcome must be pending, abandoned or unknown';
  end if;
  update payment_intent
     set status = v_outcome::payment_intent_status,
         last_checked_at = now(),
         check_count = check_count + 1,
         resolution_note = nullif(btrim(coalesce(p->>'note', '')), ''),
         completed_at = case when v_outcome = 'abandoned' then coalesce(completed_at, now()) else completed_at end
   where reference = p->>'reference'
     and status::text in ('initiated', 'pending', 'unknown', 'abandoned')
  returning status::text into v_status;
  return jsonb_build_object('reference', p->>'reference', 'status', v_status);
end
$fn$;

revoke all on function intents_to_resolve(int) from public, anon, authenticated;
revoke all on function record_intent_check(jsonb) from public, anon, authenticated;
grant execute on function intents_to_resolve(int) to service_role;
grant execute on function record_intent_check(jsonb) to service_role;
