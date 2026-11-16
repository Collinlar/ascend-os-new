# Phase 2, step 2d: the screens read the commerce core

**Prepared:** 15 Nov 2026, against `main` at `d8c04a8` (migrations through 0086)
**Parent plan:** `PHASE_2_PLAN.md` (step 2d, decision 9.6)
**Status:** Proposal for approval. No code until Collins approves the decisions in section 8.

---

## 1. What 2d is for

The commerce core (0082 to 0085) now holds one record of what was sold, owed and paid, and the reconciliation (0084) proves it agrees with the products. Step 2d makes the screens that answer money questions read that record instead of the product tables. It is the step that turns the core from a correct copy into the source merchants actually see.

**Exit gate (from the Phase 2 plan):** what was sold, what is owed and what was paid are answered from the core alone, without reading `sale`, `shop_order`, `service_booking` or `document`.

## 2. Which screens, corrected

The Phase 2 plan named three readers: the dashboard, the customer record and readiness evidence. Reading the code shows two of them read money, and one does not:

| Screen | Reads money from | In 2d? |
|---|---|---|
| Dashboard (`lib/reporting/dashboard.ts`) | `sale`, `shop_order`, `payment`, `receivable` | **Yes** |
| Customers list (`business_customers()`, 0066) | `payment`, `document` | **Yes** |
| Readiness score (`compute_readiness()`, 0022) | `evidence_record` only, written from product events | **No.** It never reads the product tables. Moving its evidence onto the core is the evidence envelope work in Phase 5. |

Activity counts on the customers list (how many orders, sales, bookings and documents, and last seen) are not money and stay as they are.

## 3. What is wrong with each figure today

Every figure below was traced in the code; the live amounts were measured on 15 Nov 2026.

| Figure | Today | The problem |
|---|---|---|
| Dashboard: **Sales today** | Till sales completed today plus shop orders fulfilled today | Leaves out completed bookings and issued invoices, which the business earned just the same |
| Dashboard: **Received today** | Every confirmed payment today | Counts the merchant's **own Ascend Balance top-ups** as money from customers; does not subtract refunds paid out |
| Dashboard: **Owed**, customers owing, oldest overdue, the overdue alert | Unsettled receivables | Ignores credit notes (live: shows **GHS 400** owed on an invoice credited in full); counts a proforma converted to an invoice twice; knows nothing of booking balances |
| Customers: **Spent** | Confirmed payments by that customer | Does not subtract refunds |
| Customers: **Owed** | The full total of every open invoice | Ignores payments already made (an invoice of 250 with 200 paid shows 250 owed) and credits |

## 4. The same figures from the core

**Sales today.** Transactions *earned* today, on every channel: a till sale when it is completed, a shop order when it is fulfilled, a booking when the service is completed, and an invoice raised on its own when it is issued. Reversed and cancelled ones do not count, as today. Refunds and credits given today are subtracted (decision 8.2).

This needs one addition to the core: **`earned_at`** on `commercial_transaction`, set by the projection the first time a transaction reaches an earned state. The core keeps no status history today, so "fulfilled today" cannot be answered from it without this. Existing transactions are backfilled from the product record (sale `occurred_at`, order and booking `updated_at` at fulfilment or completion, invoice `issued_at`).

**Received today.** Confirmed payments received today that pay a sale, order, booking or invoice, less refunds paid out today. Ascend Balance top-ups are not money from customers and are left out. "Verified" stays the share confirmed by the payment provider.

**Owed.** What customers have *committed* to and not yet paid or been credited, from `obligation_balance`:
- issued invoices and proformas;
- shop orders once the merchant has confirmed them;
- bookings once confirmed (the deposit), and the balance once completed.

Orders and booking requests the merchant has not accepted are not counted (decision 8.3). Customers owing, oldest overdue and the overdue alert come from the same obligations and their due dates.

*Clarified while building 2d.1:* whether something is committed is read from the product's own status (did the merchant accept it), not from the money state. And a transaction refunded in full owes nothing. Without these, an order nobody confirmed, paid online and then refunded, showed as owed.

**Customers: spent and owed.** The same rules, per customer: paid net of refunds, and committed outstanding.

## 5. How it is switched: compare mode first

The same discipline as Phase 1's shadow week:

1. **Build both.** Two read functions in the database answer the core figures: `commerce_dashboard_figures(business, day)` and `commerce_customer_money(business)`. The dashboard and customers list compute both the current and the core figures on every load, and keep **showing the current ones**.
2. **Record every difference.** When a figure differs, one row per business, figure and day goes to `commerce_reader_comparison` (current value, core value, when). No names or amounts per customer are stored, only the business and the totals.
3. **Explain every difference.** Section 3 predicts which ones there will be. The review checks that every recorded difference is one of those, and that none is unexplained.
4. **Switch.** One setting, `COMMERCE_READERS=core`, makes the screens show the core figures. The old reads stay in the code until a week after the switch, then are removed.

## 6. Sequence

| Step | What | Exit gate |
|---|---|---|
| 2d.1 | Migration: `earned_at` (projection and backfill), the two read functions, `commerce_reader_comparison` | Local Postgres: core figures match hand-worked expectations on every channel; the reconciliation still zero; on live, `earned_at` set for all 20 transactions |
| 2d.2 | Dashboard and customers list in compare mode | Deployed; differences being recorded; nothing a merchant sees has changed |
| 2d.3 | Review | Every recorded difference is a predicted one (section 3) |
| 2d.4 | Switch to the core | Live screens show the core figures; Phase 2 exit gate met |
| 2d.5 | Remove the old reads | A week after the switch |

2d.1 and 2d.2 can be built now, during the clean week. 2d.4 waits until the clean week has ended (21 Nov) and the review is clean.

## 7. What it will look like on live

Measured on 15 Nov 2026:

| Figure | Today | From the core |
|---|---|---|
| Owed (dashboard) | GHS 400 | **GHS 0**: the one invoice is credited in full; five shop orders worth GHS 2,149 are not confirmed |
| Received (all time, for reference) | GHS 11,374, all till sales | The same: no top-ups or refunds on live yet |
| Customers owed and spent | GHS 0 | GHS 0 |

Had "owed" counted every open obligation, the dashboard would have jumped to GHS 2,149, almost all of it orders nobody had accepted. That is why decision 8.3 matters.

## 8. Decisions for Collins

1. **Sales today counts every channel**: till, shop, bookings and invoices. *Recommended.* The alternative keeps today's till-and-shop figure and leaves services and invoicing businesses with a "sales" figure that misses most of their sales.
2. **Refunds and credits come off sales on the day they are given.** *Recommended.* The alternative keeps sales gross and shows money given back nowhere on the dashboard.
3. **Owed counts what customers have committed to**: issued invoices, confirmed orders, confirmed bookings. *Recommended.* Counting every open obligation would put unaccepted orders on the dashboard as money owed.
4. **Balance top-ups are not money received.** *Recommended*; today's figure is simply wrong to include them.
5. **Switch after the clean week and a clean comparison**, not before 21 Nov. *Recommended.*

---

## 9. Switching without real traffic (15 Nov 2026)

Decision 8.5 waited for the clean week and a clean comparison on real traffic. The review report showed there was none to compare: no real activity since 9 Nov.

**Decided by Collins on 15 Nov 2026:** switch on the strength of the deliberate tests. The core figures were checked by hand against a full trading day on every channel (locally, 20 of 20; on live, 14 of 14), both screens were shown in core mode on a throwaway business, and the commerce reconciliation is zero on live. The comparison log keeps recording after the switch, and the review report explains every difference.

To switch: set `COMMERCE_READERS=core` in Netlify and redeploy. To undo: remove it and redeploy. What merchants will see change on live: owed falls from GHS 400 to GHS 0 for the business whose invoice was credited in full. The old reads are removed (2d.5) a week after the switch.

**Switched, 15 Nov 2026.** `COMMERCE_READERS=core` is live on Netlify (it took effect after a cleared-cache redeploy). Confirmed from a real visit: the owner of the business whose invoice was credited in full saw GHS 0 owed on the dashboard, where the old figure was GHS 400; the comparison log recorded that difference and the review report explains it. The Phase 2 exit gate is met: what was sold, owed and paid is now answered from the core on both screens. Remaining: remove the old reads (2d.5), due from 22 Nov 2026.

**The screens switch moves to the database, 16 Nov 2026 (0089).** `commerce_readers` in `platform_setting` ("core" or "compare"), read at request time; `COMMERCE_READERS` is only the fallback. Proven on live with a local server that has no such setting: it showed the core figures. Not yet deployed (see the Phase 1 plan).

**2d.5 built, 16 Nov 2026 (not yet deployed).** The dashboard no longer reads `sale`, `shop_order`, `payment` or `receivable` for money; every money figure comes from `commerce_dashboard_figures()`, and if the core cannot be read the three money cards say "We could not load this just now. Refresh in a moment." rather than showing other figures. Compare mode and `commerce_reader_comparison` writes are gone, and the `commerce_readers` switch is no longer read (its row stays as a record). The customers list takes spent and owed from `business_customers()`, which reads the core since **0090** (same name and columns; tested 6 of 6: a customer shown as spent 200, owed 250 now reads spent 180, owed 20, matching the core). **0090 must be live before this code is deployed**, or the customers list would briefly show the old figures. The review report's screens section has nothing new to read after this deploy.
