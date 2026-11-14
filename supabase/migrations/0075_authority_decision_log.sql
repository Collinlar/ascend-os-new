-- ---------------------------------------------------------------------------
-- 0075  Phase 1, step 1b: a record of what the authority check decided
--
-- Step 1b puts one authority check in front of every API route and page, in
-- shadow mode: it works out whether the request should be allowed, writes the
-- answer here, and then lets the request through exactly as before. Nothing
-- is refused until this log and the route-by-role test agree with today's
-- behaviour (PHASE_1_PLAN.md section 4: one week, or until they agree,
-- whichever is longer).
--
-- One row per decision. It is operational evidence for switching enforcement
-- on, not business history, so it is not one of the 0072 append-only tables
-- and can be pruned once Phase 1 is enforced.
--
-- person_id and business_id are kept so a would-refuse can be traced to the
-- real person and screen it would have affected. No phone numbers, names or
-- request bodies are stored.
-- ---------------------------------------------------------------------------

create table if not exists authority_decision (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  mode text not null default 'shadow' check (mode in ('shadow', 'enforce')),
  surface text not null check (surface in ('api', 'page')),
  route text not null,
  method text,
  action text,
  person_id uuid,
  business_id uuid,
  membership_id uuid,
  role text,
  required jsonb not null default '{}',
  decision text not null check (decision in ('allow', 'would_deny', 'deny', 'not_applicable', 'error')),
  reason text
);

create index if not exists authority_decision_lookup
  on authority_decision (decision, at desc);

create index if not exists authority_decision_route
  on authority_decision (route, at desc);

alter table authority_decision enable row level security;
