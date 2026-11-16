-- ---------------------------------------------------------------------------
-- 0088  Phase 1: customer permissions
--
-- The customers page, a customer's history and recording marketing consent
-- had no permission in the catalogue (0074), so the authority check could
-- only ask "is this person a member of the business?" (the "gap" noted in
-- lib/authority/policy.ts). Everything else a member does is checked against
-- a permission; customers were the last area that was not.
--
--   customers.view    see the customer list and a customer's history: what
--                     they bought, spent and owe              (low risk)
--   customers.manage  record or withdraw a customer's marketing consent
--                                                             (medium risk)
--
-- Consent is evidence under the Ghana Data Protection Act 2012: who recorded
-- that a customer agreed to be messaged, and when (0066). So recording it is
-- kept to the owner and managers.
--
-- Granted, decided by Collins on 16 Nov 2026:
--   owner      both (through "*", which covers every catalogue key)
--   manager    customers.view, customers.manage
--   cashier, accountant, staff   customers.view
-- Every role can still see customers, as today. Applied to the role
-- templates and every business's copy. Added only where missing, so running
-- it twice changes nothing; the 0074 trigger checks the keys exist.
--
-- Tables and columns touched: permission (insert), role.key,
-- role.permissions.
-- ---------------------------------------------------------------------------

insert into permission (key, description, risk, domain) values
  ('customers.view',   'See customers and what they bought, spent and owe', 'low',    'customers'),
  ('customers.manage', 'Record or withdraw a customer''s marketing consent', 'medium', 'customers')
on conflict (key) do nothing;

update role
   set permissions = permissions || (
         select coalesce(jsonb_agg(k), '[]'::jsonb)
         from unnest(array['customers.view', 'customers.manage']) k
         where not (role.permissions ? k)
       )
 where key = 'manager';

update role
   set permissions = permissions || (
         select coalesce(jsonb_agg(k), '[]'::jsonb)
         from unnest(array['customers.view']) k
         where not (role.permissions ? k)
       )
 where key in ('cashier', 'accountant', 'staff');
