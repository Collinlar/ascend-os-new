-- AscendSME Connected Platform. Migration 0037: attaching a barcode from
-- the counter (POS-003, POS-INV-005).
--
-- A barcode gets attached where the scanner and the product physically
-- meet, and that is the till, not the dashboard. A cashier holding an item
-- the till does not recognise is in the best position anyone will ever be
-- in to record what that number belongs to: the product is in their hand,
-- the code is already read correctly by a real scanner, and they know what
-- it is because they are about to sell it.
--
-- Waiting for the owner to do this from a desk means it never happens. A
-- shop with two hundred lines does not schedule an afternoon of scanning.

create or replace function attach_item_barcode(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_item catalogue_item%rowtype;
  v_barcode text := nullif(trim(coalesce(p->>'barcode', '')), '');
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_holder text;
begin
  if v_barcode is null then
    raise exception 'barcode_required';
  end if;

  select * into v_item from catalogue_item
  where id = (p->>'item_id')::uuid and business_id = v_business;
  if not found then
    raise exception 'item_not_found';
  end if;

  -- Already attached to this product. A cashier scanning the same item
  -- twice should be told it is done, not told it failed.
  if v_item.barcode is not distinct from v_barcode then
    return jsonb_build_object('item_id', v_item.id, 'already', true);
  end if;

  -- Attached to a different product. Silently moving it would make the
  -- other product unscannable, so this refuses and names the holder.
  select name into v_holder from catalogue_item
  where business_id = v_business and id <> v_item.id and barcode = v_barcode;
  if v_holder is not null then
    raise exception 'barcode_taken:%', v_holder;
  end if;

  update catalogue_item
  set barcode = v_barcode, updated_at = now()
  where id = v_item.id;

  -- Who attached what, because a wrong barcode sells the wrong product and
  -- somebody will need to know where it came from (SEC-006).
  insert into audit_log (
    business_id, actor_membership_id, action, entity_type, entity_id, detail
  ) values (
    v_business, v_actor, 'catalogue.barcode.attached',
    'catalogue_item', v_item.id,
    jsonb_build_object('barcode', v_barcode, 'item', v_item.name,
                       'replaced', v_item.barcode)
  );

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, verification, payload, business_date
  ) values (
    'catalogue.barcode.attached', v_business, v_actor,
    'pos_terminal', 'pos', 'catalogue_item', v_item.id,
    'merchant_declared',
    jsonb_build_object('barcode', v_barcode, 'item', v_item.name),
    current_date
  );

  return jsonb_build_object('item_id', v_item.id, 'already', false);
end;
$$;

revoke all on function attach_item_barcode(jsonb) from public, anon, authenticated;
grant execute on function attach_item_barcode(jsonb) to service_role;
