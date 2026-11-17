-- ---------------------------------------------------------------------------
-- 0109  Communications Engine, step C3: template versions, owners, and the
--       operational class
--
-- COMMUNICATIONS_ENGINE_PLAN.md 2.4, approved 17 Nov 2026. Spec 05 sections
-- 4 and 7: templates carry version, language, variables, approval state,
-- business ownership and message class.
--
-- Versions. message_template keeps one row per key: the words that send
-- now. Every change of words is a numbered row in message_template_version.
-- Changing the words of an APPROVED template no longer changes what sends:
-- the edit is held as a new version awaiting approval, and the approved
-- words keep going out until approve_template_version makes the new one
-- current. A template not yet approved is edited in place, and the change
-- is still numbered. Until now an approved template's words could be
-- changed silently, sending text WhatsApp never approved.
--
-- Each message records the version it went out with (template_version),
-- set as it is queued.
--
-- Owners. owner_business_id: none for Ascend's own templates; a business
-- for one it owns. A business cannot send another business's template;
-- the refusal is raised where the message is written, so it reaches every
-- send path, queue_message included.
--
-- The operational class. message_purpose gains 'operational': messages to
-- staff (an approval waiting, low stock, a till that stopped syncing).
-- They need no marketing consent; they go to a team member, not a
-- customer. No operational template is added here: a new enum value
-- cannot be used in the transaction that adds it, and nothing would send
-- one yet. The first comes with the Office step that sends it.
--
-- Tables and columns read: message_template (key, body, subject, language,
-- param_order, provider_name, provider_namespace, approval_status),
-- message (template_key, business_id).
-- ---------------------------------------------------------------------------

alter type message_purpose add value if not exists 'operational';

alter table message_template add column if not exists version int not null default 1;
alter table message_template add column if not exists owner_business_id uuid references business(id);
alter table message add column if not exists template_version int;

create table if not exists message_template_version (
  template_key text not null references message_template(key),
  version int not null,
  body text not null,
  subject text,
  language text not null,
  param_order text[] not null default '{}',
  provider_name text,
  status text not null check (status in ('current', 'awaiting_approval', 'superseded')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (template_key, version)
);
alter table message_template_version enable row level security;
revoke all on message_template_version from anon, authenticated;

-- Every template as it stands now is its version 1.
insert into message_template_version (template_key, version, body, subject, language, param_order, provider_name, status, approved_at)
select t.key, t.version, t.body, t.subject, t.language, t.param_order, t.provider_name, 'current',
       case when t.approval_status = 'approved' then now() end
  from message_template t
on conflict do nothing;

-- A change of words.
create or replace function message_template_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_next int;
begin
  if tg_op = 'INSERT' then
    insert into message_template_version (template_key, version, body, subject, language, param_order, provider_name, status, approved_at)
    values (new.key, new.version, new.body, new.subject, new.language, new.param_order, new.provider_name, 'current',
            case when new.approval_status = 'approved' then now() end)
    on conflict do nothing;
    return null;
  end if;

  -- Approval reached on the current words: note when.
  if new.approval_status = 'approved' and old.approval_status is distinct from 'approved'
     and new.body = old.body and new.subject is not distinct from old.subject then
    update message_template_version set approved_at = coalesce(approved_at, now())
     where template_key = new.key and version = new.version;
  end if;

  if new.body is distinct from old.body or new.subject is distinct from old.subject
     or new.param_order is distinct from old.param_order or new.language is distinct from old.language then
    select coalesce(max(version), 0) + 1 into v_next from message_template_version where template_key = old.key;
    if old.approval_status = 'approved' and coalesce(current_setting('ascend.template_approval', true), '') = '' then
      -- Approved words keep sending; the edit waits for approval.
      update message_template_version set status = 'superseded'
       where template_key = old.key and status = 'awaiting_approval';
      insert into message_template_version (template_key, version, body, subject, language, param_order, provider_name, status)
      values (old.key, v_next, new.body, new.subject, new.language, new.param_order, new.provider_name, 'awaiting_approval');
      new.body := old.body; new.subject := old.subject; new.param_order := old.param_order;
      new.language := old.language; new.provider_name := old.provider_name; new.version := old.version;
    elsif coalesce(current_setting('ascend.template_approval', true), '') = '' then
      -- Not approved yet: the change applies, and is numbered.
      update message_template_version set status = 'superseded' where template_key = old.key and status = 'current';
      insert into message_template_version (template_key, version, body, subject, language, param_order, provider_name, status)
      values (old.key, v_next, new.body, new.subject, new.language, new.param_order, new.provider_name, 'current');
      new.version := v_next;
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists message_template_versions on message_template;
create trigger message_template_versions before update on message_template
  for each row execute function message_template_guard();
drop trigger if exists message_template_first_version on message_template;
create trigger message_template_first_version after insert on message_template
  for each row execute function message_template_guard();

-- A held version becomes the one that sends.
create or replace function approve_template_version(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key text := p->>'template_key';
  v_ver int := (p->>'version')::int;
  v record;
begin
  select * into v from message_template_version
   where template_key = v_key and version = v_ver and status = 'awaiting_approval';
  if not found then raise exception 'no_version_awaiting_approval'; end if;
  perform set_config('ascend.template_approval', 'on', true);
  update message_template
     set body = v.body, subject = v.subject, language = v.language, param_order = v.param_order,
         provider_name = coalesce(nullif(p->>'provider_name', ''), v.provider_name, provider_name),
         version = v.version, approval_status = 'approved', rejection_reason = null
   where key = v_key;
  perform set_config('ascend.template_approval', '', true);
  update message_template_version set status = 'superseded' where template_key = v_key and status = 'current';
  update message_template_version set status = 'current', approved_at = now() where template_key = v_key and version = v_ver;
  return jsonb_build_object('template_key', v_key, 'version', v_ver, 'current', true);
end
$fn$;

-- Each message: the version it went out with, and never another business's template.
create or replace function message_template_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  t message_template%rowtype;
begin
  select * into t from message_template where key = new.template_key;
  if t.owner_business_id is not null and t.owner_business_id <> new.business_id then
    raise exception 'template_belongs_to_another_business: % cannot send %', new.business_id, new.template_key;
  end if;
  new.template_version := coalesce(new.template_version, t.version);
  return new;
end
$fn$;

drop trigger if exists message_template_stamp on message;
create trigger message_template_stamp before insert on message
  for each row execute function message_template_stamp();

revoke all on function approve_template_version(jsonb) from public, anon, authenticated;
grant execute on function approve_template_version(jsonb) to service_role;
