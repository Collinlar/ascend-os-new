-- ---------------------------------------------------------------------------
-- 0062  Projects that can be created, and milestones that never existed
--
-- project has been a table since 0021 with no screen and one creator,
-- project_from_quotation, which has never been called. Milestones are named
-- throughout the Office PRD (20) and have no table at all.
--
-- A project here is a job with a name, a customer and a due date, not a
-- Gantt chart. The archetypes this is for are a caterer with a wedding in
-- three weeks and a builder with two sites running: they need to know what
-- is left and what is late, and nothing more elaborate than that.
-- ---------------------------------------------------------------------------

alter table project
  add column if not exists detail text;

alter table project
  add column if not exists due_on date;

alter table project
  add column if not exists created_by uuid references business_membership(id);

alter table project
  add column if not exists updated_at timestamptz not null default now();

create index if not exists project_business_idx
  on project (business_id, status, due_on);

-- ---------------------------------------------------------------------------
-- A milestone is a named point in a job. Deliberately thin: a title, a
-- date, and whether it has happened. Anything richer is a task, and tasks
-- already exist and already link to a project.
-- ---------------------------------------------------------------------------
create table if not exists project_milestone (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  business_id uuid not null references business(id),
  title text not null,
  due_on date,
  reached_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists milestone_project_idx
  on project_milestone (project_id, sort_order);

alter table project_milestone enable row level security;

create policy milestone_member_read on project_milestone
  for select using (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- What a merchant needs to see about a job in one line: how much of it is
-- done, and whether it is late.
-- ---------------------------------------------------------------------------
create or replace function business_projects(p_business uuid)
returns table (
  id uuid,
  name text,
  detail text,
  customer_name text,
  status text,
  due_on date,
  tasks_total int,
  tasks_done int,
  milestones_total int,
  milestones_reached int,
  next_milestone text,
  next_milestone_due date
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select
    p.id, p.name, p.detail,
    c.display_name,
    p.status,
    p.due_on,
    coalesce(t.total, 0)::int,
    coalesce(t.done, 0)::int,
    coalesce(m.total, 0)::int,
    coalesce(m.reached, 0)::int,
    nm.title,
    nm.due_on
  from project p
  left join customer c on c.id = p.customer_id
  left join lateral (
    select count(*) as total,
           count(*) filter (where task.status = 'done') as done
    from task where task.project_id = p.id
  ) t on true
  left join lateral (
    select count(*) as total,
           count(*) filter (where reached_at is not null) as reached
    from project_milestone where project_id = p.id
  ) m on true
  -- The next thing that has to happen, which is what somebody opening the
  -- list actually wants to know.
  left join lateral (
    select title, due_on
    from project_milestone
    where project_id = p.id and reached_at is null
    order by sort_order, due_on nulls last
    limit 1
  ) nm on true
  where p.business_id = p_business
    and p.status <> 'cancelled'
  order by
    case p.status when 'active' then 0 else 1 end,
    p.due_on nulls last,
    p.created_at;
$fn$;

-- ---------------------------------------------------------------------------
-- Creating one, with its milestones in the same call so a merchant is not
-- made to save an empty job and then fill it in.
-- ---------------------------------------------------------------------------
create or replace function create_project(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_milestone jsonb;
  v_order int := 0;
begin
  if length(v_name) < 2 then
    raise exception 'project_needs_a_name';
  end if;

  insert into project (
    business_id, name, detail, customer_id, due_on, status, created_by
  ) values (
    (p->>'business_id')::uuid,
    v_name,
    nullif(btrim(coalesce(p->>'detail', '')), ''),
    nullif(p->>'customer_id', '')::uuid,
    nullif(p->>'due_on', '')::date,
    'active',
    nullif(p->>'created_by', '')::uuid
  )
  returning id into v_project;

  for v_milestone in select * from jsonb_array_elements(coalesce(p->'milestones', '[]'::jsonb))
  loop
    if btrim(coalesce(v_milestone->>'title', '')) <> '' then
      insert into project_milestone (project_id, business_id, title, due_on, sort_order)
      values (
        v_project,
        (p->>'business_id')::uuid,
        btrim(v_milestone->>'title'),
        nullif(v_milestone->>'due_on', '')::date,
        v_order
      );
      v_order := v_order + 1;
    end if;
  end loop;

  return jsonb_build_object('project_id', v_project, 'milestones', v_order);
end;
$fn$;

revoke all on function business_projects(uuid) from public, anon, authenticated;
revoke all on function create_project(jsonb) from public, anon, authenticated;
grant execute on function business_projects(uuid) to service_role;
grant execute on function create_project(jsonb) to service_role;
