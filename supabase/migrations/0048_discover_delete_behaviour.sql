-- ---------------------------------------------------------------------------
-- 0048  What happens to a Discover listing when its product goes away
--
-- 0026 created discover_listing with a plain reference to catalogue_item.
-- That was harmless while the table was empty. 0046 fills it: every
-- shop-visible priced product now has a listing row, and that row pins the
-- product in place. Deleting a product fails on the foreign key before any
-- of our own triggers get a say.
--
-- The rule this migration settles, and the reason for each half:
--
--   A listing is derived state. It describes a product. If the product is
--   gone the listing describes nothing, so it goes too.
--
--   A campaign is money. A business paid to put that listing in front of
--   people and the spend is recorded against it. Money does not quietly
--   disappear because somebody tidied a catalogue, so a campaign still
--   blocks the delete, on purpose and with the history intact.
--
-- Events sit with the listing rather than the campaign. They count clicks.
-- They are not the record of what was charged, that is discover_campaign
-- .spent, so they follow their listing.
--
-- Note that the app retires products (active = false) rather than deleting
-- them, which is right and stays right. This is about what the database
-- does when a delete does reach it, so the answer is a considered one
-- rather than a foreign key error nobody can read.
-- ---------------------------------------------------------------------------

alter table discover_listing
  drop constraint if exists discover_listing_item_id_fkey;

alter table discover_listing
  add constraint discover_listing_item_id_fkey
  foreign key (item_id) references catalogue_item(id) on delete cascade;

alter table discover_event
  drop constraint if exists discover_event_listing_id_fkey;

alter table discover_event
  add constraint discover_event_listing_id_fkey
  foreign key (listing_id) references discover_listing(id) on delete cascade;

-- discover_campaign.listing_id is deliberately left alone. It blocks.
