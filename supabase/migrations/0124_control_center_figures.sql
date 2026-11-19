-- 0124: the Control Center's figures and business list (D7, approved 19
-- November 2026).
--
-- Read only, and only for the server: the admin pages check currentAdmin
-- before calling either. Counting in the database keeps the Overview quick
-- however many businesses there are, where counting rows in the page would
-- not.
--
-- A business's stage on the way in:
--   signed_up       no active products yet
--   added_products  products, but no sale yet
--   first_sale      has sold, but not in the last 7 days
--   active          sold in the last 7 days

create or replace function control_center_figures()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'businesses', (select count(*) from business),
    'new_7d', (select count(*) from business where created_at >= now() - interval '7 days'),
    'with_products', (select count(distinct business_id) from catalogue_item where active),
    'first_sale', (select count(distinct business_id) from sale),
    'sold_7d', (select count(distinct business_id) from sale where occurred_at >= now() - interval '7 days'),
    'by_product', coalesce((
      select jsonb_object_agg(product_set_key, n)
      from (
        select product_set_key, count(distinct business_id) as n
        from entitlement
        where status in ('active', 'grace') and product_set_key is not null
        group by product_set_key
      ) x
    ), '{}'::jsonb)
  );
$$;

create or replace function control_center_businesses(
  p_stage text default null,
  p_search text default null,
  p_limit int default 100
)
returns table (
  business_id uuid,
  name text,
  created_at timestamptz,
  status text,
  products int,
  last_sale_at timestamptz,
  sales_7d int,
  product_sets text[],
  stage text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with b as (
    select
      bz.id,
      bz.name,
      bz.created_at,
      bz.status::text as status,
      (select count(*)::int from catalogue_item ci where ci.business_id = bz.id and ci.active) as products,
      (select max(s.occurred_at) from sale s where s.business_id = bz.id) as last_sale_at,
      (select count(*)::int from sale s where s.business_id = bz.id and s.occurred_at >= now() - interval '7 days') as sales_7d,
      coalesce((
        select array_agg(distinct e.product_set_key::text order by e.product_set_key::text)
        from entitlement e
        where e.business_id = bz.id and e.status in ('active', 'grace') and e.product_set_key is not null
      ), '{}'::text[]) as product_sets
    from business bz
    where p_search is null or bz.name ilike '%' || p_search || '%'
  ),
  staged as (
    select b.*,
      case
        when b.sales_7d > 0 then 'active'
        when b.last_sale_at is not null then 'first_sale'
        when b.products > 0 then 'added_products'
        else 'signed_up'
      end as stage
    from b
  )
  select id, name, created_at, status, products, last_sale_at, sales_7d, product_sets, stage
  from staged
  where p_stage is null or staged.stage = p_stage
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function control_center_figures() from public, anon, authenticated;
revoke all on function control_center_businesses(text, text, int) from public, anon, authenticated;
grant execute on function control_center_figures() to service_role;
grant execute on function control_center_businesses(text, text, int) to service_role;
