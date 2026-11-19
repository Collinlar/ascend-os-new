# D6 The public website: plan and decisions

19 November 2026. Part of the v3 design move (`DESIGN_V3_PLAN.md`, step D6). For Collins to approve before the home page changes.

## What D6 covers

`/`, the ascendsme.africa home page. Today it is a navy hero, "Start with what your business needs today", and four cards that start onboarding by path (POS, Shop, Services, Documents).

The design (`AscendSME Website Home v3`) has six sections:
1. **Hero:** "More customers. More sales. Less running around."
2. **A payments strip.**
3. **"What do you want to fix first?":** three goals, each with a "week on Ascend" example for a shop, a salon and a chop bar.
4. **"Busier counter? Bigger setup. Same business.":** from a phone to a terminal, a counter, then several shops.
5. **"Selling today. Not next month.":** three steps.
6. **A closing call to start.**

A signed-in version shows "Go to your business" in the header.

## What the design says that Ascend cannot back today

A public page that promises what the product does not do is the one thing this step must not do.

| The design says | Today |
|---|---|
| Free app on iPhone and Android, store badges | Ascend is a web app. It can be added to the home screen. |
| Take payment the way customers pay, MoMo prompts, "GHS 85.00 paid" | Cash, MoMo and card are recorded. Nothing is collected through Ascend until Paystack. |
| "Receipt sent on WhatsApp", "Sent the moment your customer pays" | Receipts print, and customer documents go by link. No automatic WhatsApp receipt. |
| "Offer sent to 140 customers", "send reminders and offers that bring them back" | No way to message customers in bulk. Invoice reminders exist. |
| "Peak Milk reorder sent" | Low stock is flagged. Nothing is reordered. |
| "Kitchen and counter in sync" | No kitchen screen. |
| "Reminders sent automatically" for bookings | Not built. |

What is true and belongs on the page:
- One place for sales, the shop, bookings and invoices.
- Stock that counts itself and says when it is running low.
- Staff PINs, shifts and cash-up that balances.
- Selling with no network.
- Your own shop and booking link to share on WhatsApp.
- Being found on Discover, with paid placement marked as paid.
- Customers remembered across everything.
- Takings by product, staff and till.
- Refunds that need an owner's say.
- The Sustainability Score, built from how the business actually runs.

## Decisions

**1. The design's six sections, with every claim true.**
*Recommended:* build all six, and rewrite each line from the table above to say what Ascend does today. For example, the payments strip becomes "Cash, MoMo and card, recorded in one place". Claims come back as the features ship.

**2. The "week on Ascend" examples stay as examples.**
The design shows Ama's Provisions, a salon and a chop bar with figures ("Lunch regulars up to 112").
*Recommended:* keep them as a clearly labelled example business ("An example week"), with only the kinds of figures Ascend really shows: takings, best seller, cash-up balanced, low stock flagged.
*The alternative* is no figures at all, which is safer and duller.

**3. No app store badges.** In their place: "Works in your phone's browser. Add it to your home screen." That is true today.

**4. The hero follows the brand rules, not the template.** Left-aligned and asymmetric, with the design's headline. One action, "Start free", plus a "Sign in" link. The soft teal gradient behind the hero is allowed: the website hero is one of the three places gradients may carry meaning.

**5. The four "where to start" paths stay,** as section 3's choices. Onboarding depends on `?path=`.

**6. Signed in:** the header shows "Open [your business]" instead of "Sign in" and "Start free".

**7. The Sustainability Score gets a line on the page,** because it is the point of Ascend: "Your sales history becomes a record you can take to a lender." This uses the design's own "Funding when you are ready to expand", worded as what is true.

## How it is checked

- At 375px, 768px and 1440px.
- The contrast check.
- Every "Start" link opens the right onboarding path.
- The signed-in header, checked with a throwaway business.
- Each claim against the table above.

## What does not change

- Onboarding and sign-in.
- The other BVM sites.
- The page's metadata, except the title and description, which take the new headline.

## Build status

**Approved 19 November 2026** as recommended, keeping the example figures.

**D6, the home page, 19 November 2026. D6 is complete.** `/` follows the design's six sections, every line rewritten to what Ascend does today:
1. A left-aligned hero ("More customers. More sales. Less running around.") with "Start free" and "Works in your phone's browser. Add it to your home screen." where the store badges were, then "An example week for a" shop, salon or chop bar, labelled "An example, not a real shop", with takings, cash-up, stock flagged, orders and bookings.
2. "Cash, MoMo and card, recorded in one place."
3. "What do you want to fix first?": less chasing, be found, see what sells, each with what is true and an example card (the cash-up, customers found on Discover, a Sustainability Score); the Sustainability Score is "a record of how you really run that you can take to a lender".
4. "Busier counter? Bigger setup. Same business.": phone, handheld, counter, more shops.
5. "Selling today. Not next month.": three steps, then the four places to start (`/onboarding?path=`).
6. A closing call to start.

Signed in, every "Start free" reads "Open [business]" and goes to the dashboard. Checked at 1440px, 768px and 375px, signed out and signed in on a throwaway business: no sideways scroll, both sets of tabs switch, every start link opens its onboarding path. One claim I could not back ("No double bookings") became "Every booking in one diary". Contrast passes; the seven marked exceptions are grounds chosen by a tile or tab, each with its reason.
