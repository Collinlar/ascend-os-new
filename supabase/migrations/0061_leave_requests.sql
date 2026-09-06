-- ---------------------------------------------------------------------------
-- 0061  Asking for time off
--
-- staff_time_off has existed since 0021 with no status, no approval link and
-- no way to create a row. A business could record that somebody was away
-- only by writing to the table directly, which nothing does, so it has
-- always been empty. Staff ask for time off constantly and there has been
-- nowhere to do it.
--
-- Leave follows the same shape as an expense: the record exists from the
-- moment it is asked for, and approval decides what it means. That keeps
-- the request visible while it waits, which is the whole point for the
-- person who asked.
-- ---------------------------------------------------------------------------

alter table staff_time_off
  add column if not exists status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'cancelled'));

alter table staff_time_off
  add column if not exists approval_id uuid references approval_request(id);

create index if not exists time_off_business_idx
  on staff_time_off (business_id, starts_at);

-- ---------------------------------------------------------------------------
-- request_time_off: the record and the decision that will govern it, made
-- together so neither can exist without the other.
-- ---------------------------------------------------------------------------
create or replace function request_time_off(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_membership uuid := (p->>'membership_id')::uuid;
  v_starts timestamptz := (p->>'starts_at')::timestamptz;
  v_ends timestamptz := (p->>'ends_at')::timestamptz;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_approval uuid;
  v_leave uuid;
begin
  if v_ends <= v_starts then
    raise exception 'leave_ends_before_it_starts';
  end if;

  -- Somebody already off on those days does not need to ask twice, and two
  -- overlapping approved absences for one person is a roster nobody can
  -- read.
  if exists (
    select 1 from staff_time_off t
    where t.membership_id = v_membership
      and t.status in ('requested', 'approved')
      and t.starts_at < v_ends
      and t.ends_at > v_starts
  ) then
    raise exception 'leave_overlaps_existing';
  end if;

  insert into approval_request (
    business_id, kind, requested_by, status, note
  ) values (
    v_business, 'leave', v_membership, 'requested', v_reason
  )
  returning id into v_approval;

  insert into staff_time_off (
    business_id, membership_id, starts_at, ends_at, reason,
    created_by, status, approval_id
  ) values (
    v_business, v_membership, v_starts, v_ends, v_reason,
    v_membership, 'requested', v_approval
  )
  returning id into v_leave;

  update approval_request
  set source_entity_type = 'staff_time_off', source_entity_id = v_leave
  where id = v_approval;

  return jsonb_build_object('time_off_id', v_leave, 'approval_id', v_approval);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The decision carries through to the leave itself.
--
-- A trigger rather than another rewrite of decide_approval, which every
-- product set now depends on and which has already grown a branch per kind.
-- ---------------------------------------------------------------------------
create or replace function leave_follows_approval()
returns trigger
language plpgsql
as $fn$
begin
  if new.kind <> 'leave' or new.status = old.status then
    return null;
  end if;

  update staff_time_off
     set status = case
                    when new.status = 'approved' then 'approved'
                    when new.status = 'rejected' then 'declined'
                    when new.status = 'cancelled' then 'cancelled'
                    else status
                  end
   where approval_id = new.id;

  return null;
end;
$fn$;

drop trigger if exists leave_follows_approval_trg on approval_request;

create trigger leave_follows_approval_trg
  after update on approval_request
  for each row
  execute function leave_follows_approval();

-- ---------------------------------------------------------------------------
-- Who is off, and when. The roster question a manager actually asks.
-- ---------------------------------------------------------------------------
create or replace function staff_leave(p_business uuid, p_from date default null)
returns table (
  id uuid,
  membership_id uuid,
  staff_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  reason text,
  status text,
  approval_id uuid
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select t.id, t.membership_id, coalesce(p.full_name, 'A team member'),
         t.starts_at, t.ends_at, t.reason, t.status, t.approval_id
  from staff_time_off t
  join business_membership m on m.id = t.membership_id
  left join person p on p.id = m.person_id
  where t.business_id = p_business
    and t.status <> 'cancelled'
    and t.ends_at >= coalesce(p_from::timestamptz, now() - interval '30 days')
  order by t.starts_at;
$fn$;

revoke all on function request_time_off(jsonb) from public, anon, authenticated;
revoke all on function staff_leave(uuid, date) from public, anon, authenticated;
grant execute on function request_time_off(jsonb) to service_role;
grant execute on function staff_leave(uuid, date) to service_role;
