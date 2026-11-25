-- ---------------------------------------------------------------------------
-- 0138  Advanced Inventory A6: stock value and margin
--
-- INVENTORY_CORE_PLAN.md section 8, decision 6 (approved 25 Nov 2026): no
-- FIFO; what is on the shelf worth, and what each product earns over what
-- it cost, both from the moving average cost Ascend has kept since I1.
-- Reads only.
--
-- stock_value(business)
--   For each active place: units on hand (shop holds not taken off; they
--   are still on the shelf), value at cost (on hand at the product's
--   average cost), value at selling prices, and how many products on hand
--   have no cost yet. Products below zero add nothing.
--
-- product_margins(business, from, to)
--   For each product sold in the period: units, sales (transaction_line
--   from the commerce core, on the same rule as Home's top products: earned
--   in the period, not draft, cancelled or reversed), the unit cost, the
--   cost of what was sold, and the margin. The unit cost is the average of
--   the costs carried on the product's sale movements in the period (the
--   trigger since 0125 puts the average cost on every sale), else its
--   average cost now, else none: a product with no cost shows sales and
--   "cost not known", never a margin of 100%.
--
-- Capability inventory.valuation in Advanced Inventory.
--
-- Tables and columns read: location (business_id, active), catalogue_item
-- (name, base_price, average_cost, track_stock, active), stock_movement
-- (location_id, item_id, kind, quantity, unit_cost, occurred_at),
-- commercial_transaction (business_id, earned_at, status), transaction_line
-- (transaction_id, item_id, quantity, line_total).
-- ---------------------------------------------------------------------------

insert into capability (key, name, owning_domain, class, description) values
  ('inventory.valuation', 'Stock value and margin', 'inventory', 'advanced', 'What the shelf is worth, and what each product earns over its cost')
on conflict (key) do update
  set name = excluded.name, owning_domain = excluded.owning_domain,
      class = excluded.class, description = excluded.description;
insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('advanced_inventory', 'inventory.valuation', false)
on conflict (product_set_key, capability_key) do update set embedded = excluded.embedded;

create or replace function stock_value(p_business uuid)
returns table (
  location_id uuid,
  units numeric,
  at_cost numeric,
  at_price numeric,
  products int,
  uncosted_products int
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with on_hand as (
    select m.location_id, m.item_id, sum(m.quantity) as qty
      from stock_movement m
     where m.business_id = p_business and m.kind not in ('reservation', 'reservation_release')
     group by m.location_id, m.item_id
  )
  select l.id,
         coalesce(sum(o.qty) filter (where o.qty > 0), 0),
         coalesce(round(sum(o.qty * ci.average_cost) filter (where o.qty > 0 and ci.average_cost is not null), 2), 0),
         coalesce(round(sum(o.qty * ci.base_price) filter (where o.qty > 0 and ci.base_price is not null), 2), 0),
         (count(*) filter (where o.qty > 0))::int,
         (count(*) filter (where o.qty > 0 and ci.average_cost is null))::int
    from location l
    left join on_hand o on o.location_id = l.id
    left join catalogue_item ci on ci.id = o.item_id and ci.active
   where l.business_id = p_business and l.active
   group by l.id
$fn$;

create or replace function product_margins(p_business uuid, p_from date, p_to date)
returns table (
  item_id uuid,
  name text,
  units numeric,
  sales numeric,
  unit_cost numeric,
  cost numeric,
  margin numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  with sold as (
    select l.item_id, sum(l.quantity) as units, sum(l.line_total) as sales
      from transaction_line l
      join commercial_transaction t on t.id = l.transaction_id
     where t.business_id = p_business
       and t.earned_at >= p_from::timestamptz and t.earned_at < (p_to + 1)::timestamptz
       and t.status not in ('draft', 'cancelled', 'reversed')
       and l.item_id is not null
     group by l.item_id
  ),
  carried as (
    select m.item_id, sum(-m.quantity * m.unit_cost) / nullif(sum(-m.quantity), 0) as unit_cost
      from stock_movement m
     where m.business_id = p_business and m.kind = 'sale' and m.unit_cost is not null and m.quantity < 0
       and m.occurred_at >= p_from::timestamptz and m.occurred_at < (p_to + 1)::timestamptz
     group by m.item_id
  )
  select s.item_id, ci.name, s.units, round(s.sales, 2),
         round(coalesce(c.unit_cost, ci.average_cost), 4),
         round(s.units * coalesce(c.unit_cost, ci.average_cost), 2),
         round(s.sales - s.units * coalesce(c.unit_cost, ci.average_cost), 2)
    from sold s
    join catalogue_item ci on ci.id = s.item_id
    left join carried c on c.item_id = s.item_id
$fn$;

revoke all on function stock_value(uuid) from public, anon, authenticated;
revoke all on function product_margins(uuid, date, date) from public, anon, authenticated;
grant execute on function stock_value(uuid) to service_role;
grant execute on function product_margins(uuid, date, date) to service_role;
