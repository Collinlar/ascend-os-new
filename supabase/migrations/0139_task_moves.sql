-- AscendSME Connected Platform. Migration 0139: moving work across the board.
--
-- Office's Work board (Modules M2) has four columns: To do, In progress,
-- Waiting and Done. Until now a task could only be created or finished
-- (complete_task, 0071), so nothing could say "I have started this" or "this
-- is waiting on someone else", and the board would have been two columns
-- pretending to be four.
--
-- set_task_status moves a task to any of the four, with its event in the
-- same transaction (the 0071 rule). Finishing through here is the same as
-- complete_task: the same event, office.task.completed, so the evidence
-- ladder counts it once whichever button was used. Every other move is
-- office.task.moved, carrying where it came from and where it went.
--
-- Who may move which task is decided before this is called: the route lets
-- an owner or manager move anything, and anyone else only work that is
-- theirs or nobody's. This function refuses a task from another business.
--
-- Tables and columns touched (checked against the live schema):
--   task: id, business_id, status, updated_at
--   event_outbox: event_type, business_id, actor_membership_id, channel,
--     product_set, entity_type, entity_id, payload, business_date

create or replace function set_task_status(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_task task%rowtype;
  v_to task_status;
begin
  begin
    v_to := (p->>'status')::task_status;
  exception when others then
    raise exception 'status_invalid';
  end;
  if v_to not in ('open', 'in_progress', 'blocked', 'done') then
    raise exception 'status_invalid';
  end if;

  select * into v_task from task
  where id = (p->>'task_id')::uuid
    and business_id = (p->>'business_id')::uuid
  for update;
  if not found then
    raise exception 'task_not_found';
  end if;

  -- A cancelled task belongs to an order or booking that was called off
  -- (0060). Moving it would bring back work nobody wants.
  if v_task.status = 'cancelled' then
    raise exception 'task_cancelled';
  end if;

  -- The same tap twice is not a second move.
  if v_task.status = v_to then
    return jsonb_build_object('task_id', v_task.id, 'status', v_to, 'unchanged', true);
  end if;

  update task set status = v_to, updated_at = now() where id = v_task.id;

  insert into event_outbox (
    event_type, business_id, actor_membership_id,
    channel, product_set, entity_type, entity_id, payload, business_date
  ) values (
    case when v_to = 'done' then 'office.task.completed' else 'office.task.moved' end,
    v_task.business_id,
    nullif(p->>'actor_membership_id', '')::uuid,
    coalesce(nullif(p->>'channel', ''), 'business_web'), 'office',
    'task', v_task.id,
    case when v_to = 'done' then '{}'::jsonb
         else jsonb_build_object('from', v_task.status, 'to', v_to) end,
    current_date
  );

  return jsonb_build_object('task_id', v_task.id, 'status', v_to, 'unchanged', false);
end;
$$;

revoke all on function set_task_status(jsonb) from public, anon, authenticated;
grant execute on function set_task_status(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The decider's note, kept apart from the request's reason.
--
-- decide_approval (latest in 0128) writes a note into approval_request.note,
-- the column that already holds why the person asked. A refund asked for
-- "customer says the tin was dented" and turned down with "no receipt"
-- kept only "no receipt". Office's Approvals screen shows the request and
-- the decision side by side, so the decision note gets its own column. The
-- route sends decide_approval no note (so the reason stays) and records the
-- decider's words here.
--
-- Tables and columns touched (checked against the live schema):
--   approval_request: decision_note (new)
-- ---------------------------------------------------------------------------
alter table approval_request add column if not exists decision_note text;
