-- AscendSME Connected Platform. Migration 0033: unaccounted sales
-- detection (POS-013, POS-OFF-004, ARC-013).
--
-- Durable local storage reduces the chance of losing queued sales. It does
-- not remove it: a merchant can clear app data, a device can be dropped in
-- a gutter, a cheap handheld can fail outright. The difference that matters
-- to a business owner is whether loss is silent.
--
-- Every till issues receipt numbers from a monotonic per-device sequence.
-- If the till has issued up to number 42, the server holds 38 of them, and
-- the till says 2 are still queued, then 2 sales existed and are now in
-- neither place. That is reported rather than discovered at month end when
-- the cash does not match the records.

alter table device_registration
  add column receipt_seq_high int not null default 0,
  add column receipt_seq_reported_at timestamptz,
  -- Devices already in the field predate this scheme and would otherwise
  -- all report a gap on their first sync. The first report sets a baseline
  -- instead of crying wolf.
  add column unaccounted_baseline int not null default 0,
  add column unaccounted_sales int not null default 0,
  add column gap_detected_at timestamptz;

create or replace function record_device_watermark(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_device device_registration%rowtype;
  v_high int := greatest(coalesce((p->>'receipt_seq_high')::int, 0), 0);
  v_pending int := greatest(coalesce((p->>'pending_count')::int, 0), 0);
  v_received int;
  v_unaccounted int;
  v_first boolean;
begin
  select * into v_device from device_registration
  where id = (p->>'device_id')::uuid
  for update;
  if not found then
    raise exception 'device_not_found';
  end if;

  -- Only sales this till issued from its own sequence count. Reversals are
  -- written by the server against an existing sale and never consume a
  -- device sequence number, so counting them would hide a real gap.
  select count(*) into v_received
  from sale
  where device_id = v_device.id
    and reversal_of is null;

  v_unaccounted := greatest(v_high - v_received - v_pending, 0);
  v_first := v_device.receipt_seq_reported_at is null;

  if v_first then
    -- Whatever the first report shows is treated as history, not loss.
    update device_registration
    set receipt_seq_high = v_high,
        receipt_seq_reported_at = now(),
        unaccounted_baseline = v_unaccounted,
        unaccounted_sales = 0,
        pending_transaction_count = v_pending
    where id = v_device.id;

    return jsonb_build_object(
      'issued', v_high, 'received', v_received, 'queued', v_pending,
      'unaccounted', 0, 'baseline_set', true
    );
  end if;

  -- A sequence that runs backwards is the loudest possible signal that
  -- local state was lost. It became reachable the moment the device token
  -- moved to native secure storage: the till can now keep its identity
  -- through a data clear that empties its queue, so it re-pairs with
  -- nobody and quietly restarts numbering at 1. Anything it had queued is
  -- gone, and the numbers it is about to issue collide with ones already
  -- spent.
  if v_high < v_device.receipt_seq_high then
    v_unaccounted := greatest(v_device.receipt_seq_high - v_received, 0);

    update device_registration
    set receipt_seq_reported_at = now(),
        unaccounted_sales = v_unaccounted,
        gap_detected_at = coalesce(v_device.gap_detected_at, now()),
        pending_transaction_count = v_pending
    where id = v_device.id;

    insert into audit_log (
      business_id, actor_membership_id, action, entity_type, entity_id, detail
    ) values (
      v_device.business_id, null, 'pos.sequence.regressed',
      'device_registration', v_device.id,
      jsonb_build_object('was', v_device.receipt_seq_high, 'now', v_high,
                         'received', v_received, 'unaccounted', v_unaccounted)
    );

    insert into event_outbox (
      event_type, business_id, location_id, channel, product_set,
      entity_type, entity_id, verification, payload, business_date
    ) values (
      'pos.sequence.regressed', v_device.business_id, v_device.location_id,
      'pos_terminal', 'pos', 'device_registration', v_device.id,
      'system_observed',
      jsonb_build_object('was', v_device.receipt_seq_high, 'now', v_high,
                         'unaccounted', v_unaccounted),
      current_date
    );

    return jsonb_build_object(
      'issued', v_high, 'received', v_received, 'queued', v_pending,
      'unaccounted', v_unaccounted, 'regressed', true
    );
  end if;

  -- Growth beyond the baseline is what counts as newly lost.
  v_unaccounted := greatest(v_unaccounted - v_device.unaccounted_baseline, 0);

  update device_registration
  set receipt_seq_high = greatest(v_high, receipt_seq_high),
      receipt_seq_reported_at = now(),
      unaccounted_sales = v_unaccounted,
      gap_detected_at = case
        when v_unaccounted > 0 and v_device.unaccounted_sales = 0 then now()
        when v_unaccounted = 0 then null
        else v_device.gap_detected_at
      end,
      pending_transaction_count = v_pending
  where id = v_device.id;

  -- Raise once on the transition into a gap, not on every sync, or an
  -- owner learns to ignore it.
  if v_unaccounted > 0 and v_device.unaccounted_sales = 0 then
    insert into audit_log (
      business_id, actor_membership_id, action, entity_type, entity_id, detail
    ) values (
      v_device.business_id, null, 'pos.sales.unaccounted',
      'device_registration', v_device.id,
      jsonb_build_object('issued', v_high, 'received', v_received,
                         'queued', v_pending, 'unaccounted', v_unaccounted)
    );

    insert into event_outbox (
      event_type, business_id, location_id, channel, product_set,
      entity_type, entity_id, verification, payload, business_date
    ) values (
      'pos.sales.unaccounted', v_device.business_id, v_device.location_id,
      'pos_terminal', 'pos', 'device_registration', v_device.id,
      'system_observed',
      jsonb_build_object('unaccounted', v_unaccounted,
                         'device', coalesce(v_device.serial_number, 'till')),
      current_date
    );
  end if;

  return jsonb_build_object(
    'issued', v_high, 'received', v_received, 'queued', v_pending,
    'unaccounted', v_unaccounted, 'baseline_set', false
  );
end;
$$;

-- What an owner sees when they ask whether their tills are healthy.
create or replace function till_health(p_business uuid)
returns table (
  device_id uuid,
  label text,
  status device_status,
  last_sync_at timestamptz,
  queued int,
  unaccounted int,
  gap_detected_at timestamptz
)
language sql stable security definer
as $$
  select d.id, coalesce(d.serial_number, 'Till'), d.status, d.last_sync_at,
         d.pending_transaction_count, d.unaccounted_sales, d.gap_detected_at
  from device_registration d
  where d.business_id = p_business
    and d.revoked_at is null
  order by d.unaccounted_sales desc, d.last_sync_at asc nulls first;
$$;
