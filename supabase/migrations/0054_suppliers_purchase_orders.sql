-- ---------------------------------------------------------------------------
-- 0054  Suppliers, so a purchase order has somebody to be addressed to
--
-- purchase_order has been in the document_type enum since 0003 and has a
-- numbering prefix in 0014, but nothing could create one, and the reason
-- was further down than the UI: there was nowhere to record a supplier.
-- A purchase order addressed to no one is not a purchase order.
--
-- Note that the existing `purchase` table is not this. That one records a
-- business buying something from AscendSME, for monetization. This is the
-- business buying from its own suppliers, which is the opposite direction
-- and a different set of rules.
--
-- A supplier is deliberately its own record rather than a flag on customer.
-- They overlap in shape and not in meaning: a customer has a shop link, a
-- Discover listing, marketing consent and a payment history the business
-- collects. A supplier has none of those and has terms the business owes
-- against. Merging them would put marketing consent on a wholesaler.
-- ---------------------------------------------------------------------------

create table if not exists supplier (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business(id),
  name text not null,
  contact_name text,
  phone_e164 text,
  email text,
  address text,
  -- What the business has agreed to pay on, in the supplier's own words.
  -- Free text on purpose: Ghanaian trade terms are "end of month", "on
  -- delivery" and "when the container lands", not a tidy day count.
  payment_terms text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_business_idx on supplier (business_id, name);

-- One supplier per name per business, so a second "Melcom" cannot quietly
-- appear and split the purchase history in half.
create unique index if not exists supplier_name_per_business
  on supplier (business_id, lower(btrim(name))) where active;

alter table supplier enable row level security;

create policy supplier_member_read on supplier
  for select using (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- A purchase order is addressed to a supplier, not a customer.
-- ---------------------------------------------------------------------------
alter table document
  add column if not exists supplier_id uuid references supplier(id);

create index if not exists document_supplier_idx
  on document (supplier_id) where supplier_id is not null;

-- Which way round the document faces, in the schema rather than in the
-- code that happens to write it. A purchase order names a supplier and
-- never a customer; everything else is the other way about.
alter table document
  drop constraint if exists document_party_matches_type;

alter table document
  add constraint document_party_matches_type check (
    case
      when type = 'purchase_order' then customer_id is null
      else supplier_id is null
    end
  );

-- ---------------------------------------------------------------------------
-- Supplier totals, for the screen that asks what this business owes and to
-- whom. Reads only issued purchase orders, because a draft is not a
-- commitment to anybody.
-- ---------------------------------------------------------------------------
create or replace function supplier_commitments(p_business uuid)
returns table (
  supplier_id uuid,
  supplier_name text,
  orders int,
  total_ordered numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select s.id, s.name,
         count(d.id)::int,
         coalesce(sum(d.total), 0)
  from supplier s
  left join document d
    on d.supplier_id = s.id
   and d.type = 'purchase_order'
   and d.number is not null
   and d.status <> 'cancelled'
  where s.business_id = p_business and s.active
  group by s.id, s.name
  order by s.name;
$fn$;

revoke all on function supplier_commitments(uuid) from public, anon, authenticated;
grant execute on function supplier_commitments(uuid) to service_role;
