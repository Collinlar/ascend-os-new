# D7 The Control Center: plan and decisions

19 November 2026. Part of the v3 design move (`DESIGN_V3_PLAN.md`, step D7, the last). For Collins to approve before the admin pages change.

## Where it is today

`/admin` is four desks for platform admins: an overview with counts, Discover moderation, messaging (deletion requests and flags), and the Risk desk (cases, signals, restrictions, customer reports, appeals; R6). They sit in the business-side page frame.

**No platform admin exists on live yet**, so nobody can open any of it there.

## What the design asks for

A navy Control Center with six sections:
1. **Overview:** alerts like "Settlement mismatch on MTN MoMo", "Smart POS printer failures on firmware 2.3.1", "Field partner under review", "AI processing cost rose 18%".
2. **Merchant lifecycle:** where businesses drop off.
3. **Revenue.**
4. **Merchant Success:** account managers and their books.
5. **Field and Commercial:** field partners and agents.
6. **Support and Audit:** cases with service-level deadlines, and the audit trail.

Also a business identity page, and "view as this merchant".

## What Ascend can back

**Real:**
- Every business: created, product sets, locations, team, tills, products, customers.
- When a business made its first sale, and whether it sold this week.
- Risk cases, signals, restrictions, customer reports and appeals.
- Discover moderation, and messaging deletion requests and flags.
- Ascend's own income: purchases, Balance top-ups, promotion spend.
- The audit log.

**Not there yet:**
- Settlements, which wait for Paystack.
- Terminal firmware and printer health.
- Field partners and agents, and account managers.
- Support tickets and their deadlines.
- AI cost tracking.

## Decisions

**1. The Control Center gets its own navy chrome, as the design and the colour system say.**
*Recommended:* a navy sidebar with:
- Overview
- Businesses
- Revenue
- Risk
- Discover
- Messaging
- Audit

The existing desks move into it unchanged in what they do.

**2. Overview shows only real numbers and real alerts.**
*Recommended:*
- **Figures:** businesses (and new this week), how many made a first sale, how many sold this week, and businesses by product.
- **"Needs you" list:** Risk signals, open appeals, customer reports, deletion requests, messaging flags, and Discover appeals, each linking to its desk.

**3. Businesses: the lifecycle and the identity page, read-only.**
*Recommended:*
- **The lifecycle:** signed up, added products, made a first sale, sold in the last 7 days. Each stage is a count you can open as a list.
- **A business's page:** its name and ID, when it joined, product sets, locations, team size, tills, risk state, last sale, and links to its Risk case if it has one.
- **No editing** here. Changes stay where they are made today: the Risk desk, moderation, entitlements.

**4. Revenue is Ascend's own income.**
*Recommended:* purchases by product, Balance top-ups and sponsored credit, and promotion spend, by month. Settlements wait for Paystack.

**5. Audit shows the audit log, filtered by business, action and date, read-only.** Support cases wait until there is a support desk to have cases.

**6. Left out for now:**
- Merchant Success, and Field and Commercial (no account managers or field partners in the data).
- Support deadlines.
- Fleet health.
- AI cost.
- **"View as this merchant".** Seeing a business exactly as its owner does is a powerful thing to hand anyone, even an admin. If you want it later, it should be its own piece with its own record of every use, not a page in this step.

**7. A platform admin for you on live.** Without one, nothing in D7 can be checked on live.
*Recommended:* a short SQL snippet you run yourself in the Supabase SQL editor, with your own WhatsApp number. Your number never goes in a file in the repository. It adds you to `platform_admin` with the role admin.

**8. Order of work.** Each step is a commit, checked at 1440px and 375px with a temporary ZZ admin that is removed right afterwards:
1. The chrome and Overview.
2. Businesses: the lifecycle and identity.
3. Revenue.
4. Audit.
5. The existing desks restyled inside the chrome.

## What does not change

- What the Risk desk, moderation and messaging desks do.
- Who counts as an admin (`currentAdmin`, `platform_admin`).
- Every admin action stays checked again in the database.

## Build status

**Approved 19 November 2026** as recommended.

**D7 step 1, the chrome and Overview, 19 November 2026.** Every `/admin` page sits in the navy Control Center chrome (`components/admin/ControlShell.tsx`, `app/admin/layout.tsx`): a sidebar from 1024px with Overview, Businesses, Revenue, Risk, Discover, Messaging and Audit, and a scrolling row below that. The layout refuses anyone who is not a platform admin before anything is sent, so no chrome or list of desks reaches them. The Overview shows businesses (and new this week), how many added products, made a first sale and sold this week, each with its share; "Needs one of us", a list of risk appeals, customer reports, deletion requests, Discover appeals, risk signals and messaging flags, each opening its desk; businesses by product; Discover's listed and taken down. The figures come from `0124_control_center_figures.sql` (7/7 locally, waiting to be run) and are left out until it is. Checked at 1440px and 375px with a temporary ZZ admin, removed straight after.

Found, not changed: every "not found" in the app answers with status 200, because the root `app/loading.tsx` makes every page stream and the status goes out first. A missing shop, document link or admin page shows "could not be found" correctly, but search engines and link checkers see a real page.

**D7 steps 2 to 4, 19 November 2026.**
- **Businesses** (`/admin/businesses`): four stage cards (signed up, added products, made a first sale, sold this week) that filter the list, a name search, and a table of business, stage, products, last sale and joined. Each opens `/admin/businesses/[id]`, read only: who they are (ID, joined, kind, status, team, products, customers, last sale, the shop link), what they run on (each product, its source and how long), the risk state with its cases linking to the Risk desk, places, and tills. Needs 0124; until it is applied the list says so.
- **Revenue** (`/admin/revenue`): six months of Ascend's own income from `purchase` and `balance_entry`: bought by businesses, paid by sponsors, Balance topped up and sponsored credit, and spent on promotion and customer messages, as four figures and a month-by-month table. Not the businesses' sales. Live shows nothing in the last six months, which is true.
- **Audit** (`/admin/audit`): the newest 200 log entries matching a business name, a kind (grouped by the first word of the action) and dates, each with its action, time, business, who, and the detail as short pairs.
- The existing Risk, Discover and messaging desks sit inside the chrome unchanged; their own layouts read well in it, so step 5 needed nothing more.

Checked at 1440px and 375px with a temporary ZZ admin, removed straight after.

**0124 applied on live, 19 November 2026.** `control_center_figures` and `control_center_businesses` answer for the server: 31 businesses, 17 with products, 2 with a first sale, 1 sold this week; the stage list splits 14 signed up, 15 added products, 1 first sale, 1 sold this week, which agrees with the Overview. Overview, the stage filter, the name search and a business's page checked at 1440px and 375px with a temporary ZZ admin, removed straight after.

**The not-found status, fixed 20 November 2026.** The root `app/loading.tsx` is gone; each signed-in area has its own `loading.tsx` re-exporting `components/shell/PageLoading.tsx`, so nothing lost its skeleton. Public link pages (`/b`, `/booked`, `/d`, `/partner`) render whole before sending, and `/s/[slug]` checks the shop in a layout (`app/s/[slug]/layout.tsx`, `lib/shop/openShop.ts`, shared with the page through React `cache`) before its own skeleton streams. Checked on the dev server: a missing shop, document, booking, page and partner link answer 404, `/admin` answers 404 to anyone not an admin, and real pages answer 200. Left as is: a missing business ID inside the Control Center still answers 200, since only admins can reach it.
