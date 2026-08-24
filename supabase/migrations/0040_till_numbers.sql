-- AscendSME Connected Platform. Migration 0040: every till gets its own
-- number, so receipts stop colliding (POS-RCP-001, POS-RCP-008).
--
-- The terminal built its receipt numbers from a constant. Every till in
-- every shop prefixed T01 and every till started its own sequence at one,
-- and sale carries unique (business_id, receipt_number).
--
-- So a second till's first sale of the day collided with the first till's,
-- and the server rejected it permanently. The till had already taken the
-- money, printed the receipt and written the sale to its own disk. The
-- queue stopped retrying. A shop running two counters was quietly losing
-- one of them.
--
-- The number is assigned here rather than chosen by the device, because
-- only the business knows what it has already handed out.

alter table device_registration
  add column if not exists device_number int;

-- Existing tills keep working: numbered by when they were paired, so the
-- one that has been selling stays T01 and its receipt history stays
-- consistent with what customers are holding.
with numbered as (
  select id,
         row_number() over (
           partition by business_id
           order by coalesce(paired_at, created_at), id
         ) as n
  from device_registration
)
update device_registration d
set device_number = numbered.n
from numbered
where numbered.id = d.id
  and d.device_number is null;

create unique index if not exists device_number_unique
  on device_registration(business_id, device_number)
  where device_number is not null;

-- ---------------------------------------------------------------------------
-- register_device, assigning the next free number for the business.
-- ---------------------------------------------------------------------------
create or replace function register_device(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_code device_pairing_code%rowtype;
  v_device uuid;
  v_number int;
  v_lease timestamptz := now() + interval '14 days';
begin
  select * into v_code from device_pairing_code
  where code_hash = p->>'code_hash'
    and consumed_at is null
    and expires_at > now();
  if not found then
    raise exception 'pairing_code_invalid';
  end if;

  -- The next free number for this business. Revoked tills keep theirs, so
  -- a receipt from a retired terminal is never confused with a new one.
  select coalesce(max(device_number), 0) + 1 into v_number
  from device_registration
  where business_id = v_code.business_id;

  insert into device_registration (
    business_id, location_id, mode, status, label,
    device_fingerprint, offline_lease_expires_at, paired_at, device_number
  ) values (
    v_code.business_id, v_code.location_id, v_code.mode, 'active', v_code.label,
    nullif(p->>'device_fingerprint', ''), v_lease, now(), v_number
  )
  returning id into v_device;

  update device_pairing_code
  set consumed_at = now(), device_id = v_device
  where id = v_code.id;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_code.business_id, v_code.created_by, 'device.registered',
    'device_registration', v_device,
    jsonb_build_object('label', v_code.label, 'mode', v_code.mode,
                       'device_number', v_number)
  );

  return jsonb_build_object(
    'device_id', v_device,
    'business_id', v_code.business_id,
    'location_id', v_code.location_id,
    'lease_expires_at', v_lease,
    'device_number', v_number,
    'label', v_code.label
  );
end;
$$;

revoke all on function register_device(jsonb) from public, anon, authenticated;
grant execute on function register_device(jsonb) to service_role;

-- authenticate_device hands the number back too, so a till paired before
-- this migration learns its own on the next catalogue pull rather than
-- needing to be paired again.
--
-- Reproduced from migration 0012 with one field added. It renews the lease
-- and the freshness signal on every call, which is why it is not marked
-- stable and why those updates must stay exactly as they were.
create or replace function authenticate_device(p_token_hash text, p_lease_days int default 14)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_device device_registration%rowtype;
begin
  select * into v_device
  from device_registration
  where token_hash = p_token_hash;

  if not found or v_device.status in ('revoked', 'retired') then
    return null;
  end if;

  update device_registration
  set offline_lease_expires_at = now() + make_interval(days => p_lease_days),
      last_sync_at = now(),
      status = 'active'
  where id = v_device.id;

  return jsonb_build_object(
    'device_id', v_device.id,
    'business_id', v_device.business_id,
    'location_id', v_device.location_id,
    'mode', v_device.mode,
    'label', v_device.label,
    'lease_expires_at', now() + make_interval(days => p_lease_days),
    'device_number', v_device.device_number
  );
end;
$$;

revoke all on function authenticate_device(text, int) from public, anon, authenticated;
grant execute on function authenticate_device(text, int) to service_role;
