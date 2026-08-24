-- AscendSME Connected Platform. Migration 0042: repairing register_device,
-- which migration 0040 broke.
--
-- 0040 added a till number and rewrote this function to do it. The rewrite
-- was made from memory rather than from the original, and it dropped
-- token_hash, model, paired_by, last_sync_at, the row lock, and the three
-- separate reasons a pairing code can be refused.
--
-- Losing token_hash is the one that matters. A device paired after 0040 was
-- written with no token, so authenticate_device could never find it again:
-- the till took its pairing code, said it was set up, and then failed every
-- request with a message telling the owner it was no longer active. Any till
-- paired since 0040 landed is in that state and must be paired again after
-- this.
--
-- This is the original from 0012, with the till number added and nothing
-- else changed.

create or replace function register_device(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_code device_pairing_code%rowtype;
  v_device uuid;
  v_number int;
  v_lease_days int := coalesce((p->>'lease_days')::int, 14);
begin
  select * into v_code
  from device_pairing_code
  where code_hash = p->>'code_hash'
  for update;

  if not found then
    raise exception 'pairing_code_invalid';
  end if;
  if v_code.consumed_at is not null then
    raise exception 'pairing_code_used';
  end if;
  if v_code.expires_at < now() then
    raise exception 'pairing_code_expired';
  end if;

  -- The next free number for this business. Revoked tills keep theirs, so a
  -- receipt from a retired terminal is never confused with a new one.
  select coalesce(max(device_number), 0) + 1 into v_number
  from device_registration
  where business_id = v_code.business_id;

  insert into device_registration (
    business_id, location_id, mode, status, label,
    token_hash, device_fingerprint, model,
    offline_lease_expires_at, paired_at, paired_by, last_sync_at,
    device_number
  ) values (
    v_code.business_id, v_code.location_id, v_code.mode, 'active', v_code.label,
    p->>'token_hash', nullif(p->>'device_fingerprint', ''), p->>'model',
    now() + make_interval(days => v_lease_days),
    now(), v_code.created_by, now(),
    v_number
  )
  returning id into v_device;

  update device_pairing_code
  set consumed_at = now(), device_id = v_device
  where id = v_code.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_code.business_id, v_code.created_by, 'device.registered',
    'device_registration', v_device,
    jsonb_build_object('label', v_code.label, 'mode', v_code.mode,
                       'device_number', v_number)
  );

  return jsonb_build_object(
    'device_id', v_device,
    'business_id', v_code.business_id,
    'location_id', v_code.location_id,
    'lease_expires_at', now() + make_interval(days => v_lease_days),
    'device_number', v_number,
    'label', v_code.label
  );
end;
$$;

revoke all on function register_device(jsonb) from public, anon, authenticated;
grant execute on function register_device(jsonb) to service_role;

-- Tills left tokenless by 0040 can never authenticate, so they are retired
-- rather than left looking active on the owner's screen. They keep their
-- number and their history; the physical device simply pairs again.
update device_registration
set status = 'retired',
    revoked_at = coalesce(revoked_at, now())
where token_hash is null
  and status = 'active';
