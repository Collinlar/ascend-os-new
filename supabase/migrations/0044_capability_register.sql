-- AscendSME Connected Platform. Migration 0044: filling the capability
-- register, and making it the thing the app actually asks (ARC-015,
-- CAP-001, XST-001, XST-004..XST-007).
--
-- The architecture calls the capability table the canonical register. It has
-- been empty since it was created, and product_set_capability with it. The
-- real source of truth became a hardcoded map in TypeScript, which is a
-- second register nobody can query, and the app consulted neither: every
-- gate asks whether a business has a whole product set.
--
-- That coarseness is why the experience feels all-on or all-off. A till
-- business is meant to get receipts without buying Documents, and shifts
-- without buying Office. Asked at product-set granularity, that either
-- gives away the whole of Documents or withholds a receipt, and neither is
-- what was designed.
--
-- Two registers become one, in the database, where a query can reach it.

-- ---------------------------------------------------------------------------
-- What the platform can do, and which domain owns each of them.
-- ---------------------------------------------------------------------------
insert into capability (key, name, owning_domain, class, description) values
  -- POS
  ('pos.sell',                    'Sell at a counter',        'pos',       'core',               'Ring up a sale on a terminal, online or off'),
  ('pos.tills',                   'Manage tills',             'identity',  'core',               'Pair, name and stop selling devices'),
  ('pos.shifts',                  'Shifts and drawer counts', 'pos',       'core',               'Open, close and reconcile a cash drawer'),
  ('pos.refunds',                 'Refunds at the till',      'pos',       'core',               'Request and approve a reversal'),

  -- Shop
  ('shop.storefront',             'Online storefront',        'commerce',  'core',               'A public page customers order from'),
  ('shop.orders',                 'Online orders',            'commerce',  'core',               'Receive, confirm and fulfil online orders'),

  -- Services
  ('services.bookings',           'Bookings',                 'services',  'core',               'Take bookings against people and time'),
  ('services.basic_availability', 'When you are free',        'services',  'embedded_essential', 'Working hours and time off'),

  -- Documents
  ('documents.issue',             'Quotes and invoices',      'documents', 'core',               'Issue numbered commercial documents'),
  ('documents.core',              'Documents essentials',     'documents', 'embedded_essential', 'Issue the documents a set needs to trade'),
  ('documents.receipts',          'Receipts',                 'documents', 'embedded_essential', 'A receipt for a sale, without the documents set'),

  -- Office and people
  ('office.work',                 'People and work',          'work',      'core',               'Projects, tasks and approvals'),
  ('office.basic_shifts',         'Shift records',            'work',      'embedded_essential', 'Shift history without the office set'),
  ('office.basic_attendance',     'Attendance',               'work',      'embedded_essential', 'Who worked, without the office set'),
  ('office.basic_order_assignment','Order assignment',        'work',      'embedded_essential', 'Give an order to somebody, without the office set'),
  ('work.core',                   'Work core',                'work',      'core',               'Projects and tasks'),
  ('work.approvals',              'Approvals',                'work',      'core',               'Approve refunds, discounts and spend'),
  ('people.core',                 'People',                   'identity',  'core',               'Everyone who works here'),
  ('people.cashiers',             'Cashiers',                 'identity',  'embedded_essential', 'People who open a till, without the office set'),
  ('people.provider_assignment',  'Assign providers',         'identity',  'embedded_essential', 'Give a booking to a person'),

  -- Shared cores. These are the connected layer: one record, many sets.
  ('customers.core',              'Customers',                'customer',  'embedded_essential', 'One customer record across every set'),
  ('customers.basic',             'Basic customers',          'customer',  'embedded_essential', 'Name and number against a document'),
  ('catalogue.core',              'What you sell',            'catalogue', 'embedded_essential', 'One product identity across every set'),
  ('inventory.basic',             'Stock counts',             'inventory', 'embedded_essential', 'Movement based stock for one location'),
  ('inventory.connection',        'Stock connection',         'inventory', 'embedded_essential', 'Read stock a till already keeps'),
  ('payments.core',               'Payments',                 'finance',   'embedded_essential', 'Collect and record money'),
  ('payments.recording',          'Record a payment',         'finance',   'embedded_essential', 'Mark a document paid'),
  ('payments.deposits',           'Deposits',                 'finance',   'embedded_essential', 'Take a deposit against a booking'),
  ('business.identity',           'Business identity',        'business',  'embedded_essential', 'Name, location and branding on what you issue'),

  -- Platform-managed
  ('discover.listing',            'Be found',                 'commerce',  'core',               'Appear in Ascend Discover'),
  ('readiness.score',             'Investment readiness',     'evidence',  'core',               'A score built from how the business runs')
on conflict (key) do update
  set name = excluded.name,
      owning_domain = excluded.owning_domain,
      class = excluded.class,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- What each product set grants.
--
-- embedded marks a capability borrowed from another domain and included
-- anyway, which is the whole cross-set rule: a till gets its receipts and
-- its shifts without anybody buying Documents or Office.
-- ---------------------------------------------------------------------------
insert into product_set_capability (product_set_key, capability_key, embedded) values
  ('pos', 'pos.sell', false),
  ('pos', 'pos.tills', false),
  ('pos', 'pos.shifts', false),
  ('pos', 'pos.refunds', false),
  ('pos', 'catalogue.core', true),
  ('pos', 'inventory.basic', true),
  ('pos', 'customers.core', true),
  ('pos', 'documents.receipts', true),
  ('pos', 'people.cashiers', true),
  ('pos', 'office.basic_shifts', true),
  ('pos', 'office.basic_attendance', true),

  ('shop', 'shop.storefront', false),
  ('shop', 'shop.orders', false),
  ('shop', 'catalogue.core', true),
  ('shop', 'customers.core', true),
  ('shop', 'payments.core', true),
  ('shop', 'documents.core', true),
  ('shop', 'inventory.connection', true),
  ('shop', 'office.basic_order_assignment', true),

  ('services', 'services.bookings', false),
  ('services', 'services.basic_availability', true),
  ('services', 'customers.core', true),
  ('services', 'documents.core', true),
  ('services', 'payments.deposits', true),
  ('services', 'people.provider_assignment', true),

  ('documents', 'documents.issue', false),
  ('documents', 'documents.core', true),
  ('documents', 'customers.basic', true),
  ('documents', 'payments.recording', true),
  ('documents', 'business.identity', true),

  ('office', 'office.work', false),
  ('office', 'work.core', true),
  ('office', 'work.approvals', true),
  ('office', 'people.core', true),

  ('discover', 'discover.listing', false),
  ('readiness', 'readiness.score', false)
on conflict (product_set_key, capability_key) do update
  set embedded = excluded.embedded;

-- ---------------------------------------------------------------------------
-- What a business can actually do, resolved once.
--
-- Sets grant their capabilities, capability-level entitlements grant one
-- directly, and grace counts as usable: a lapsed entitlement limits live
-- service and never touches history (PRI-004, ENT-013).
-- ---------------------------------------------------------------------------
create or replace function business_capabilities(p_business uuid)
returns table (capability_key text, from_product_set text, embedded boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select distinct on (psc.capability_key)
         psc.capability_key, e.product_set_key, psc.embedded
  from entitlement e
  join product_set_capability psc
    on psc.product_set_key = e.product_set_key
  where e.business_id = p_business
    and e.status in ('active', 'grace')

  union

  select e.capability_key, null, false
  from entitlement e
  where e.business_id = p_business
    and e.status in ('active', 'grace')
    and e.capability_key is not null;
$$;

revoke all on function business_capabilities(uuid) from public, anon, authenticated;
grant execute on function business_capabilities(uuid) to service_role;
