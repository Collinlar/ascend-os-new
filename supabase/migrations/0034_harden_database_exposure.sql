-- AscendSME Connected Platform. Migration 0034: close the database's
-- public attack surface (SEC-002, SEC-006, API-002).
--
-- Raised by the Supabase advisors against the live project. The advisors
-- grade most of this as WARN, which understates it badly for this schema.
--
-- Every business rule in this platform lives in a security definer
-- function, because the API authenticates callers by device token or
-- session rather than by Postgres role. Postgres grants EXECUTE on new
-- functions to PUBLIC by default. The anon key is public by design and the
-- PostgREST endpoint is on the internet, so until this migration anybody
-- who knew the project reference could call:
--
--   terminal_staff_roster(business_id)  -> every staff PIN hash
--   decide_approval(...)                -> approve their own refund
--   execute_sale_reversal(...)          -> reverse any sale
--   set_staff_pin(...)                  -> take over a till
--
-- directly over HTTPS, with definer rights, bypassing RLS entirely. That
-- is an authentication bypass, not a lint.
--
-- The fix is to make the database's own permissions agree with the design:
-- only the service role, which is server side and never shipped to a
-- browser, may execute anything or read anything.

-- ---------------------------------------------------------------------------
-- 1. Make public a schema nobody else can plant objects in.
--
-- This has to come first, because pinning search_path to public is only
-- safe once public cannot be written to by other roles. Without it, a
-- definer function resolving an unqualified name is a privilege escalation
-- waiting for someone to create a same-named object earlier in the path.
-- ---------------------------------------------------------------------------
revoke create on schema public from public;
revoke create on schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on every function this schema owns.
--
-- Extension owned functions are deliberately excluded throughout: pgcrypto
-- and btree_gist live in public on this project, and altering or revoking
-- objects we do not own risks breaking the extensions themselves.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp', r.signature
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Only the service role may execute anything.
--
-- Every legitimate caller reaches these functions through a Next.js route
-- that has already checked device token, session, membership and
-- entitlement scope. Nothing legitimate calls them over PostgREST.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public', r.signature);
    execute format('revoke all on function %s from anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end;
$$;

-- Functions added by later migrations inherit the same posture rather than
-- silently reopening the hole.
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Views run as the caller, not as their creator.
--
-- A view without security_invoker enforces the creator's permissions, so it
-- reads straight through RLS. These seven aggregate across businesses:
-- stock, revenue, balances, readiness and evidence. Reachable by anon, they
-- are a cross tenant data leak.
--
-- Server side reads are unaffected: service_role bypasses RLS anyway.
-- ---------------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array[
    'ascend_balance', 'business_revenue', 'current_readiness',
    'evidence_summary', 'stock_balance', 'stock_reserved',
    'unsettled_collections'
  ]
  loop
    if exists (
      select 1 from pg_views where schemaname = 'public' and viewname = v
    ) then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke all on public.%I from anon, authenticated', v);
      execute format('grant select on public.%I to service_role', v);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tables: stop relying on RLS alone.
--
-- The advisors report 67 tables with RLS enabled and no policies. That is
-- intentional and is the correct posture here, not an oversight: RLS with
-- no policy denies everything, and every read and write in this platform
-- goes through the service role after the API has checked scope. Adding
-- permissive policies to silence the lint would open access this design
-- deliberately withholds.
--
-- What is worth fixing is the reliance on a single control. Supabase grants
-- table privileges to anon and authenticated by default, leaving RLS as the
-- only thing standing between the anon key and the data. If RLS is ever
-- disabled on one table by accident, that table is public. Revoking the
-- grants means two independent mistakes would be needed, not one.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke all on public.%I from anon, authenticated', r.relname);
    execute format('grant all on public.%I to service_role', r.relname);
  end loop;
end;
$$;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- Sequences follow their tables, or an insert can fail on nextval alone.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon, authenticated', r.relname);
    execute format('grant usage, select on sequence public.%I to service_role', r.relname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Note on extension_in_public, the one advisor warning left open.
--
-- pgcrypto and btree_gist sit in public. Moving them is a namespace hygiene
-- improvement with real breakage risk: btree_gist backs the exclusion
-- constraint that stops double booked staff, and relocating it rewrites
-- operator class resolution for that constraint. The exposure it represents
-- is now covered anyway, since step 1 stops anyone else creating objects in
-- public and step 2 pins every function's search_path. Left deliberately,
-- to be done in a maintenance window with the booking constraint verified
-- after.
-- ---------------------------------------------------------------------------
