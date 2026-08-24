-- AscendSME Connected Platform. Migration 0009: outbox relay and evidence
-- summary. The relay claims pending events with a lease so a crashed worker
-- never loses an event, and retries use bounded backoff (ARC-006, ARC-012).

alter table event_outbox
  add column next_attempt_at timestamptz not null default now();

create index outbox_due_idx on event_outbox(next_attempt_at)
  where status = 'pending';

-- Claim a batch with a short lease. If the worker dies mid-batch the events
-- become claimable again after the lease expires; consumers are idempotent
-- so double processing is safe (ARC-007, EVT-006).
create or replace function claim_outbox_batch(p_limit int default 50)
returns setof event_outbox
language sql security definer
as $$
  update event_outbox
  set next_attempt_at = now() + interval '2 minutes'
  where id in (
    select id from event_outbox
    where status = 'pending' and next_attempt_at <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

create or replace function mark_outbox_dispatched(p_event_id uuid)
returns void
language sql security definer
as $$
  update event_outbox
  set status = 'dispatched', dispatched_at = now(), last_error = null
  where event_id = p_event_id;
$$;

-- Bounded backoff: 1, 4, 9, ... minutes, capped at one hour. After ten
-- attempts the event parks as failed and surfaces in operations monitoring
-- (POS-SYN-005 semantics applied platform-wide).
create or replace function mark_outbox_failed(p_event_id uuid, p_error text)
returns void
language plpgsql security definer
as $$
begin
  update event_outbox
  set retry_count = retry_count + 1,
      last_error = left(p_error, 500),
      status = case when retry_count + 1 >= 10 then 'failed'::outbox_status else 'pending'::outbox_status end,
      next_attempt_at = now() + least(
        make_interval(mins => (retry_count + 1) * (retry_count + 1)),
        interval '60 minutes'
      )
  where event_id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Evidence summary: current, unexpired, unsuperseded evidence per dimension.
-- This feeds the Readiness surfaces and keeps coverage and confidence
-- separate from performance scores (EVT-021).
-- ---------------------------------------------------------------------------
create view evidence_summary as
select
  business_id,
  dimension,
  sum(weight) as current_weight,
  count(*) as record_count,
  count(*) filter (where verification in ('payment_verified', 'institution_verified')) as verified_count,
  max(created_at) as freshest_at
from evidence_record
where superseded_by is null
  and (expires_at is null or expires_at > now())
group by business_id, dimension;
