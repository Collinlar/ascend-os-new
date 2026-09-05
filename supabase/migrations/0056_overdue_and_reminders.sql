-- ---------------------------------------------------------------------------
-- 0056  What the new states are for
--
-- Separate from 0055 on purpose. Postgres will not let a value added by
-- ALTER TYPE ... ADD VALUE be used until the transaction that added it has
-- committed, and these functions use 'expired'. Splitting them is the
-- difference between a migration that runs and one that fails on a type
-- that plainly exists.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- mark_overdue_documents: a due date that has passed is a fact about the
-- calendar, not a decision anybody makes, so it is derived on a tick rather
-- than declared by whoever happens to open the screen.
--
-- Returns what it changed, so the relay can say so in its log rather than
-- working silently.
-- ---------------------------------------------------------------------------
create or replace function mark_overdue_documents()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_overdue int;
  v_expired int;
begin
  -- An invoice that is issued, seen, or part paid, and past its date.
  -- A fully paid one is finished, and a cancelled or credited one is not
  -- money anybody is still waiting for.
  with moved as (
    update document
       set status = 'overdue', updated_at = now()
     where type = 'invoice'
       and number is not null
       and due_date is not null
       and due_date < current_date
       and status in ('issued', 'sent', 'delivered', 'viewed', 'partially_paid')
    returning 1
  )
  select count(*)::int into v_overdue from moved;

  -- A quotation nobody accepted stops standing. The merchant's own date
  -- wins; thirty days is the ordinary Ghanaian trade quote where they did
  -- not set one.
  with lapsed as (
    update document
       set status = 'expired', updated_at = now()
     where type in ('quotation', 'proforma')
       and number is not null
       and status in ('issued', 'sent', 'delivered', 'viewed')
       and coalesce(valid_until, (issued_at + interval '30 days')::date) < current_date
    returning 1
  )
  select count(*)::int into v_expired from lapsed;

  return jsonb_build_object('overdue', v_overdue, 'expired', v_expired);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- queue_payment_reminders: ask, once, politely, and not again this week.
--
-- The messaging engine handles consent, cost and delivery, as it does for
-- every other product set. This decides only who is worth asking.
--
-- Deliberately conservative about who gets chased:
--
--   only overdue invoices with something still outstanding
--   only customers with a number to reach
--   at most one reminder per invoice per week
--   at most six in total, after which a person should be calling, not a
--   robot sending an eighth message
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
  v_result jsonb;
  v_token text;
  v_sequence int;
begin
  for r in
    select d.id, d.business_id, d.customer_id, d.number, d.total, d.due_date,
           c.display_name, c.phone_e164,
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
      and c.phone_e164 is not null
      and coalesce(d.total, 0) - coalesce(paid.amount, 0) > 0.005
      and coalesce(rem.n, 0) < 6
      and (rem.last_sent is null or rem.last_sent < now() - interval '7 days')
    order by d.due_date
    limit p_limit
  loop
    v_sequence := r.reminders + 1;

    -- The customer needs a link that opens the invoice. Reuse a live one
    -- rather than minting a token per reminder, which would leave a trail
    -- of working links to the same document.
    select t.token_hash into v_token
    from document_access_token t
    where t.document_id = r.id
      and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now())
    limit 1;

    begin
      v_result := queue_message(jsonb_build_object(
        'business_id', r.business_id,
        'template_key', 'invoice.reminder',
        'customer_id', r.customer_id,
        'recipient', r.phone_e164,
        'source_entity_type', 'document',
        'source_entity_id', r.id,
        -- One reminder per invoice per week, enforced where it cannot be
        -- raced: a retried relay tick cannot send a second copy.
        'client_ref', 'reminder:' || r.id::text || ':' || v_sequence::text,
        'variables', jsonb_build_object(
          'customer_name', coalesce(r.display_name, 'there'),
          'business_name', '',
          'document_number', coalesce(r.number, ''),
          'amount', to_char(coalesce(r.total, 0) - r.paid, 'FM999,999,990.00'),
          'due_date', to_char(r.due_date, 'DD Mon YYYY'),
          'link', ''
        )
      ));

      if (v_result->>'duplicate')::boolean then
        v_skipped := v_skipped + 1;
      else
        insert into document_reminder (document_id, business_id, message_id, sequence)
        values (r.id, r.business_id, (v_result->>'message_id')::uuid, v_sequence);
        v_sent := v_sent + 1;
      end if;
    exception when others then
      -- One customer's bad record must not stop the rest being chased.
      v_skipped := v_skipped + 1;
      insert into audit_log (business_id, action, entity_type, entity_id, detail)
      values (r.business_id, 'documents.reminder.failed', 'document', r.id,
              jsonb_build_object('error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('queued', v_sent, 'skipped', v_skipped);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- What a merchant is owed, and by whom. The screen behind "who has not
-- paid me" (DOC-REC-*).
-- ---------------------------------------------------------------------------
create or replace function outstanding_receivables(p_business uuid)
returns table (
  document_id uuid,
  number text,
  customer_name text,
  customer_phone text,
  total numeric,
  paid numeric,
  outstanding numeric,
  due_date date,
  days_overdue int,
  reminders int,
  status document_status
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.number, c.display_name, c.phone_e164,
         coalesce(d.total, 0),
         coalesce(paid.amount, 0),
         round(coalesce(d.total, 0) - coalesce(paid.amount, 0), 2),
         d.due_date,
         greatest(0, (current_date - d.due_date))::int,
         coalesce(rem.n, 0),
         d.status
  from document d
  left join customer c on c.id = d.customer_id
  left join lateral (
    select sum(p.amount) as amount
    from payment p
    where p.source_entity_type = 'document'
      and p.source_entity_id = d.id
      and p.status = 'confirmed'
  ) paid on true
  left join lateral (
    select count(*)::int as n from document_reminder dr where dr.document_id = d.id
  ) rem on true
  where d.business_id = p_business
    and d.type = 'invoice'
    and d.number is not null
    and d.status in ('issued', 'sent', 'delivered', 'viewed', 'partially_paid', 'overdue')
    and coalesce(d.total, 0) - coalesce(paid.amount, 0) > 0.005
  order by d.due_date nulls last;
$fn$;

revoke all on function mark_overdue_documents() from public, anon, authenticated;
revoke all on function queue_payment_reminders(int) from public, anon, authenticated;
revoke all on function outstanding_receivables(uuid) from public, anon, authenticated;
grant execute on function mark_overdue_documents() to service_role;
grant execute on function queue_payment_reminders(int) to service_role;
grant execute on function outstanding_receivables(uuid) to service_role;
