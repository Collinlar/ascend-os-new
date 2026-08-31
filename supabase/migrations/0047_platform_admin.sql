-- AscendSME Connected Platform. Migration 0047: who Ascend is.
--
-- DSC-013 requires moderation, suspension and appeal. All three have been
-- in the database since migration 0030 and none of them has ever been
-- called. suspend_listing and decide_appeal write actor = 'platform', but
-- nothing in this system can authenticate as the platform: there is no
-- internal user, no seeded platform role, and role.business_id is
-- nullable for "platform template roles" that were never created.
--
-- So a merchant can file an appeal, through a path that is wired, and
-- nobody anywhere can answer it. This is the identity that answers.
--
-- An Ascend staff member is a person like any other. They have a phone,
-- they sign in with the same WhatsApp code as a merchant, and this table
-- is the only thing that says what else they may do. Reusing the identity
-- everybody else has beats a second way to be logged in, which would be a
-- second way to be logged in wrongly.

create table platform_admin (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references person(id),
  -- moderator decides what is listed. admin also grants and revokes this
  -- table, so escalation is a deliberate, separate right.
  role text not null check (role in ('moderator', 'admin')),
  granted_by uuid references person(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note text
);

-- Revoked rows are kept, because who could moderate and when is exactly
-- the sort of thing somebody asks about after the fact.
create unique index platform_admin_one_live_per_person
  on platform_admin (person_id)
  where revoked_at is null;

create index platform_admin_live_idx
  on platform_admin (revoked_at)
  where revoked_at is null;

alter table platform_admin enable row level security;
revoke all on platform_admin from public, anon, authenticated;

-- Every moderation decision is somebody's, not the platform's in the
-- abstract. suspend_listing and decide_appeal record actor = 'platform',
-- which says an action was official and not who took it, so the name goes
-- alongside it here.
alter table discover_moderation_event
  add column if not exists decided_by uuid references person(id);

-- ---------------------------------------------------------------------------
-- The first admin cannot be made through the interface, because the
-- interface is what it unlocks. Grant it once, deliberately, in SQL:
--
--   insert into platform_admin (person_id, role, note)
--   select id, 'admin', 'founding administrator'
--   from person where phone_e164 = '+233XXXXXXXXX';
--
-- After that, an admin grants the rest from /admin/people.
-- ---------------------------------------------------------------------------
