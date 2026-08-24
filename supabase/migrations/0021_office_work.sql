-- AscendSME Connected Platform. Migration 0021: Ascend Office.
-- The internal operating layer behind sales, orders, services and projects.
-- Its defining rule: Office receives connected work by *referencing* the
-- source record, never copying it (OFF-003, CAP-008). A fulfilment task
-- points at the order; it does not become a second version of the order.

-- ---------------------------------------------------------------------------
-- Approval rules. Who must approve what, above which amount (OFF-011).
-- ---------------------------------------------------------------------------
create table approval_rule (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  kind text not null,                        -- expense | refund | discount | purchase | leave
  threshold_amount numeric(14,2) not null default 0,
  approver_role text not null default 'owner',
  location_id uuid references location(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, kind, location_id)
);

alter table approval_rule enable row level security;
alter table task enable row level security;
alter table project enable row level security;
alter table expense enable row level security;
alter table approval_request enable row level security;

-- ---------------------------------------------------------------------------
-- submit_expense: records money spent and routes it for approval when the
-- business's own rule says it needs one (OFF-012).
--
-- Nothing reaches the financial ledger until it is approved: an unapproved
-- claim is a request, not a cost.
-- ---------------------------------------------------------------------------
create or replace function submit_expense(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_membership uuid := (p->>'membership_id')::uuid;
  v_amount numeric(14,2) := (p->>'amount')::numeric;
  v_rule approval_rule%rowtype;
  v_expense uuid;
  v_approval uuid;
  v_needs_approval boolean := false;
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select * into v_rule
  from approval_rule
  where business_id = v_business and kind = 'expense' and active
    and (location_id is null or location_id = nullif(p->>'location_id', '')::uuid)
  order by location_id nulls last
  limit 1;

  if found and v_amount >= v_rule.threshold_amount then
    v_needs_approval := true;
  end if;

  insert into expense (
    business_id, location_id, membership_id, amount, currency_code,
    category, detail, business_date
  ) values (
    v_business,
    nullif(p->>'location_id', '')::uuid,
    v_membership,
    v_amount,
    coalesce(p->>'currency_code', 'GHS'),
    p->>'category',
    p->>'detail',
    coalesce((p->>'business_date')::date, current_date)
  )
  returning id into v_expense;

  if v_needs_approval then
    insert into approval_request (
      business_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, requested_by, status
    ) values (
      v_business, 'expense', v_amount, coalesce(p->>'currency_code', 'GHS'),
      'expense', v_expense, v_membership, 'requested'
    )
    returning id into v_approval;

    update expense set approval_id = v_approval where id = v_expense;
  else
    -- Below the threshold: it is simply a cost, recorded now.
    insert into ledger_entry (
      business_id, location_id, kind, amount, currency_code,
      source_entity_type, source_entity_id, business_date
    ) values (
      v_business, nullif(p->>'location_id', '')::uuid, 'expense',
      -1 * v_amount, coalesce(p->>'currency_code', 'GHS'),
      'expense', v_expense,
      coalesce((p->>'business_date')::date, current_date)
    );
  end if;

  insert into event_outbox (
    event_type, business_id, location_id, actor_membership_id,
    channel, product_set, entity_type, entity_id,
    amount, currency_code, verification, payload, business_date
  ) values (
    'office.expense.submitted', v_business,
    nullif(p->>'location_id', '')::uuid, v_membership,
    'business_mobile', 'office', 'expense', v_expense,
    v_amount, coalesce(p->>'currency_code', 'GHS'), 'merchant_declared',
    jsonb_build_object('needs_approval', v_needs_approval),
    coalesce((p->>'business_date')::date, current_date)
  );

  return jsonb_build_object(
    'expense_id', v_expense,
    'approval_id', v_approval,
    'needs_approval', v_needs_approval
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_approval: the control point.
--
-- Separation of duties is enforced twice: by the table's own check
-- constraint, and here with a message a human can act on. Someone cannot
-- approve their own request (IDN-016).
-- ---------------------------------------------------------------------------
create or replace function decide_approval(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_request approval_request%rowtype;
  v_decider uuid := (p->>'decider_membership_id')::uuid;
  v_approved boolean := coalesce((p->>'approved')::boolean, false);
  v_expense expense%rowtype;
begin
  select * into v_request from approval_request
  where id = (p->>'approval_id')::uuid
  for update;

  if not found then
    raise exception 'approval_not_found';
  end if;
  if v_request.status <> 'requested' then
    raise exception 'already_decided';
  end if;
  if v_request.requested_by = v_decider then
    raise exception 'cannot_approve_own_request';
  end if;

  update approval_request
  set status = case when v_approved then 'approved'::approval_status else 'rejected'::approval_status end,
      decided_by = v_decider,
      decided_at = now(),
      note = p->>'note'
  where id = v_request.id;

  -- An approved expense becomes a real cost; a rejected one never does.
  if v_approved and v_request.kind = 'expense' then
    select * into v_expense from expense where approval_id = v_request.id;
    if found then
      insert into ledger_entry (
        business_id, location_id, kind, amount, currency_code,
        source_entity_type, source_entity_id, business_date
      ) values (
        v_expense.business_id, v_expense.location_id, 'expense',
        -1 * v_expense.amount, v_expense.currency_code,
        'expense', v_expense.id, v_expense.business_date
      );
    end if;
  end if;

  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_request.business_id, v_decider,
    case when v_approved then 'approval.approved' else 'approval.rejected' end,
    'approval_request', v_request.id,
    jsonb_build_object('kind', v_request.kind, 'amount', v_request.amount)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'office.approval.decided', v_request.business_id, v_decider,
    'business_mobile', 'office', 'approval_request', v_request.id,
    v_request.amount, v_request.currency_code, 'merchant_declared',
    jsonb_build_object('kind', v_request.kind, 'approved', v_approved),
    current_date
  );

  return jsonb_build_object('approval_id', v_request.id, 'approved', v_approved);
end;
$$;

-- ---------------------------------------------------------------------------
-- Connected work. A Shop order or Services booking can raise a task that
-- *points at* the source record (OFF-004, OFF-005). Idempotent per source
-- and title, so a repeated trigger does not litter the board.
-- ---------------------------------------------------------------------------
create or replace function create_linked_task(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_task uuid;
  v_existing uuid;
begin
  select id into v_existing from task
  where business_id = (p->>'business_id')::uuid
    and source_entity_type = p->>'source_entity_type'
    and source_entity_id = (p->>'source_entity_id')::uuid
    and title = p->>'title'
    and status <> 'cancelled';

  if v_existing is not null then
    return jsonb_build_object('task_id', v_existing, 'duplicate', true);
  end if;

  insert into task (
    business_id, project_id, title, detail, status,
    assigned_membership_id, due_at,
    source_entity_type, source_entity_id, created_by
  ) values (
    (p->>'business_id')::uuid,
    nullif(p->>'project_id', '')::uuid,
    p->>'title',
    p->>'detail',
    'open',
    nullif(p->>'assigned_membership_id', '')::uuid,
    nullif(p->>'due_at', '')::timestamptz,
    p->>'source_entity_type',
    nullif(p->>'source_entity_id', '')::uuid,
    nullif(p->>'created_by', '')::uuid
  )
  returning id into v_task;

  return jsonb_build_object('task_id', v_task, 'duplicate', false);
end;
$$;

-- An accepted quotation becomes a project linked to the source document
-- (OFF-006). The quote keeps its number and history; the project points
-- back at it.
create or replace function project_from_quotation(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_doc document%rowtype;
  v_project uuid;
  v_existing uuid;
begin
  select * into v_doc from document where id = (p->>'document_id')::uuid;
  if not found then
    raise exception 'document_not_found';
  end if;
  if v_doc.number is null then
    raise exception 'quotation_not_issued';
  end if;

  select id into v_existing from project
  where source_entity_type = 'document' and source_entity_id = v_doc.id;
  if v_existing is not null then
    return jsonb_build_object('project_id', v_existing, 'duplicate', true);
  end if;

  insert into project (
    business_id, name, customer_id, source_entity_type, source_entity_id, status
  ) values (
    v_doc.business_id,
    coalesce(p->>'name', 'Job from ' || v_doc.number),
    v_doc.customer_id,
    'document', v_doc.id,
    'active'
  )
  returning id into v_project;

  return jsonb_build_object('project_id', v_project, 'duplicate', false);
end;
$$;

-- Attendance: embedded essentials, available without full Office (POS-019,
-- OFF-021). One open check-in per person per day.
create or replace function record_attendance(p jsonb)
returns jsonb
language plpgsql security definer
as $$
declare
  v_membership uuid := (p->>'membership_id')::uuid;
  v_open attendance_record%rowtype;
begin
  select * into v_open from attendance_record
  where membership_id = v_membership and check_out is null
  order by check_in desc limit 1;

  if found then
    update attendance_record set check_out = now() where id = v_open.id;
    return jsonb_build_object('record_id', v_open.id, 'action', 'checked_out');
  end if;

  insert into attendance_record (
    client_ref, business_id, location_id, membership_id, check_in, source
  ) values (
    p->>'client_ref',
    (p->>'business_id')::uuid,
    nullif(p->>'location_id', '')::uuid,
    v_membership,
    now(),
    coalesce(p->>'source', 'mobile')
  )
  on conflict (client_ref) do nothing
  returning id into v_open.id;

  return jsonb_build_object('record_id', v_open.id, 'action', 'checked_in');
end;
$$;
