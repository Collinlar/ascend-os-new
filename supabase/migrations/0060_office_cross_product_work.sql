-- ---------------------------------------------------------------------------
-- 0060  Work that arrives on its own
--
-- create_linked_task was written for exactly this and has never been called
-- once: not from the app, not from another function. The task table has
-- been empty since it was built, which is why Office looks like a schema
-- with a demo attached rather than a product set.
--
-- The Office PRD's cross-product section (26) asks for packing and delivery
-- tasks from Shop, and reconciliation exceptions from POS. Both are things
-- the business already does; neither has ever reached the one screen that
-- would show them.
--
-- Two rules, both derived rather than declared, on the same principle as
-- the Discover eligibility triggers: nobody has to remember to raise the
-- work, so nobody can forget.
--
-- Not gated on the Office entitlement, deliberately. Packing an order is
-- the work of running a shop, and the shop is what the merchant is paying
-- for. Office is where the work is shown, not what makes it exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Shop: a confirmed order needs packing, and a finished one does not.
-- ---------------------------------------------------------------------------
create or replace function shop_order_work()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_customer text;
  v_title text;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then
    return null;
  end if;

  select coalesce(c.display_name, 'a customer') into v_customer
  from customer c where c.id = new.customer_id;

  v_title := 'Pack order for ' || coalesce(v_customer, 'a customer');

  if new.status = 'confirmed' then
    begin
      perform create_linked_task(jsonb_build_object(
        'business_id', new.business_id,
        'title', v_title,
        'detail', 'Order placed ' || to_char(new.placed_at, 'DD Mon') ||
                  ', ' || to_char(coalesce(new.total, 0), 'FM999,999,990.00') || ' GHS',
        -- Whoever the order was assigned to. Unassigned is fine: a small
        -- team picks work up rather than being handed it.
        'assigned_membership_id', coalesce(new.assigned_membership_id::text, ''),
        'source_entity_type', 'shop_order',
        'source_entity_id', new.id
      ));
    exception when others then
      -- An order must never fail because a task could not be raised.
      insert into audit_log (business_id, action, entity_type, entity_id, detail)
      values (new.business_id, 'office.task.failed', 'shop_order', new.id,
              jsonb_build_object('error', sqlerrm));
    end;

  elsif new.status in ('fulfilled', 'cancelled', 'refunded') then
    -- The work is over. Closing it rather than leaving it on somebody's
    -- list is the difference between a task list and a graveyard.
    update task
       set status = case when new.status = 'fulfilled' then 'done'::task_status
                         else 'cancelled'::task_status end,
           updated_at = now()
     where source_entity_type = 'shop_order'
       and source_entity_id = new.id
       and status in ('open', 'in_progress', 'blocked');
  end if;

  return null;
end;
$fn$;

drop trigger if exists shop_order_work_trg on shop_order;

create trigger shop_order_work_trg
  after update on shop_order
  for each row
  execute function shop_order_work();

-- ---------------------------------------------------------------------------
-- POS: a till that does not balance is somebody's problem tomorrow morning.
--
-- Only raised where the money is actually out. A shift that balances needs
-- no task, and a task raised for every closed shift would train the owner
-- to ignore the list, which is worse than not having one.
-- ---------------------------------------------------------------------------
create or replace function shift_variance_work()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cashier text;
  v_diff numeric(14,2);
begin
  if tg_op <> 'UPDATE' or new.status <> 'closed' or old.status = 'closed' then
    return null;
  end if;

  v_diff := coalesce(new.cash_difference, 0);
  -- Two cedis of rounding across a day's takings is not an exception.
  if abs(v_diff) < 2 then
    return null;
  end if;

  select coalesce(p.full_name, 'A cashier') into v_cashier
  from business_membership m
  join person p on p.id = m.person_id
  where m.id = new.cashier_membership_id;

  begin
    perform create_linked_task(jsonb_build_object(
      'business_id', new.business_id,
      'title', case when v_diff < 0
                 then 'Till short by ' || to_char(abs(v_diff), 'FM999,999,990.00') || ' GHS'
                 else 'Till over by ' || to_char(v_diff, 'FM999,999,990.00') || ' GHS'
               end,
      'detail', coalesce(v_cashier, 'A cashier') || ', shift closed ' ||
                to_char(coalesce(new.closed_at, now()), 'DD Mon HH24:MI') ||
                coalesce('. Note: ' || new.difference_note, ''),
      'source_entity_type', 'pos_shift',
      'source_entity_id', new.id
    ));
  exception when others then
    -- Closing a shift must never fail because a task could not be raised.
    insert into audit_log (business_id, action, entity_type, entity_id, detail)
    values (new.business_id, 'office.task.failed', 'pos_shift', new.id,
            jsonb_build_object('error', sqlerrm));
  end;

  return null;
end;
$fn$;

drop trigger if exists shift_variance_work_trg on pos_shift;

create trigger shift_variance_work_trg
  after update on pos_shift
  for each row
  execute function shift_variance_work();
