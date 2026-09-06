-- ---------------------------------------------------------------------------
-- 0066  Consent that can be shown, not just claimed
--
-- consent_record has existed since 0002 and has never been written. Nothing
-- reads it either. What the messaging engine actually checks is
-- customer.marketing_consent, a single boolean on the customer row, which
-- says a customer agreed but not when, to what, on which channel, or
-- whether they later changed their mind.
--
-- SEC-011 asks that a consent record identify purpose, fields, recipient,
-- duration and withdrawal status. The Ghana Data Protection Act 2012
-- requires a business to be able to show that consent was given, and a
-- boolean cannot show anything: flip it back and the evidence is gone.
--
-- The boolean stays, because every existing caller reads it and a flag is
-- the right shape for a fast check inside queue_message. It becomes derived
-- from the record rather than being the record.
-- ---------------------------------------------------------------------------

alter table consent_record
  add column if not exists source text;

alter table consent_record
  add column if not exists evidence jsonb not null default '{}';

create index if not exists consent_customer_idx
  on consent_record (customer_id, purpose, granted_at desc);

-- ---------------------------------------------------------------------------
-- record_consent: somebody agreed, or withdrew.
--
-- Withdrawal closes the standing grant rather than deleting it. A deleted
-- consent record cannot answer "were you allowed to message them in March",
-- which is exactly the question a regulator asks.
-- ---------------------------------------------------------------------------
create or replace function record_consent(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_customer uuid := (p->>'customer_id')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_purpose text := coalesce(nullif(p->>'purpose', ''), 'marketing');
  v_granted boolean := coalesce((p->>'granted')::boolean, true);
  v_record uuid;
begin
  if v_customer is null or v_business is null then
    raise exception 'customer_and_business_required';
  end if;

  if v_granted then
    -- Already standing: nothing to record, and a second row would make the
    -- history read as if they agreed twice.
    select id into v_record
    from consent_record
    where customer_id = v_customer and purpose = v_purpose and withdrawn_at is null
    limit 1;

    if v_record is null then
      insert into consent_record (
        business_id, customer_id, purpose, channel, source, evidence
      ) values (
        v_business, v_customer, v_purpose,
        nullif(p->>'channel', ''),
        coalesce(nullif(p->>'source', ''), 'merchant_recorded'),
        coalesce(p->'evidence', '{}'::jsonb)
      )
      returning id into v_record;
    end if;
  else
    update consent_record
       set withdrawn_at = now()
     where customer_id = v_customer
       and purpose = v_purpose
       and withdrawn_at is null
    returning id into v_record;
  end if;

  -- The flag every existing caller reads, kept in step with the record it
  -- now derives from.
  if v_purpose = 'marketing' then
    update customer
       set marketing_consent = v_granted,
           marketing_opt_out_at = case when v_granted then null else now() end,
           updated_at = now()
     where id = v_customer;
  end if;

  return jsonb_build_object(
    'consent_id', v_record,
    'purpose', v_purpose,
    'granted', v_granted
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Is there a live consent for this purpose right now?
--
-- The question queue_message is really asking, answerable from the record
-- rather than the flag.
-- ---------------------------------------------------------------------------
create or replace function has_consent(p_customer uuid, p_purpose text default 'marketing')
returns boolean
language sql stable
as $fn$
  select exists (
    select 1 from consent_record
    where customer_id = p_customer
      and purpose = p_purpose
      and withdrawn_at is null
  );
$fn$;

-- ---------------------------------------------------------------------------
-- The trail itself, for the day somebody has to show it.
-- ---------------------------------------------------------------------------
create or replace function consent_history(p_business uuid, p_customer uuid default null)
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  purpose text,
  channel text,
  source text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  still_standing boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select cr.id, cr.customer_id, c.display_name, cr.purpose, cr.channel,
         cr.source, cr.granted_at, cr.withdrawn_at,
         cr.withdrawn_at is null
  from consent_record cr
  join customer c on c.id = cr.customer_id
  where cr.business_id = p_business
    and (p_customer is null or cr.customer_id = p_customer)
  order by cr.granted_at desc;
$fn$;

-- ---------------------------------------------------------------------------
-- Backfill. Customers already carrying the flag agreed at some point, and
-- losing that would be worse than recording it with what we know.
--
-- source says where it came from so nobody later mistakes a reconstructed
-- record for a captured one.
-- ---------------------------------------------------------------------------
insert into consent_record (business_id, customer_id, purpose, channel, source, granted_at, evidence)
select c.business_id, c.id, 'marketing', 'whatsapp', 'backfilled_from_flag',
       c.created_at,
       jsonb_build_object(
         'note', 'reconstructed from customer.marketing_consent in 0066',
         'created_via', c.created_via
       )
from customer c
where c.marketing_consent
  and c.marketing_opt_out_at is null
  and not exists (
    select 1 from consent_record cr
    where cr.customer_id = c.id and cr.purpose = 'marketing'
  );

-- ---------------------------------------------------------------------------
-- Keep the flag honest from here on.
--
-- Anything that sets marketing_consent directly, in code we have not
-- written yet or a support fix run by hand, leaves a record behind. Without
-- this the flag could drift away from the trail again, which is the
-- position 0066 exists to end.
-- ---------------------------------------------------------------------------
create or replace function consent_flag_leaves_a_record()
returns trigger
language plpgsql
as $fn$
begin
  if new.marketing_consent = old.marketing_consent then
    return new;
  end if;

  if new.marketing_consent then
    if not exists (
      select 1 from consent_record
      where customer_id = new.id and purpose = 'marketing' and withdrawn_at is null
    ) then
      insert into consent_record (business_id, customer_id, purpose, source, evidence)
      values (new.business_id, new.id, 'marketing', 'flag_set_directly',
              jsonb_build_object('note', 'recorded by trigger in 0066'));
    end if;
  else
    update consent_record
       set withdrawn_at = now()
     where customer_id = new.id and purpose = 'marketing' and withdrawn_at is null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists consent_flag_leaves_a_record_trg on customer;

create trigger consent_flag_leaves_a_record_trg
  after update of marketing_consent on customer
  for each row
  execute function consent_flag_leaves_a_record();

revoke all on function record_consent(jsonb) from public, anon, authenticated;
revoke all on function consent_history(uuid, uuid) from public, anon, authenticated;
grant execute on function record_consent(jsonb) to service_role;
grant execute on function consent_history(uuid, uuid) to service_role;
grant execute on function has_consent(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The customer list now says whether it may market to them.
--
-- Replaced here rather than edited into 0064, which has already been run.
-- An applied migration is a record of what happened; changing it would mean
-- this database and a freshly built one no longer agree.
-- ---------------------------------------------------------------------------
create or replace function business_customers(p_business uuid, p_query text default null)
returns table (
  id uuid,
  display_name text,
  phone_e164 text,
  email text,
  created_via text,
  marketing_consent boolean,
  orders int,
  sales int,
  bookings int,
  documents int,
  spent numeric,
  owed numeric,
  last_seen timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select
    c.id, c.display_name, c.phone_e164, c.email, c.created_via,
    c.marketing_consent,
    coalesce(o.n, 0)::int, coalesce(s.n, 0)::int,
    coalesce(b.n, 0)::int, coalesce(d.n, 0)::int,
    -- What they have actually paid, across every channel.
    coalesce(paid.total, 0),
    -- What they still owe on issued invoices.
    coalesce(due.total, 0),
    greatest(
      coalesce(o.last_at, 'epoch'::timestamptz),
      coalesce(s.last_at, 'epoch'::timestamptz),
      coalesce(b.last_at, 'epoch'::timestamptz),
      coalesce(d.last_at, 'epoch'::timestamptz)
    )
  from customer c
  left join lateral (select count(*) n, max(placed_at) last_at from shop_order where customer_id = c.id) o on true
  left join lateral (select count(*) n, max(occurred_at) last_at from sale where customer_id = c.id) s on true
  left join lateral (select count(*) n, max(created_at) last_at from service_booking where customer_id = c.id) b on true
  left join lateral (select count(*) n, max(created_at) last_at from document where customer_id = c.id and number is not null) d on true
  left join lateral (
    select sum(amount) total from payment
    where customer_id = c.id and status = 'confirmed'
  ) paid on true
  left join lateral (
    select sum(coalesce(dd.total, 0)) total from document dd
    where dd.customer_id = c.id and dd.type = 'invoice' and dd.number is not null
      and dd.status in ('issued','sent','delivered','viewed','partially_paid','overdue')
  ) due on true
  where c.business_id = p_business
    and (
      p_query is null or p_query = ''
      or c.display_name ilike '%' || p_query || '%'
      or c.phone_e164 ilike '%' || p_query || '%'
      or c.email ilike '%' || p_query || '%'
    )
  order by greatest(
    coalesce(o.last_at, 'epoch'::timestamptz),
    coalesce(s.last_at, 'epoch'::timestamptz),
    coalesce(b.last_at, 'epoch'::timestamptz),
    coalesce(d.last_at, 'epoch'::timestamptz)
  ) desc nulls last,
  c.display_name;
$fn$;

revoke all on function business_customers(uuid, text) from public, anon, authenticated;
grant execute on function business_customers(uuid, text) to service_role;
