-- ---------------------------------------------------------------------------
-- 0134  What the business owes its suppliers, on the Money page
--
-- 0102 left payables out of the cash position and said so ("not tracked in
-- Ascend yet"). Since 0125 a delivery can be received on credit, and since
-- 0132 paid for later, so what is owed for stock is now known: every stock
-- receipt with a cost and no money out recorded for it.
--
-- cash_position (0102), five counted substitutions:
--   payables   tracked, owed, deliveries, suppliers, older_than_30,
--              oldest_at, as at now. Like receivables, a separate figure,
--              never added to or taken from anything (decision 6).
--   notes      the "not tracked" note goes. In its place: how many
--              deliveries came in with no cost (owed, but not countable),
--              and that only stock deliveries are counted, not other bills.
--              The expenses note no longer says every expense is an Office
--              one whose method is unknown: stock paid for (0125, 0132)
--              carries its method.
--
-- pay_stock_receipt (0132), one counted substitution: paying for a delivery
-- needs inventory.manage only, no longer Advanced Inventory. Receiving on
-- credit is free (I1); without this a business without the set could run up
-- what it owes on the Money page with no way to clear it. Supplier records,
-- orders and reorder rules stay Advanced.
--
-- Tables and columns read: stock_receipt (business_id, total_cost, paid,
-- received_at, supplier_id, supplier_name), financial_event (source_type,
-- source_id, kind), as in 0102 and 0132.
-- ---------------------------------------------------------------------------

-- cash_position as in 0102, with five counted substitutions.
create or replace function cash_position(p_business uuid, p_from date default date_trunc('month', current_date)::date,
                                         p_to date default current_date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  r_rec jsonb; r_ver jsonb; r_pend jsonb; r_recv jsonb; r_exp jsonb; r_pay jsonb;
  v_uncosted int;
  v_notes jsonb := '[]';
  v_open_shifts int; v_off_shifts int; v_exp_total numeric;
begin
  if not exists (select 1 from business where id = p_business) then return null; end if;

  -- 1. Recorded by the business.
  select jsonb_build_object(
           'cash_in', coalesce(sum(amount) filter (where kind = 'money_received' and method = 'cash'), 0),
           'other_declared_in', coalesce(sum(amount) filter (where kind = 'money_received' and method <> 'cash'
                                                              and verification <> 'payment_verified'), 0),
           'cash_refunds', coalesce(sum(amount) filter (where kind = 'refund_paid' and method = 'cash'), 0),
           'till_paid_outs', coalesce(sum(amount) filter (where kind = 'till_expense'), 0),
           'net_cash', coalesce(sum(amount) filter (where kind = 'money_received' and method = 'cash'), 0)
                     - coalesce(sum(amount) filter (where kind = 'refund_paid' and method = 'cash'), 0)
                     - coalesce(sum(amount) filter (where kind = 'till_expense'), 0))
    into r_rec
    from financial_event
   where business_id = p_business and occurred_at >= v_from and occurred_at < v_to;

  -- 2. Verified by a provider.
  select jsonb_build_object(
           'received', coalesce(sum(amount) filter (where kind = 'money_received' and verification = 'payment_verified'), 0),
           'refunded', coalesce(sum(amount) filter (where kind = 'refund_paid' and verification = 'payment_verified'), 0),
           'fees', coalesce(sum(amount) filter (where kind = 'provider_fee'), 0),
           'reversed', coalesce(sum(amount) filter (where kind = 'payment_reversed'), 0),
           'net', coalesce(sum(amount) filter (where kind = 'money_received' and verification = 'payment_verified'), 0)
                - coalesce(sum(amount) filter (where kind = 'refund_paid' and verification = 'payment_verified'), 0)
                - coalesce(sum(amount) filter (where kind = 'provider_fee'), 0)
                - coalesce(sum(amount) filter (where kind = 'payment_reversed'), 0))
    into r_ver
    from financial_event
   where business_id = p_business and occurred_at >= v_from and occurred_at < v_to;

  -- 3. Waiting to be paid out, as at now.
  select jsonb_build_object('amount', coalesce(sum(amount), 0), 'payments', count(*), 'as_at', now())
    into r_pend
    from payment_settlement where business_id = p_business and state = 'awaiting';

  -- 4. Owed to the business, as at now.
  with aged as (select bucket, outstanding from receivables_aging(p_business)),
  buckets as (select bucket, sum(outstanding) as total from aged group by bucket)
  select jsonb_build_object(
           'outstanding', (select coalesce(sum(outstanding), 0) from aged),
           'count', (select count(*) from aged),
           'overdue', (select coalesce(sum(outstanding), 0) from aged where bucket in ('1_30', '31_60', '61_90', 'over_90')),
           'by_bucket', (select coalesce(jsonb_object_agg(bucket, total), '{}') from buckets),
           'as_at', now())
    into r_recv;

  -- Expenses: money out with no recorded method.
  select coalesce(sum(total), 0),
         jsonb_build_object('total', coalesce(sum(total), 0),
                            'by_category', coalesce(jsonb_object_agg(category, total), '{}'))
    into v_exp_total, r_exp
    from (select category, sum(amount) as total from financial_event
           where business_id = p_business and kind = 'expense'
             and occurred_at >= v_from and occurred_at < v_to
           group by category) e;

  -- 5. Owed to suppliers, as at now (0134): every delivery with a cost and
  -- no money out recorded for it yet (0125, paid later by 0132).
  with unpaid as (
    select r.id, r.total_cost, r.received_at, coalesce(r.supplier_id::text, lower(btrim(r.supplier_name)), '') as who
      from stock_receipt r
     where r.business_id = p_business and r.total_cost > 0
       and not exists (select 1 from financial_event f
                        where f.source_type = 'stock_receipt' and f.source_id = r.id and f.kind = 'expense')
  )
  select jsonb_build_object(
           'tracked', true,
           'owed', coalesce(sum(total_cost), 0),
           'deliveries', count(*),
           'suppliers', count(distinct who),
           'older_than_30', coalesce(sum(total_cost) filter (where received_at < now() - interval '30 days'), 0),
           'oldest_at', min(received_at),
           'as_at', now())
    into r_pay
    from unpaid;
  select count(*) into v_uncosted from stock_receipt r
   where r.business_id = p_business and r.total_cost is null and not r.paid;

  -- What the figures cannot show.
  if v_exp_total > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'expenses_method_not_recorded',
      'say', 'Money spent on stock and on approved expenses is shown beside these figures, not taken from them.');
  end if;
  select count(*) filter (where s.closed_at is null),
         count(*) filter (where s.closed_at is not null and coalesce(s.cash_difference, 0) <> 0)
    into v_open_shifts, v_off_shifts
    from pos_shift s
   where s.business_id = p_business and s.opened_at < v_to and coalesce(s.closed_at, now()) >= v_from;
  if v_open_shifts > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'shifts_open', 'count', v_open_shifts,
      'say', 'Some till shifts are still open, so their cash is not counted yet.');
  end if;
  if v_off_shifts > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'shifts_not_balanced', 'count', v_off_shifts,
      'say', 'Some closed shifts did not count out to what was expected.');
  end if;
  -- 0134: what is owed to suppliers counts stock deliveries only.
  if v_uncosted > 0 then
    v_notes := v_notes || jsonb_build_object('note', 'deliveries_without_cost', 'count', v_uncosted,
      'say', case when v_uncosted = 1 then 'One delivery came in with no cost on it, so what is owed for it is not counted.'
                  else v_uncosted || ' deliveries came in with no cost on them, so what is owed for them is not counted.' end);
  end if;
  v_notes := v_notes || jsonb_build_object('note', 'payables_stock_only',
    'say', 'Owed to suppliers counts stock deliveries only, not other bills.');

  return jsonb_build_object(
    'business_id', p_business,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'currency_code', 'GHS',
    'recorded', r_rec,
    'verified', r_ver,
    'pending_settlement', r_pend,
    'receivables', r_recv,
    'payables', r_pay,
    'expenses', r_exp,
    'notes', v_notes);
end
$fn$;

revoke all on function cash_position(uuid, date, date) from public, anon, authenticated;
grant execute on function cash_position(uuid, date, date) to service_role;

-- pay_stock_receipt as in 0132, with one counted substitution.
create or replace function pay_stock_receipt(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := nullif(p->>'actor_membership_id', '')::uuid;
  v_method text := nullif(p->>'payment_method', '');
  v_r stock_receipt%rowtype;
  v_event uuid;
begin
  select * into v_r from stock_receipt
   where id = (p->>'receipt_id')::uuid and business_id = (p->>'business_id')::uuid for update;
  if not found then raise exception 'receipt_not_found'; end if;
  -- 0134: paying for a delivery is part of keeping the money true, like
  -- receiving one paid (0125), so it needs stock rights, not Advanced
  -- Inventory.
  perform require_permission(v_actor, v_r.business_id, array['inventory.manage']);
  if v_method is null or v_method not in ('cash', 'mobile_money', 'bank_transfer', 'card') then
    raise exception 'payment_method_required';
  end if;
  if coalesce(v_r.total_cost, 0) <= 0 then raise exception 'cost_required_when_paid'; end if;

  select id into v_event from financial_event
   where source_type = 'stock_receipt' and source_id = v_r.id and kind = 'expense';
  if found then
    return jsonb_build_object('receipt_id', v_r.id, 'money_out_event', v_event, 'already', true);
  end if;

  insert into financial_event (business_id, source, source_type, source_id, kind, basis, direction, amount,
                               currency_code, category, location_id, counterparty, method, verification,
                               occurred_at, detail)
  values (v_r.business_id, 'inventory', 'stock_receipt', v_r.id, 'expense', 'cash', 'out', v_r.total_cost,
          v_r.currency_code, 'stock_purchases', v_r.location_id, v_r.supplier_name, v_method, 'merchant_declared',
          now(), jsonb_strip_nulls(jsonb_build_object('reference', v_r.reference, 'paid_later', true,
            'received_at', v_r.received_at, 'recorded_by', v_actor)))
  on conflict (source_type, source_id, kind) do nothing
  returning id into v_event;

  insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
  values (v_r.business_id, v_actor, 'inventory.receipt.paid', 'stock_receipt', v_r.id,
          jsonb_build_object('amount', v_r.total_cost, 'method', v_method, 'supplier', v_r.supplier_name));

  return jsonb_build_object('receipt_id', v_r.id, 'money_out_event', v_event, 'already', false, 'amount', v_r.total_cost);
end
$fn$;

revoke all on function pay_stock_receipt(jsonb) from public, anon, authenticated;
grant execute on function pay_stock_receipt(jsonb) to service_role;
