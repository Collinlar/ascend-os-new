-- ---------------------------------------------------------------------------
-- 0055  Chase the money, and let a document say where it stands
--
-- receivable has been written since 0014 and settled since 0016, so the
-- debt has always been recorded. Nothing ever looked at it again. An
-- invoice went out with a due date, the date passed, and the system said
-- nothing to anybody. For a Ghanaian SME whose hardest problem is being
-- paid late, that is the most expensive silence in the product.
--
-- Three things, which are one thing:
--
--   The lifecycle gains the seven states the PRD names and the enum never
--   had. Without `overdue` there was nowhere to record that a due date had
--   passed, so the chasing had nothing to key off.
--
--   mark_overdue_documents moves invoices past their date, and expires
--   quotations nobody accepted. Both are derived facts about a date, so
--   they are computed rather than declared, on the same principle the
--   Discover triggers follow.
--
--   queue_payment_reminders asks each overdue invoice's customer, once a
--   week and never more, through the messaging engine every other product
--   set already uses.
--
-- The relay runs all three. It already ticks every five minutes and
-- already drains messages, so reminders need no new machinery, only a
-- reason to exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The states the PRD names (Documents PRD 15) that the enum was missing.
-- Postgres cannot add enum values inside a transaction that then uses them,
-- so these are added first and used by later migrations and by the
-- functions below, which are only ever executed after this commits.
-- ---------------------------------------------------------------------------
alter type document_status add value if not exists 'pending_approval';
alter type document_status add value if not exists 'approved';
alter type document_status add value if not exists 'change_requested';
alter type document_status add value if not exists 'credited';
alter type document_status add value if not exists 'refunded';
alter type document_status add value if not exists 'expired';
alter type document_status add value if not exists 'archived';

-- How long a quotation stands before it lapses, when the merchant has not
-- said otherwise. Thirty days is the ordinary Ghanaian trade quote.
alter table document
  add column if not exists valid_until date;

-- ---------------------------------------------------------------------------
-- A reminder that was actually sent, so a customer is chased and not
-- harassed. One row per document per send, which is what makes "at most
-- once a week" answerable.
-- ---------------------------------------------------------------------------
create table if not exists document_reminder (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references document(id) on delete cascade,
  business_id uuid not null references business(id),
  message_id uuid references message(id),
  sent_at timestamptz not null default now(),
  -- Which chase this was: the first is gentler than the fourth.
  sequence int not null default 1
);

create index if not exists reminder_document_idx
  on document_reminder (document_id, sent_at desc);

alter table document_reminder enable row level security;

create policy reminder_member_read on document_reminder
  for select using (is_business_member(business_id));

insert into message_template (key, purpose, channel, country_code, body, unit_cost)
values
  ('invoice.reminder', 'transactional', 'whatsapp', 'GH',
   'Hello {{customer_name}}, invoice {{document_number}} from {{business_name}} for {{amount}} was due on {{due_date}}. You can see it and pay here: {{link}}',
   0.05)
on conflict (key) do nothing;
