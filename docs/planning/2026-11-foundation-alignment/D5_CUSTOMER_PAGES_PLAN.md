# D5 Customer-facing pages: plan and decisions

19 November 2026. Part of the v3 design move (`DESIGN_V3_PLAN.md`, step D5). For Collins to approve before the pages change.

## What D5 covers

- **Discover:** `/discover`, today one page of search results.
- **The shop:** `/s/[slug]`, with browse, cart, checkout and order status.
- **Booking:** `/b/[slug]` and `/booked/[id]`.
- **Invoices and receipts:** `/d/[token]`.
- **Promote:** `/promote`, the business's side of Discover.

Each is small today (under 250 lines). The R4 report link and the shop's order flow must keep working.

## What the designs ask for, and what Ascend can back

The Discover designs (web and app) are a whole product: a home screen with editors' picks and a map, search, a business profile, a product page listing every shop that sells it, saved shops, "Reserve for pickup", "Verified · Trusted · 4.8 from 312 reviews", and paying the shop through Ascend Payments.

What is real today:
- Listings with the business, product, price, photo, city and category.
- Whether a listing is promoted, and by which campaign.
- The shop's own page, and the report link (R4).
- View and click events for Promote (`discover_event`).
- Campaigns with a budget and dates, paid from the Ascend Balance.

What is not:
- Ratings and reviews.
- Verified, Trusted or "Ascend Pick" labels.
- Editors' picks.
- Saved shops, which need customers to have accounts.
- A map, because locations have no coordinates filled in.
- Reserving for pickup, and paying through Ascend, which waits for Paystack.
- Interest targeting, and the "based on similar campaigns" estimates.

## Decisions

**1. Discover is a home screen and search, linking to the shop.**
*Recommended:*
- **The home screen:** "What do you need near [city]?" with the city as a choice, the categories that have something in them, and "Popular in [city]" from real listings.
- **Search** results in the design's grid.
- **Every result marked promoted** opens "Why am I seeing this?": who paid, for what, and "Paying for placement never makes a listing more trustworthy". The report link sits there too.
- **A business and a product open the shop**, which already is the business's page.
- **Left out** until they are real: ratings, trust labels, picks, the map, saved shops, reserve for pickup, paying through Ascend.

*The alternative* is a separate Discover business page and product page alongside the shop. That makes two pages for the same thing, so I would not.

**2. The shop, booking, and invoice and receipt pages take the v3 look, and their flows stay as they are.** The shop gets the Discover design's shop front: the business, what it sells, its photos and prices, the cart and checkout. Booking and the document pages get the same light frame. Nothing about ordering, booking or paying changes.

**3. Promote shows its real numbers and keeps its campaign flow.**
*Recommended:*
- The Ascend Balance.
- Each campaign with its budget, dates and status, and what is left to spend.
- Views and clicks from Discover over the last 30 days. Orders only where an order can be traced to a click; otherwise left out.
- **Left out:** interest targeting, estimates, and the MoMo top-up (Paystack).

**4. Labels later, as their own piece.** Verified and Trusted would mean something only if tied to Assurance and the Sustainability Score. That is a product decision, not a page, and I would not invent it here.

**5. Order of work.** Each step is a commit, checked at 375px and 1440px on a throwaway business:
1. Discover.
2. The shop.
3. Booking.
4. Invoices and receipts.
5. Promote.

## What does not change

- The report link and how reports reach the Risk desk.
- Paid placement always marked as paid.
- Shop orders and their statuses.
- Bookings.
- How a document link is shared.

## Build status

**Approved 19 November 2026** as recommended.

**D5 step 1, Discover, 19 November 2026.** `/discover` is the design's home and search. The header carries the search, a city choice drawn from the cities that have listings ("Anywhere" otherwise) and "List your business". The home asks "What do you need near [city] today?" with the categories that have something in them, a "How Discover works" panel where the design has an editors' pick (shop directly, sponsored is said, how to report), shop cards built from the listings (first picture, what kinds, how many things), and the listings as rows. Search and a category show results as rows with the category chips. A sponsored row is marked and opens "Why am I seeing this?": who paid, that paying never makes a listing more trustworthy, and the report form. Every result opens the shop. Checked at 1440px and 375px against live Discover (21 listings, 3 businesses, Accra), read only. Not seen: the sponsored panel, because nothing on live Discover is promoted today.

Left out, as the plan says: picks, the map, ratings, trust labels, saved shops, reserve for pickup, paying through Ascend; and "Book a service", because Discover's search does not say which listings are services. That wants the search to return the item's kind, a small change for later.

**D5 step 2, the shop, 19 November 2026.** The shop front (`StoreBrowse`) follows the design's business screen: a banner of the shop's own product pictures shown whole on teal (one packshot blown up and cropped read as a shop front it was not), the name with what it sells, where and how many items, the search and category chips, a larger product grid, and beside it "Who you are buying from" (the business, where, on Ascend since, how an order is confirmed, collect or delivered), its shops when there are several, who handles delivery and returns, and "Report a problem with this business", moved up from the foot of the page. The header lost its blur and matches the page width. Basket, checkout and order placed are unchanged. Checked at 1440px and 375px on a live shop, read only; an item added to the basket, no order placed.
