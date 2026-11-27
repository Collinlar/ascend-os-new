-- ---------------------------------------------------------------------------
-- 0150  The product's own sections, and who delivers an order
--       (Modules round 4, S1; decision 8)
--
-- 1. A product can say how to use it, what is inside it and what it is
--    good for, each optional and shown on the customer's product page only
--    when filled. Up to 600 characters each.
-- 2. A delivery order can name who brings it: a name and a phone in full,
--    shown to the customer on their tracking link with Call.
--
-- Reads: catalogue_item (0002), shop_order (0003).
-- ---------------------------------------------------------------------------

alter table catalogue_item
  add column if not exists how_to_use text,
  add column if not exists what_is_inside text,
  add column if not exists good_for text;

alter table catalogue_item drop constraint if exists catalogue_item_details_length;
alter table catalogue_item add constraint catalogue_item_details_length check (
  (how_to_use is null or length(how_to_use) <= 600)
  and (what_is_inside is null or length(what_is_inside) <= 600)
  and (good_for is null or length(good_for) <= 600)
);

alter table shop_order
  add column if not exists rider_name text,
  add column if not exists rider_phone text;

alter table shop_order drop constraint if exists shop_order_rider_check;
alter table shop_order add constraint shop_order_rider_check check (
  (rider_name is null or length(btrim(rider_name)) between 2 and 60)
  and (rider_phone is null or rider_phone ~ '^\+[1-9][0-9]{7,14}$')
);
