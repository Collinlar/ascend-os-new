-- ---------------------------------------------------------------------------
-- 0074  Phase 1, step 1a: one catalogue of permissions, and one answer to
--       "what may this membership do?"
--
-- Roles have carried a permissions list since 0001 (owner ["*"], manager 7
-- keys, cashier 5, accountant 4, staff 3). Nothing ever read it, and its keys
-- matched neither the spec nor each other: routes check role NAMES by hand
-- instead (roleKey !== "owner" and similar, 21 places).
--
-- This step changes no behaviour. It builds the thing the next steps will
-- ask:
--   permission               the catalogue: every permission, its risk level
--                            and owning domain (Identity spec section 6)
--   role permissions         migrated to catalogue keys, per the role matrix
--                            approved by Collins on 14 Nov 2026
--                            (PHASE_1_PLAN.md section 3.4); a trigger refuses
--                            any key not in the catalogue
--   membership_permissions   the effective permissions of one membership:
--                            nothing unless it is active and not expired
--   has_permission           yes or no, for the high-risk functions (step 1d)
--   membership_authority     everything step 1b's request context needs, in
--                            one call
--
-- Contextual cells of the matrix are their own keys, so a grant says exactly
-- what it grants: a cashier holds sales.view_own_shift, never sales.view;
-- staff hold orders.manage_assigned and bookings.manage_assigned. "Their
-- locations" is the membership's location_scope, returned here and applied in
-- step 1e.
--
-- Owner keeps "*", meaning every permission in the catalogue, now and as it
-- grows. Only a role keyed owner may hold "*".
--
-- Every business's role copies were checked before writing: 31 businesses x
-- 5 roles, none customised away from its template, so all are replaced with
-- the new lists.
--
-- Tables and columns touched (checked against the live schema):
--   role: business_id, key, permissions
--   business_membership: id, business_id, person_id, role_id, status,
--     expires_at, location_scope
-- New table: permission.
-- ---------------------------------------------------------------------------

create table if not exists permission (
  key text primary key,
  description text not null,
  risk text not null check (risk in ('low', 'medium', 'high')),
  domain text not null,
  created_at timestamptz not null default now()
);

alter table permission enable row level security;

insert into permission (key, description, risk, domain) values
  ('sales.create',                   'Ring up a sale',                                   'low',    'pos'),
  ('sales.view',                     'See every sale',                                   'low',    'pos'),
  ('sales.view_own_shift',           'See the sales on your own shift',                  'low',    'pos'),
  ('refunds.request',                'Ask for a refund',                                 'medium', 'pos'),
  ('refunds.approve',                'Approve a refund',                                 'high',   'pos'),
  ('shifts.open_close',              'Open and close a till shift',                      'low',    'pos'),
  ('shifts.review',                  'Review shifts and drawer differences',             'medium', 'pos'),
  ('catalogue.manage',               'Add and edit what you sell',                       'medium', 'catalogue'),
  ('prices.change',                  'Change prices',                                    'high',   'catalogue'),
  ('inventory.manage',               'Receive, count and write off stock',               'medium', 'inventory'),
  ('orders.manage',                  'Handle every online order',                        'low',    'commerce'),
  ('orders.manage_assigned',         'Handle the online orders given to you',            'low',    'commerce'),
  ('bookings.manage',                'Handle every booking',                             'low',    'services'),
  ('bookings.manage_assigned',       'Handle the bookings given to you',                 'low',    'services'),
  ('documents.create',               'Issue quotes, invoices and receipts',              'low',    'documents'),
  ('documents.view',                 'See documents',                                    'low',    'documents'),
  ('payments.view',                  'See payments',                                     'medium', 'finance'),
  ('settlement.view',                'See settlements and payouts',                      'medium', 'finance'),
  ('settlement.change_destination',  'Change where payouts are sent',                    'high',   'finance'),
  ('staff.manage',                   'Add, remove and set up team members',              'high',   'identity'),
  ('roles.change',                   'Change what a team member is allowed to do',       'high',   'identity'),
  ('approvals.decide',               'Approve or decline requests',                      'medium', 'work'),
  ('tasks.own',                      'Work through your own tasks',                      'low',    'work'),
  ('attendance.own',                 'Check yourself in and out',                        'low',    'work'),
  ('reports.view',                   'See business reports',                             'medium', 'reporting'),
  ('data.export',                    'Export business data',                             'high',   'platform'),
  ('campaigns.send',                 'Send messages to customers',                       'medium', 'communications'),
  ('external_access.authorize',      'Give a bank, partner or app access',               'high',   'identity'),
  ('business.settings',              'Change business details and settings',             'high',   'business')
on conflict (key) do update
  set description = excluded.description,
      risk = excluded.risk,
      domain = excluded.domain;

-- ---------------------------------------------------------------------------
-- Every key a role holds must be in the catalogue. "*" only for owner.
-- ---------------------------------------------------------------------------
create or replace function role_permissions_are_known()
returns trigger
language plpgsql
as $$
declare
  v_bad text;
begin
  if jsonb_typeof(new.permissions) <> 'array' then
    raise exception 'role % permissions must be a list', new.key;
  end if;

  if new.permissions ? '*' and new.key <> 'owner' then
    raise exception 'only the owner role may hold every permission ("*"), not %', new.key;
  end if;

  select string_agg(k, ', ') into v_bad
  from jsonb_array_elements_text(new.permissions) k
  where k <> '*' and not exists (select 1 from permission p where p.key = k);

  if v_bad is not null then
    raise exception 'role % names permissions that do not exist: %', new.key, v_bad;
  end if;

  return new;
end;
$$;

-- The matrix. Applied to the templates and to every business's copy.
do $do$
declare
  v_matrix jsonb := jsonb_build_object(
    'owner', jsonb_build_array('*'),
    'manager', jsonb_build_array(
      'sales.create', 'sales.view', 'refunds.request', 'refunds.approve',
      'shifts.open_close', 'shifts.review', 'catalogue.manage', 'prices.change',
      'inventory.manage', 'orders.manage', 'bookings.manage', 'documents.create',
      'documents.view', 'payments.view', 'staff.manage', 'approvals.decide',
      'tasks.own', 'attendance.own', 'reports.view', 'campaigns.send'),
    'cashier', jsonb_build_array(
      'sales.create', 'sales.view_own_shift', 'refunds.request',
      'shifts.open_close', 'tasks.own', 'attendance.own'),
    'accountant', jsonb_build_array(
      'sales.view', 'shifts.review', 'documents.create', 'documents.view',
      'payments.view', 'settlement.view', 'reports.view', 'data.export'),
    'staff', jsonb_build_array(
      'orders.manage_assigned', 'bookings.manage_assigned', 'tasks.own', 'attendance.own')
  );
  v_updated int;
begin
  update role r
     set permissions = v_matrix -> r.key
   where v_matrix ? r.key;
  get diagnostics v_updated = row_count;
  raise notice 'role permissions migrated to the catalogue on % role rows', v_updated;
end
$do$;

drop trigger if exists role_permissions_are_known_trg on role;
create trigger role_permissions_are_known_trg
  before insert or update of permissions, key on role
  for each row execute function role_permissions_are_known();

-- ---------------------------------------------------------------------------
-- What one membership may do, right now.
--
-- Nothing at all unless the membership is active and has not expired. Owner's
-- "*" becomes every key in the catalogue. Delegations join this in step 1e.
-- ---------------------------------------------------------------------------
create or replace function membership_permissions(p_membership uuid)
returns table (permission_key text, source text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with m as (
    select bm.role_id
    from business_membership bm
    where bm.id = p_membership
      and bm.status = 'active'
      and (bm.expires_at is null or bm.expires_at > now())
  ),
  granted as (
    select k as key
    from m
    join role r on r.id = m.role_id
    cross join lateral jsonb_array_elements_text(r.permissions) k
  )
  select distinct p.key, 'role'::text
  from permission p
  where exists (select 1 from granted g where g.key = p.key or g.key = '*')
  order by 1;
$$;

create or replace function has_permission(p_membership uuid, p_key text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from membership_permissions(p_membership) mp
    where mp.permission_key = p_key
  );
$$;

-- Everything the request context needs about one membership, in one call.
-- active says whether it can do anything at all, and why_not says why if not.
create or replace function membership_authority(p_membership uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'membership_id', bm.id,
    'business_id', bm.business_id,
    'person_id', bm.person_id,
    'role', r.key,
    'status', bm.status,
    'expires_at', bm.expires_at,
    'location_scope', coalesce(to_jsonb(bm.location_scope), 'null'::jsonb),
    'active', bm.status = 'active' and (bm.expires_at is null or bm.expires_at > now()),
    'why_not', case
                 when bm.status <> 'active' then 'membership_' || bm.status::text
                 when bm.expires_at is not null and bm.expires_at <= now() then 'membership_expired'
               end,
    'permissions', coalesce(
      (select jsonb_agg(mp.permission_key order by mp.permission_key)
       from membership_permissions(bm.id) mp),
      '[]'::jsonb)
  )
  from business_membership bm
  left join role r on r.id = bm.role_id
  where bm.id = p_membership;
$$;

revoke all on function membership_permissions(uuid) from public, anon, authenticated;
revoke all on function has_permission(uuid, text) from public, anon, authenticated;
revoke all on function membership_authority(uuid) from public, anon, authenticated;
grant execute on function membership_permissions(uuid) to service_role;
grant execute on function has_permission(uuid, text) to service_role;
grant execute on function membership_authority(uuid) to service_role;
