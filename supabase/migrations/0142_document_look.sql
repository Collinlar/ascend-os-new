-- ---------------------------------------------------------------------------
-- 0142  How documents look (Modules round 2, R2)
--
-- The improved design gives every business a look for its documents:
-- one of three templates, a logo, a colour, its TIN and email on the
-- letterhead, default terms, signature areas, and its own numbering.
--
-- Four things change here.
--
-- 1. document_branding gains the settings: the template, the logo, the
--    TIN, whether signature areas print, the prefix for each kind of
--    document, and whether the year shows in the number.
--
-- 2. next_document_number reads the business's prefix and year choice.
--    The rule stays: a number never repeats and never skips. A prefix is
--    two to six capital letters and nothing else, so a number made with
--    the year (INV-2026-0012) and one made without it (INV-0012) can never
--    be the same string. Without the year the count runs on across years
--    in a series of its own ('all'), because restarting at 0001 each
--    January would repeat last year's numbers. Changing the prefix keeps
--    the count: INV-2026-0012 is followed by BVM-2026-0013. Nobody types
--    the next number: a gap is a red flag in the evidence.
--
-- 3. The stamp at issue (0058) replaced the document's branding outright,
--    which dropped the note written on the document itself (R1). It now
--    keeps the note and takes everything else from the look as it is at
--    the moment of issue.
--
-- 4. The numbering settings are not part of what is stamped: they describe
--    the next document, not this one.
-- ---------------------------------------------------------------------------

alter table document_branding
  add column if not exists template text not null default 'classic',
  add column if not exists logo_url text,
  add column if not exists tin text,
  add column if not exists signature_areas boolean not null default true,
  add column if not exists number_prefixes jsonb not null default '{}'::jsonb,
  add column if not exists number_year boolean not null default true;

alter table document_branding
  drop constraint if exists document_branding_template_check;
alter table document_branding
  add constraint document_branding_template_check
  check (template in ('classic', 'modern', 'compact'));

alter table document_branding
  drop constraint if exists document_branding_prefixes_check;
alter table document_branding
  add constraint document_branding_prefixes_check
  check (jsonb_typeof(number_prefixes) = 'object');

alter table document_branding
  drop constraint if exists document_branding_tin_check;
alter table document_branding
  add constraint document_branding_tin_check
  check (tin is null or tin ~ '^[A-Z0-9-]{4,20}$');

-- ---------------------------------------------------------------------------
-- The business's prefix for a kind, or the standard one. Anything that is
-- not two to six capital letters is ignored rather than trusted.
-- ---------------------------------------------------------------------------
create or replace function document_prefix_for(p_business uuid, p_type document_type)
returns text
language sql stable
as $$
  select coalesce(
    (select b.number_prefixes ->> p_type::text
       from document_branding b
      where b.business_id = p_business
        and (b.number_prefixes ->> p_type::text) ~ '^[A-Z]{2,6}$'),
    document_prefix(p_type));
$$;

-- Same signature as 0014, so issue_document (0017) and everything that
-- issues through it pick this up unchanged.
create or replace function next_document_number(
  p_business uuid,
  p_type document_type,
  p_period text
)
returns text
language plpgsql
as $$
declare
  v_next int;
  v_year boolean;
  v_key text;
  v_prefix text;
  v_number text;
begin
  select coalesce(b.number_year, true) into v_year
    from document_branding b where b.business_id = p_business;
  v_year := coalesce(v_year, true);
  v_key := case when v_year then p_period else 'all' end;
  v_prefix := document_prefix_for(p_business, p_type);

  insert into document_sequence (business_id, type, period_key, last_number)
  values (p_business, p_type, v_key, 0)
  on conflict (business_id, type, period_key) do nothing;

  loop
    update document_sequence
       set last_number = last_number + 1
     where business_id = p_business and type = p_type and period_key = v_key
    returning last_number into v_next;

    v_number := v_prefix || '-' || case when v_year then p_period || '-' else '' end
                || lpad(v_next::text, 4, '0');

    -- Cannot happen with the prefix rule above. If it ever did, taking the
    -- next number is better than failing to issue at all.
    exit when not exists (
      select 1 from document d
       where d.business_id = p_business and d.type = p_type and d.number = v_number);
  end loop;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- The stamp at issue, keeping the document's own note.
-- ---------------------------------------------------------------------------
create or replace function document_stamp_branding()
returns trigger
language plpgsql
as $fn$
declare
  v_branding jsonb;
begin
  -- Only at the moment of issue: draft to numbered.
  if new.number is null or old.number is not null then
    return new;
  end if;

  select to_jsonb(b) - 'business_id' - 'updated_at' - 'number_prefixes' - 'number_year'
  into v_branding
  from document_branding b
  where b.business_id = new.business_id;

  if v_branding is null then
    return new;
  end if;

  -- What was written on this document stays on it.
  if coalesce(old.branding, '{}'::jsonb) ? 'note' then
    v_branding := v_branding || jsonb_build_object('note', old.branding -> 'note');
  end if;

  new.branding := v_branding;

  if new.issued_snapshot is not null then
    new.issued_snapshot := jsonb_set(new.issued_snapshot, '{branding}', v_branding);
  end if;

  return new;
end;
$fn$;
