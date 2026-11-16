-- ---------------------------------------------------------------------------
-- 0089  The two platform switches move from deploy settings to the database
--
-- Permission enforcement (AUTHORITY_ENFORCE, Phase 1) and what the screens
-- read (COMMERCE_READERS, Phase 2) were Netlify environment variables. On
-- 15 and 16 Nov 2026 an ordinary deploy twice ran without the current value:
-- a push at 15:32 on 16 Nov left Shop unenforced until a "Clear cache and
-- deploy site" put it right that evening. Nothing breaks when that happens;
-- people simply stop being refused, and nobody notices.
--
-- So the switches now live here, read by the app at request time (cached for
-- 30 seconds). No deploy, cached or not, can change them, and switching is
-- one statement that takes effect within half a minute:
--
--   select set_platform_setting(jsonb_build_object(
--     'key', 'authority_enforce',
--     'value', '["office","services","shop","documents","catalogue","team","growth","customers"]'::jsonb,
--     'reason', 'why it is changing, in a sentence',
--     'changed_by', 'Collins'));
--
-- platform_setting   one row per switch:
--   authority_enforce   a list of permission groups to enforce; each must be
--                       a known group, so a typo cannot silently switch one off
--   commerce_readers    "core" or "compare"
-- Every change, including a direct update, is checked and written to
-- audit_log with before, after, who and why. A change without a reason of
-- at least 10 characters is refused.
--
-- Seeded with what is live on 16 Nov 2026, so running this changes nothing.
-- The Netlify settings stay as the fallback the app uses only if this table
-- cannot be read.
--
-- Tables touched: platform_setting (new), audit_log (insert through
-- record_audit).
-- ---------------------------------------------------------------------------

create table if not exists platform_setting (
  key text primary key check (key in ('authority_enforce', 'commerce_readers')),
  value jsonb not null,
  reason text not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
alter table platform_setting enable row level security;
revoke all on platform_setting from anon, authenticated;

-- The permission groups the app knows (lib/authority/enforce.ts).
create or replace function platform_known_groups()
returns text[] language sql immutable as $$
  select array['office', 'services', 'shop', 'documents', 'catalogue', 'team', 'growth', 'customers']
$$;

create or replace function platform_setting_checked()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_unknown text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'platform_setting: a switch is not deleted; set it to what you want instead';
  end if;
  if coalesce(length(btrim(new.reason)), 0) < 10 then
    raise exception 'platform_setting: say why it is changing, in at least 10 characters';
  end if;
  if coalesce(btrim(new.changed_by), '') = '' then
    raise exception 'platform_setting: changed_by is required';
  end if;
  if new.key = 'authority_enforce' then
    if jsonb_typeof(new.value) <> 'array' then
      raise exception 'platform_setting: authority_enforce is a list of groups, for example ["office","shop"]';
    end if;
    select array_agg(g) into v_unknown
      from jsonb_array_elements_text(new.value) g
     where g <> all (platform_known_groups());
    if v_unknown is not null then
      raise exception 'platform_setting: unknown group(s) %; known: %', v_unknown, platform_known_groups();
    end if;
  elsif new.key = 'commerce_readers' then
    if new.value not in ('"core"'::jsonb, '"compare"'::jsonb) then
      raise exception 'platform_setting: commerce_readers is "core" or "compare"';
    end if;
  end if;
  new.changed_at := now();

  perform record_audit(jsonb_build_object(
    'action', 'platform_setting.changed',
    'entity_type', 'platform_setting',
    'detail', jsonb_build_object('key', new.key, 'changed_by', new.changed_by),
    'reason', new.reason,
    'before', case when tg_op = 'UPDATE' then old.value end,
    'after', new.value,
    'authorization_source', 'platform_operator'
  ));
  return new;
end $$;

drop trigger if exists platform_setting_checked on platform_setting;
create trigger platform_setting_checked
  before insert or update or delete on platform_setting
  for each row execute function platform_setting_checked();

-- The convenient way to change a switch.
create or replace function set_platform_setting(p jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into platform_setting (key, value, reason, changed_by)
  values (p->>'key', p->'value', p->>'reason', p->>'changed_by')
  on conflict (key) do update
     set value = excluded.value, reason = excluded.reason, changed_by = excluded.changed_by;
  return (select to_jsonb(s) from platform_setting s where key = p->>'key');
end $$;

revoke all on function set_platform_setting(jsonb) from public, anon, authenticated;
grant execute on function set_platform_setting(jsonb) to service_role;

-- What is live today.
-- Only where the row is missing, so running this again writes no audit entry.
insert into platform_setting (key, value, reason, changed_by)
select s.key, s.value, s.reason, '0089'
  from (values
    ('authority_enforce',
     '["office","services","shop","documents","catalogue","team","growth","customers"]'::jsonb,
     'moved from the Netlify setting as live on 16 Nov 2026 (0089)'),
    ('commerce_readers', '"core"'::jsonb,
     'moved from the Netlify setting as live on 16 Nov 2026 (0089)')
  ) as s(key, value, reason)
 where not exists (select 1 from platform_setting p where p.key = s.key);
