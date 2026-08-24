-- AscendSME Connected Platform. Migration 0012: terminal registration.
-- A device is registered to a business, location and operating mode
-- (IDN-006, HWD-001). Offline authority is a time-limited, device-bound
-- lease (POS-OFF-006) that each successful sync renews, so a revoked or
-- abandoned terminal stops being able to sell on its own (OFL-013).

-- Device credentials. Tokens are stored hashed; the plaintext exists only
-- on the terminal that received it.
alter table device_registration
  add column label text,
  add column token_hash text unique,
  add column paired_at timestamptz,
  add column paired_by uuid references business_membership(id);

-- ---------------------------------------------------------------------------
-- Pairing codes. The owner generates a short code in Business Web and the
-- cashier types it into the terminal. Single use, short lived, hashed at
-- rest so a leaked table does not hand over a till.
-- ---------------------------------------------------------------------------
create table device_pairing_code (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  location_id uuid not null references location(id),
  code_hash text not null unique,
  mode device_mode not null default 'terminal',
  label text,
  created_by uuid not null references business_membership(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  device_id uuid references device_registration(id),
  created_at timestamptz not null default now()
);
create index pairing_business_idx on device_pairing_code(business_id, created_at);

alter table device_pairing_code enable row level security;

-- ---------------------------------------------------------------------------
-- register_device: exchange a pairing code for a registered terminal.
-- Atomic and single use — a replayed code cannot mint a second till.
-- ---------------------------------------------------------------------------
create or replace function register_device(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_code device_pairing_code%rowtype;
  v_device uuid;
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

  insert into device_registration (
    business_id, location_id, mode, status, label,
    token_hash, device_fingerprint, model,
    offline_lease_expires_at, paired_at, paired_by, last_sync_at
  ) values (
    v_code.business_id, v_code.location_id, v_code.mode, 'active', v_code.label,
    p->>'token_hash', nullif(p->>'device_fingerprint', ''), p->>'model',
    now() + make_interval(days => v_lease_days),
    now(), v_code.created_by, now()
  )
  returning id into v_device;

  update device_pairing_code
  set consumed_at = now(), device_id = v_device
  where id = v_code.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_code.business_id, v_code.created_by, 'device.registered',
    'device_registration', v_device,
    jsonb_build_object('label', v_code.label, 'mode', v_code.mode)
  );

  return jsonb_build_object(
    'device_id', v_device,
    'business_id', v_code.business_id,
    'location_id', v_code.location_id,
    'lease_expires_at', now() + make_interval(days => v_lease_days)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- authenticate_device: resolve a token to its device and renew the offline
-- lease. Returns null for unknown, revoked or retired devices so sync and
-- catalogue endpoints share one gate (OFL-013, POS-022).
-- ---------------------------------------------------------------------------
create or replace function authenticate_device(p_token_hash text, p_lease_days int default 14)
returns jsonb
language plpgsql security definer
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

  -- Every authenticated call renews the lease and the freshness signal the
  -- owner sees (POS-013, ARC-013).
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
    'lease_expires_at', now() + make_interval(days => p_lease_days)
  );
end;
$$;

-- Owner-initiated revocation. The device stops syncing as soon as it next
-- reaches the server, and its offline lease is cut immediately.
create or replace function revoke_device(p jsonb)
returns void
language plpgsql security definer
as $$
declare
  v_device device_registration%rowtype;
begin
  select * into v_device from device_registration where id = (p->>'device_id')::uuid;
  if not found then
    raise exception 'device_not_found';
  end if;

  update device_registration
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = nullif(p->>'actor_membership_id', '')::uuid,
      offline_lease_expires_at = now()
  where id = v_device.id;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_device.business_id, nullif(p->>'actor_membership_id', '')::uuid, 'device.revoked',
    'device_registration', v_device.id,
    jsonb_build_object('reason', p->>'reason')
  );
end;
$$;
