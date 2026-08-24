-- AscendSME Connected Platform. Migration 0019: provider availability and
-- time off. Working hours alone are not enough: a provider who travels, is
-- ill or has a funeral to attend must be able to block real days, and the
-- slot calculation has to honour that or customers book into an empty
-- chair (SRV-004).

-- ---------------------------------------------------------------------------
-- Time off. Whole days or part days, with a reason the provider sees and
-- the customer never does.
-- ---------------------------------------------------------------------------
create table staff_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  membership_id uuid not null references business_membership(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references business_membership(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_membership_idx on staff_time_off(membership_id, starts_at);

alter table staff_time_off enable row level security;
alter table staff_availability enable row level security;

-- ---------------------------------------------------------------------------
-- replace_availability: a provider's week, written as one atomic set.
--
-- Replace-all rather than patch: a half-applied schedule is worse than
-- either the old one or the new one, and merchants think in whole weeks.
-- ---------------------------------------------------------------------------
create or replace function replace_availability(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_membership uuid := (p->>'membership_id')::uuid;
  v_business uuid := (p->>'business_id')::uuid;
  v_day jsonb;
  v_count int := 0;
begin
  if v_membership is null or v_business is null then
    raise exception 'membership_and_business_required';
  end if;

  delete from staff_availability
  where membership_id = v_membership and business_id = v_business;

  for v_day in select * from jsonb_array_elements(coalesce(p->'days', '[]'::jsonb))
  loop
    -- A closed day is simply absent, not a zero-length window.
    if coalesce((v_day->>'closed')::boolean, false) then
      continue;
    end if;
    if (v_day->>'start_time') is null or (v_day->>'end_time') is null then
      continue;
    end if;
    if (v_day->>'end_time')::time <= (v_day->>'start_time')::time then
      raise exception 'end_before_start';
    end if;

    insert into staff_availability (
      business_id, membership_id, location_id,
      day_of_week, start_time, end_time, effective_from
    ) values (
      v_business, v_membership,
      nullif(p->>'location_id', '')::uuid,
      (v_day->>'day_of_week')::int,
      (v_day->>'start_time')::time,
      (v_day->>'end_time')::time,
      current_date
    );
    v_count := v_count + 1;
  end loop;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (
    v_business, nullif(p->>'actor_membership_id', '')::uuid,
    'availability.replaced', 'business_membership', v_membership,
    jsonb_build_object('open_days', v_count)
  );

  return jsonb_build_object('open_days', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- available_slots now excludes time off as well as existing bookings.
-- Without this, blocking a day would have had no effect on what customers
-- could book, which is worse than not offering the feature at all.
-- ---------------------------------------------------------------------------
create or replace function available_slots(
  p_item_id uuid,
  p_membership_id uuid,
  p_date date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable
as $$
declare
  v_item catalogue_item%rowtype;
  v_duration int;
  v_buffer int;
  v_step int;
begin
  select * into v_item from catalogue_item where id = p_item_id and kind = 'service';
  if not found then
    return;
  end if;

  v_duration := coalesce((v_item.service_attributes->>'duration_minutes')::int, 60);
  v_buffer := coalesce((v_item.service_attributes->>'buffer_minutes')::int, 0);
  v_step := greatest(coalesce((v_item.service_attributes->>'slot_step_minutes')::int, 30), 5);

  return query
  with windows as (
    select
      (p_date + a.start_time) at time zone 'UTC' as win_start,
      (p_date + a.end_time) at time zone 'UTC' as win_end
    from staff_availability a
    where a.membership_id = p_membership_id
      and a.day_of_week = extract(dow from p_date)::int
      and (a.effective_from is null or a.effective_from <= p_date)
      and (a.effective_to is null or a.effective_to >= p_date)
  ),
  candidates as (
    select
      gs as slot_start,
      gs + make_interval(mins => v_duration) as slot_end
    from windows w,
      generate_series(
        w.win_start,
        w.win_end - make_interval(mins => v_duration),
        make_interval(mins => v_step)
      ) as gs
  )
  select c.slot_start, c.slot_end
  from candidates c
  where c.slot_start > now()
    and not exists (
      select 1 from service_booking b
      where b.assigned_membership_id = p_membership_id
        and b.status in ('confirmed', 'in_progress')
        and b.scheduled_range &&
            tstzrange(
              c.slot_start - make_interval(mins => v_buffer),
              c.slot_end + make_interval(mins => v_buffer),
              '[)'
            )
    )
    and not exists (
      select 1 from staff_time_off t
      where t.membership_id = p_membership_id
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
end;
$$;

-- Bookings a provider already holds inside a period they are trying to
-- block. Blocking time does not silently cancel commitments, so the
-- provider is shown what clashes and decides (SRV-012).
create or replace function bookings_in_period(
  p_membership_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (booking_id uuid, scheduled_start timestamptz, customer_name text)
language sql stable
as $$
  select b.id, b.scheduled_start, c.display_name
  from service_booking b
  left join customer c on c.id = b.customer_id
  where b.assigned_membership_id = p_membership_id
    and b.status in ('confirmed', 'in_progress')
    and b.scheduled_range && tstzrange(p_starts_at, p_ends_at, '[)')
  order by b.scheduled_start;
$$;
