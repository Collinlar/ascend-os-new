-- AscendSME Connected Platform. Migration 0141: money taken on the day.
--
-- A shop order is paid at pickup or delivery ("you pay nothing now" at
-- checkout), and a booking's balance is paid after the service. Nothing
-- recorded that money. The commerce core counts a confirmed order or a
-- booking as owed until a payment says otherwise, so every one of them sat
-- in "Owe you" on Customers, Money and Home after the customer had paid.
-- 0140 closed the same gap for invoices; this closes it for orders and
-- bookings (Modules M6a).
--
-- record_order_payment records the money as a confirmed, merchant_declared
-- payment against the order or the booking, exactly as a pay link would
-- record it against them. Everything that follows a payment follows this
-- one: the receipt (0052), the commerce core's allocation (0083), the
-- financial event (0100). It refuses more than is left, a future date, a
-- pay link method, an order not yet confirmed or already cancelled or
-- refunded, a booking not yet accepted or cancelled, another business's
-- record, and a repeated tap (one client_ref, one payment).
--
-- What is "left": the order's total, or the booking's price, less what has
-- been paid against it (confirmed payments less refunds). A deposit paid
-- by pay link is a payment row already. A deposit kept only on the booking
-- (deposit_paid, from before deposits had payment rows) is counted once,
-- whichever of the two is larger.
--
-- Tables and columns touched (checked against the live schema):
--   shop_order: id, business_id, customer_id, status, total, currency_code,
--     updated_at
--   service_booking: id, business_id, customer_id, status, price_quoted,
--     deposit_paid, currency_code, updated_at
--   payment: client_ref, business_id, customer_id, method, status,
--     verification, amount, currency_code, provider_reference,
--     source_entity_type, source_entity_id, actor_membership_id,
--     occurred_at, reversal_of
--   event_outbox: event_type, business_id, actor_membership_id, channel,
--     product_set, entity_type, entity_id, amount, currency_code,
--     verification, payload, business_date

create or replace function record_order_payment(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_business uuid := (p->>'business_id')::uuid;
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_source text := p->>'source';
  v_id uuid := (p->>'source_id')::uuid;
  v_ref text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_order shop_order%rowtype;
  v_booking service_booking%rowtype;
  v_customer uuid;
  v_currency text;
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_left numeric(14,2);
  v_amount numeric(14,2);
  v_method payment_method;
  v_paid_at timestamptz;
  v_payment uuid;
  v_existing payment%rowtype;
begin
  if v_source not in ('shop_order', 'service_booking') then
    raise exception 'source_invalid';
  end if;
  perform require_permission(v_actor, v_business,
    case when v_source = 'shop_order' then array['orders.manage'] else array['bookings.manage'] end);

  if v_ref is null then
    raise exception 'client_ref_required';
  end if;
  select * into v_existing from payment where business_id = v_business and client_ref = v_ref;
  if found then
    return jsonb_build_object('payment_id', v_existing.id, 'duplicate', true);
  end if;

  if v_source = 'shop_order' then
    select * into v_order from shop_order where id = v_id and business_id = v_business for update;
    if not found then
      raise exception 'not_found';
    end if;
    -- A pending order has not been accepted; a cancelled or refunded one is
    -- not owed.
    if v_order.status not in ('confirmed', 'preparing', 'ready', 'out_for_delivery', 'fulfilled') then
      raise exception 'not_open';
    end if;
    v_customer := v_order.customer_id;
    v_currency := v_order.currency_code;
    v_total := coalesce(v_order.total, 0);
  else
    select * into v_booking from service_booking where id = v_id and business_id = v_business for update;
    if not found then
      raise exception 'not_found';
    end if;
    if v_booking.status not in ('confirmed', 'in_progress', 'completed') then
      raise exception 'not_open';
    end if;
    v_customer := v_booking.customer_id;
    v_currency := v_booking.currency_code;
    v_total := coalesce(v_booking.price_quoted, 0);
  end if;

  select coalesce(sum(amount) filter (where status = 'confirmed' and reversal_of is null), 0)
       - coalesce(sum(amount) filter (where status = 'refunded' and reversal_of is not null), 0)
    into v_paid
    from payment
   where source_entity_type = v_source and source_entity_id = v_id;
  if v_source = 'service_booking' then
    v_paid := greatest(v_paid, coalesce(v_booking.deposit_paid, 0));
  end if;
  v_left := greatest(v_total - v_paid, 0);

  begin
    v_amount := round((p->>'amount')::numeric, 2);
  exception when others then
    raise exception 'amount_invalid';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount_invalid';
  end if;
  if v_left <= 0.005 then
    raise exception 'nothing_owed';
  end if;
  if v_amount > v_left + 0.005 then
    raise exception 'payment_over_balance: %', v_left;
  end if;

  if coalesce(p->>'method', '') not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'method_invalid';
  end if;
  v_method := (p->>'method')::payment_method;
  v_paid_at := coalesce(nullif(p->>'paid_at', '')::timestamptz, now());
  if v_paid_at > now() + interval '5 minutes' then
    raise exception 'paid_at_in_future';
  end if;

  insert into payment (
    client_ref, business_id, customer_id, method, status, verification,
    amount, currency_code, provider_reference,
    source_entity_type, source_entity_id, actor_membership_id, occurred_at
  ) values (
    v_ref, v_business, v_customer, v_method, 'confirmed', 'merchant_declared',
    v_amount, coalesce(v_currency, 'GHS'), nullif(btrim(coalesce(p->>'reference', '')), ''),
    v_source, v_id, v_actor, v_paid_at
  )
  returning id into v_payment;

  if v_source = 'shop_order' then
    update shop_order set updated_at = now() where id = v_id;
  else
    update service_booking set updated_at = now() where id = v_id;
  end if;

  insert into event_outbox (
    event_type, business_id, actor_membership_id, channel, product_set,
    entity_type, entity_id, amount, currency_code, verification,
    payload, business_date
  ) values (
    'finance.payment.confirmed', v_business, v_actor, 'business_web',
    case when v_source = 'shop_order' then 'shop' else 'services' end,
    'payment', v_payment, v_amount, coalesce(v_currency, 'GHS'), 'merchant_declared',
    jsonb_build_object('purpose', v_source, 'source_id', v_id, 'method', v_method, 'recorded_by_hand', true),
    (v_paid_at at time zone 'Africa/Accra')::date
  );

  return jsonb_build_object(
    'payment_id', v_payment,
    'duplicate', false,
    'left', greatest(v_left - v_amount, 0)
  );
end;
$fn$;

revoke all on function record_order_payment(jsonb) from public, anon, authenticated;
grant execute on function record_order_payment(jsonb) to service_role;
