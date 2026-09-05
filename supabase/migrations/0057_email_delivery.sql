-- ---------------------------------------------------------------------------
-- 0057  Send a document by email as well
--
-- WhatsApp reaches 91.8% of Ghanaian internet users, which is why it is the
-- default and will stay the default. But a customer paying on account is
-- often a company, and a company wants the invoice in the inbox their
-- accounts team actually works from. Email was in the message_channel enum
-- from the start and nothing has ever used it.
--
-- It joins the engine every other product set already sends through, rather
-- than growing a second one beside it. Consent, cost, delivery status and
-- retries stay in one place (MSG-008).
--
-- An email needs a subject. WhatsApp does not, which is why the template
-- table never had one.
-- ---------------------------------------------------------------------------

alter table message_template
  add column if not exists subject text;

alter table message
  add column if not exists subject text;

insert into message_template (key, purpose, channel, country_code, subject, body, unit_cost)
values
  ('document.issued.email', 'transactional', 'email', 'GH',
   '{{business_name}}: {{document_type}} {{document_number}}',
   E'Hello {{customer_name}},\n\n{{business_name}} has sent you {{document_type}} {{document_number}} for {{amount}}.\n\nYou can view it, download a copy and pay here:\n{{link}}\n\nThis link is yours alone. {{business_name}} is the seller and handles the order and any questions about it.',
   0),
  ('receipt.sent.email', 'transactional', 'email', 'GH',
   '{{business_name}}: receipt {{document_number}}',
   E'Thank you for buying from {{business_name}}.\n\nYour receipt {{document_number}} for {{amount}} is here:\n{{link}}\n\nKeep this link. It opens the receipt and lets you download a copy.',
   0),
  ('invoice.reminder.email', 'transactional', 'email', 'GH',
   '{{business_name}}: invoice {{document_number}} is past its due date',
   E'Hello {{customer_name}},\n\nInvoice {{document_number}} from {{business_name}} for {{amount}} was due on {{due_date}}.\n\nYou can see it and pay here:\n{{link}}\n\nIf you have already paid, please ignore this message.',
   0)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The subject is rendered from the same approved variables as the body, so
-- an email cannot leak a placeholder the caller never filled.
-- ---------------------------------------------------------------------------
create or replace function render_message_subject(p_template text, p_vars jsonb, p_business text)
returns text
language plpgsql immutable
as $fn$
declare
  v_subject text;
  v_pair record;
begin
  select subject into v_subject from message_template where key = p_template;
  if v_subject is null then
    return null;
  end if;
  v_subject := replace(v_subject, '{{business_name}}', coalesce(p_business, ''));
  for v_pair in select * from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_subject := replace(v_subject, '{{' || v_pair.key || '}}', coalesce(v_pair.value, ''));
  end loop;
  -- Anything still unfilled becomes nothing rather than travelling to the
  -- customer as braces.
  return btrim(regexp_replace(v_subject, '\{\{[a-z_]+\}\}', '', 'g'));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Fill the subject as the message is written, rather than rewriting
-- queue_message. That function is long and every product set depends on it;
-- a trigger that adds one field is a smaller thing to be wrong about.
-- ---------------------------------------------------------------------------
create or replace function message_subject_fill()
returns trigger
language plpgsql
as $fn$
declare
  v_business text;
begin
  if new.subject is not null then
    return new;
  end if;
  select name into v_business from business where id = new.business_id;
  new.subject := render_message_subject(new.template_key, new.variables, v_business);
  return new;
end;
$fn$;

drop trigger if exists message_subject_fill_trg on message;

create trigger message_subject_fill_trg
  before insert on message
  for each row
  execute function message_subject_fill();

-- ---------------------------------------------------------------------------
-- Reminders reach the inbox too.
--
-- Replaced here rather than in 0056 because the email templates this
-- references are inserted above, and a function that names a template row
-- which does not exist yet would fail on its first run.
--
-- The weekly limit counts the chase, not the messages: a customer with
-- both a number and an address is reminded once, on both, not twice.
-- ---------------------------------------------------------------------------
create or replace function queue_payment_reminders(p_limit int default 50)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
  v_sent int := 0;
  v_skipped int := 0;
  v_any boolean;
  v_result jsonb;
  v_sequence int;
  v_vars jsonb;
  v_message uuid;
begin
  for r in
    select d.id, d.business_id, d.customer_id, d.number, d.total, d.due_date,
           c.display_name, c.phone_e164, c.email,
           coalesce(paid.amount, 0) as paid,
           coalesce(rem.n, 0) as reminders,
           rem.last_sent
    from document d
    join customer c on c.id = d.customer_id
    left join lateral (
      select sum(p.amount) as amount
      from payment p
      where p.source_entity_type = 'document'
        and p.source_entity_id = d.id
        and p.status = 'confirmed'
    ) paid on true
    left join lateral (
      select count(*)::int as n, max(sent_at) as last_sent
      from document_reminder dr
      where dr.document_id = d.id
    ) rem on true
    where d.type = 'invoice'
      and d.status = 'overdue'
      and (c.phone_e164 is not null or c.email is not null)
      and coalesce(d.total, 0) - coalesce(paid.amount, 0) > 0.005
      and coalesce(rem.n, 0) < 6
      and (rem.last_sent is null or rem.last_sent < now() - interval '7 days')
    order by d.due_date
    limit p_limit
  loop
    v_sequence := r.reminders + 1;
    v_any := false;
    v_message := null;

    v_vars := jsonb_build_object(
      'customer_name', coalesce(r.display_name, 'there'),
      'document_number', coalesce(r.number, ''),
      'amount', to_char(coalesce(r.total, 0) - r.paid, 'FM999,999,990.00'),
      'due_date', to_char(r.due_date, 'DD Mon YYYY'),
      'link', ''
    );

    begin
      if r.phone_e164 is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder',
          'customer_id', r.customer_id,
          'recipient', r.phone_e164,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text,
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := (v_result->>'message_id')::uuid;
        end if;
      end if;

      if r.email is not null then
        v_result := queue_message(jsonb_build_object(
          'business_id', r.business_id,
          'template_key', 'invoice.reminder.email',
          'customer_id', r.customer_id,
          'recipient', r.email,
          'source_entity_type', 'document',
          'source_entity_id', r.id,
          'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text || ':email',
          'variables', v_vars
        ));
        if not coalesce((v_result->>'duplicate')::boolean, false) then
          v_any := true;
          v_message := coalesce(v_message, (v_result->>'message_id')::uuid);
        end if;
      end if;

      if v_any then
        insert into document_reminder (document_id, business_id, message_id, sequence)
        values (r.id, r.business_id, v_message, v_sequence);
        v_sent := v_sent + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      insert into audit_log (business_id, action, entity_type, entity_id, detail)
      values (r.business_id, 'documents.reminder.failed', 'document', r.id,
              jsonb_build_object('error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('queued', v_sent, 'skipped', v_skipped);
end;
$fn$;

revoke all on function queue_payment_reminders(int) from public, anon, authenticated;
grant execute on function queue_payment_reminders(int) to service_role;
