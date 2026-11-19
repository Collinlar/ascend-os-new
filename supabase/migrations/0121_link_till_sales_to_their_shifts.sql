-- 0121: link the till sales that were never linked to their shift, and put
-- right the closed shifts that expected the wrong cash because of it.
--
-- Until 18 November 2026 (D4a) lib/domains/pos.ts never passed the till's
-- shift reference to complete_pos_sale, so no till sale was linked to its
-- shift. close_pos_shift counts only linked cash sales, so a shift with
-- sales in it closed expecting just its opening cash, and a cashier who
-- counted correctly read as over by the shift's cash takings.
--
-- Approved by Collins on 18 November 2026. On live at the time: one closed
-- shift wrong (CLASmart, 23 August, 16:40, GHS 890 over), six sales inside
-- shifts still open, six sales made with no shift open, which stay as they
-- are.
--
-- 1. A till sale with no shift is linked to the one shift on the same till
--    whose time covers it: opened at or before the sale, and not closed
--    before it. Sales that fall in no shift, or (impossibly) in two, are
--    left alone.
-- 2. Every closed shift's expected cash is worked out again by the rule
--    close_pos_shift uses (opening cash, plus confirmed cash payments on its
--    sales, less till expenses), and its difference with it. Only shifts
--    whose figure changes are touched, each with an audit entry saying what
--    it was. The pos.shift.closed events are history and are not rewritten.
--
-- Running it again changes nothing.

with matched as (
  select s.id as sale_id, min(sh.id::text)::uuid as shift_id, count(*) as n
  from sale s
  join pos_shift sh
    on sh.business_id = s.business_id
   and sh.device_id = s.device_id
   and sh.opened_at <= s.occurred_at
   and (sh.closed_at is null or s.occurred_at <= sh.closed_at)
  where s.shift_id is null
    and s.device_id is not null
  group by s.id
)
update sale s
set shift_id = m.shift_id
from matched m
where s.id = m.sale_id
  and m.n = 1;

with worked as (
  select
    sh.id,
    sh.business_id,
    sh.expected_cash as was_expected,
    sh.cash_difference as was_difference,
    sh.declared_cash,
    coalesce(sh.opening_cash, 0)
      + coalesce((
          select sum(pay.amount)
          from payment pay
          join sale s on s.id = pay.source_entity_id and pay.source_entity_type = 'sale'
          where s.shift_id = sh.id
            and pay.method = 'cash'
            and pay.status = 'confirmed'
        ), 0)
      - coalesce((select sum(e.amount) from till_expense e where e.shift_id = sh.id), 0)
      as expected
  from pos_shift sh
  where sh.status = 'closed'
),
changed as (
  update pos_shift sh
  set expected_cash = w.expected,
      cash_difference = case when w.declared_cash is null then null else w.declared_cash - w.expected end
  from worked w
  where sh.id = w.id
    and w.expected is distinct from w.was_expected
  returning sh.id, sh.business_id, w.was_expected, w.was_difference, sh.expected_cash, sh.cash_difference
)
insert into audit_log (business_id, actor_membership_id, action, entity_type, entity_id, detail)
select
  c.business_id, null, 'pos.shift.expected_cash.corrected', 'pos_shift', c.id,
  jsonb_build_object(
    'was_expected', c.was_expected,
    'was_difference', c.was_difference,
    'now_expected', c.expected_cash,
    'now_difference', c.cash_difference,
    'why', 'Till sales had not been linked to their shift (fixed 18 November 2026, migration 0121)'
  )
from changed c;
