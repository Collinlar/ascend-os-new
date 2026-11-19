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
