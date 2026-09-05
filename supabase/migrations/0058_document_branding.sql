-- ---------------------------------------------------------------------------
-- 0058  A document that looks like the business that sent it
--
-- document.branding has existed since 0003 and has never held anything.
-- Every invoice a Ghanaian SME sends through AscendSME has looked exactly
-- like every other one, which is a poor advertisement for a platform whose
-- pitch is that the business becomes more credible by using it.
--
-- Deliberately small. This is not a template designer, and a template
-- designer is not what a trader in Makola needs at nine in the morning.
-- It is the handful of things that make a document theirs: the name they
-- trade under, how to reach them, what they want said at the bottom, and
-- one colour.
--
-- What is stamped, and when it is stamped, is the interesting part. The
-- branding is copied onto the document at issue, not read at render time.
-- A business that rebrands next year must not have last year's invoices
-- silently repaint themselves: the customer was sent a particular piece of
-- paper and that is what the record has to keep showing (DOC-004).
-- ---------------------------------------------------------------------------

create table if not exists document_branding (
  business_id uuid primary key references business(id),
  -- What the business trades as, where that differs from its registered
  -- name. Ghanaian SMEs frequently have both.
  trading_name text,
  address_line text,
  phone text,
  email text,
  website text,
  -- One colour, as #RRGGBB. Used for the document title and the rule under
  -- the table, and nowhere that carries meaning, so a badly chosen one
  -- cannot make a document unreadable.
  accent_colour text check (accent_colour is null or accent_colour ~ '^#[0-9A-Fa-f]{6}$'),
  -- Said at the bottom of every document. Where a merchant puts their MoMo
  -- number, their terms, or their thanks.
  footer_note text,
  updated_at timestamptz not null default now()
);

alter table document_branding enable row level security;

create policy branding_member_read on document_branding
  for select using (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- Stamp it as the document is issued.
--
-- A trigger rather than another rewrite of issue_document, which has
-- already been replaced once (0014, then 0017) and which every product set
-- now depends on. The trigger runs BEFORE the update that sets the number
-- and the snapshot, so it can put the branding into both, and the frozen
-- version carries the branding the customer actually saw.
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

  select to_jsonb(b) - 'business_id' - 'updated_at'
  into v_branding
  from document_branding b
  where b.business_id = new.business_id;

  if v_branding is null then
    return new;
  end if;

  new.branding := v_branding;

  -- The snapshot is built inside issue_document from the row as it was
  -- read, so the branding has to be put into it here as well or the frozen
  -- version would be the only thing without it.
  if new.issued_snapshot is not null then
    new.issued_snapshot := jsonb_set(new.issued_snapshot, '{branding}', v_branding);
  end if;

  return new;
end;
$fn$;

drop trigger if exists document_stamp_branding_trg on document;

create trigger document_stamp_branding_trg
  before update on document
  for each row
  execute function document_stamp_branding();
