# Phase 2 Plan: the Commerce Core

**Prepared:** 14 Nov 2026, against `main` at `c33aa7a` (migrations through 0081)
**Source:** `Platform Foundation Specification/02_Commerce_Transaction_Core_Specification_v1.0.md`, and the Phase 2 section of `FOUNDATION_ALIGNMENT.md`
**Status:** Approved by Collins on 14 Nov 2026, with every recommendation in section 9. Steps 2a, 2b, 2c and 2e are built and live; 2d waits on the clean week (section 10).

---

## 1. What Phase 2 is for

The spec's rule: *a channel may initiate commerce differently, but Ascend must preserve one commercial truth.*

Today there is no one commercial truth. A till sale, a shop order, a booking and an invoice each keep their own money in their own table, with their own statuses and their own idea of what is owed and paid. Asking "what did this business sell last month, what is it still owed, and what has been paid" means reading five tables that do not agree on what a sale is.

Phase 2 adds the one model the spec asks for (Commercial Transaction, Transaction Line, Payment Obligation, Payment Allocation) underneath the products, without taking anything away from them. Every product keeps working exactly as it does; the core is filled from what the products already write, and the places that answer money questions (the dashboard, the customer record, readiness evidence) move to read the core.

Everything after it relies on it: Payments (Phase 3) settles obligations, Billing (Phase 4) and Finance (Phase 5) report from it, and CRM and Readiness read revenue from it.

**Exit gate for the whole phase** (from the alignment plan): what was sold, what is owed and what was paid are answerable from the core without reading `sale`, `shop_order`, `service_booking` or `document`, and a reconciliation check returns zero differences.

---

## 2. Where things stand (measured 14 Nov 2026)

| Area | Today |
|---|---|
| Money tables | `sale` + `sale_line` (12 / 25 rows), `shop_order` + `shop_order_line` (5 / 9), `service_booking` (2), `document` with lines as JSON (14), `payment` (12), `receivable` (1), `ledger_entry` (20), `refund_request` (0), `payment_intent` (0). |
| Statuses | Four separate vocabularies: sale (completed, held, cancelled, reversed), order (pending to fulfilled, cancelled, refunded), booking (requested to completed, cancelled, no_show) and document (19 values). None maps to the spec's canonical states. |
| What is owed | `receivable` is an early Payment Obligation (amount due, amount paid, the record it is for), but only invoices create one. A shop order awaiting payment or a booking deposit has no obligation at all. |
| What is paid | Each `payment` names one record it pays (`source_entity_type` and `id`): an early, one-to-one Payment Allocation. One payment cannot cover two invoices, and a split-tender sale is several payments with no single owner. |
| Who writes money | Ten database functions (complete_pos_sale, place_shop_order, advance_shop_order, book_service, advance_booking, issue_document and its siblings, confirm_payment_intent, complete_refund, execute_sale_reversal, record_settlement), plus merge_customers moving customer ids across all of them. |
| Who reads money | The dashboard (`lib/reporting/dashboard.ts`) reads sale, shop_order, payment and receivable directly; the revenue view `business_revenue` reads ledger_entry; the customer record and readiness evidence read the product tables. |
| Live volumes | 33 money records in all. The backfill is trivial now and will not be later. |

---

## 3. The model

Four new tables. Nothing existing is removed or renamed in Phase 2.

### Commercial Transaction
One row per commercial event, whatever the channel: business, customer (or none), location, channel, originating product, transaction type, currency, subtotal, discounts, tax, total, canonical status, the product's own status label, the actor, and timestamps. Its **origin** (`sale`, `shop_order`, `service_booking` or `document`, with the id) is unique, so one product record can never produce two transactions.

### Transaction Line
What was sold: item, variant, description, quantity, unit price, discount, tax, line total, and the **price source** (catalogue, manual override, shop override, quote) with the actor who overrode it. A line's price never changes after the fact (spec section 7).

### Payment Obligation
What is owed, and when: a transaction can have several (a booking's deposit, then its balance; an invoice paid in instalments). Kind (full, deposit, balance, instalment), amount due, due date, and a status (open, partially paid, paid, cancelled, written off). It replaces what `receivable` was reaching for, for every channel, not just invoices.

### Payment Allocation
Which payment paid which obligation, and how much: one payment can cover several obligations, and one obligation can be paid by several payments (split tender, part payments). The sum allocated against an obligation is what is paid; the remainder is what is owed.

### Canonical states
Every product status maps to one of the spec's states, through one function, so a product keeps its own label for its own screens while the core speaks one language:

| Canonical | Sale | Shop order | Booking | Document (invoice, proforma) |
|---|---|---|---|---|
| draft | held | | | draft, pending_approval, change_requested |
| pending | | pending | requested, quoted | issued, sent, delivered, viewed, approved, accepted |
| confirmed | | confirmed, preparing, ready | confirmed | |
| partially_fulfilled | | out_for_delivery | in_progress | |
| fulfilled | | fulfilled | | |
| completed | completed | | completed | paid |
| cancelled | cancelled | cancelled | cancelled, no_show | cancelled, rejected, expired |
| partially_refunded | | | | partially credited (from credit notes) |
| refunded | | refunded | | refunded, credited |
| reversed | reversed | | | superseded |

Payment state (owed, part paid, paid) is not a transaction status: it comes from the obligations, so "confirmed and half paid" is expressible without inventing a status for it.

---

## 4. How the core gets filled: projection, not rewrites

**Recommendation: database triggers that project each product record into the core, in the same transaction as the product's own write.**

When `complete_pos_sale` inserts a sale, a trigger on `sale` writes the matching transaction, its lines, and its obligation; when a payment is inserted, a trigger writes its allocation. Status changes, reversals, refunds and customer merges flow through the same triggers.

Why triggers rather than editing the ten writer functions:
- **One place per table, not ten functions.** Every current and future writer is covered automatically, including merge_customers and the offline till sync.
- **No function rewrites.** Phases 0 and 1 rewrote functions only by generation with counted edits, because retyping one in 0064 caused a regression. Triggers avoid touching the writers at all.
- **Same transaction.** A trigger runs inside the write that fired it, so the product record and its core record either both exist or neither does.
- **Easy to retire.** When products are re-expressed in Phase 6 to write the core directly, the triggers are dropped one by one.

The cost is that the logic is less visible than in the writer itself, so each trigger is documented in the migration and covered by the reconciliation check below.

---

## 5. Sequence, with exit gates

| Step | What | Exit gate |
|---|---|---|
| 2a | The four tables, the canonical state mapping function, and price source on lines | Local Postgres: tables, constraints and mapping in place; every product status maps to exactly one canonical state |
| 2b | Projection triggers for sale, shop_order, service_booking, document and payment; backfill of the 33 existing records | Every existing and new product record has exactly one transaction with matching totals; every payment is allocated |
| 2c | `commerce_reconciliation()`: one check that lists every difference between the products and the core | Returns zero rows on live, and keeps returning zero for a week of real traffic |
| 2d | Readers move to the core: dashboard revenue and outstanding, the customer record's spend and history, readiness revenue evidence | The same numbers as before on live, read from the core; the exit question answered without the product tables |
| 2e | Returns, refunds and adjustments in the core: a refund or reversal becomes an adjustment against the original transaction, with reason and actor, never an edit | A refund on live shows as partially refunded or refunded, with the original kept |

Products keep writing their own tables throughout. Nothing a merchant sees changes until 2d, and in 2d only where the numbers come from, not what they are.

---

## 6. How it will be tested

- **Local Postgres** replaying every migration, as for Phases 0 and 1, before Collins runs anything: each trigger, the backfill, and the reconciliation, including a forced failure that must leave neither record behind.
- **Reconciliation as the ongoing test:** after backfill it must return zero on live, and again after every channel is exercised (a till sale, a shop order paid online, a booking with a deposit, an invoice part paid, a refund).
- **Before and after numbers:** the dashboard and customer figures computed both ways on live must match before 2d switches them.

---

## 7. Risks

- **A trigger bug blocks a sale.** A trigger that raises an error would stop the product's own write. Mitigation: triggers are tested locally against every writer first, and on live with throwaway businesses before anything else; the reconciliation catches silent drift.
- **Two truths for a while.** Until Phase 6 the product tables and the core both exist. Mitigation: the core is filled only from the products, never written separately, so it cannot disagree in a way the reconciliation does not report.
- **Documents count twice.** A receipt for a till sale, or an invoice raised from a shop order, must attach to the same transaction, not create another. Mitigation: documents with a source record attach to that record's transaction (decision 9.2).
- **Scope creep into payments and tax.** Phase 2 records what is owed and paid; who holds the money is Phase 3, and tax is Phase 5. The core keeps tax as a number it is given, not one it calculates.

---

## 8. Out of scope for Phase 2

- Provider accounts, merchant payment profiles, settlement and "control without custody": Phase 3.
- Tax calculation (VAT, NHIL, GETFund): Phase 5. The core stores the tax a product records.
- Recurring services, manual transaction import and institutional orders (spec section 5): designed for in the model, built when a product needs them.
- Retiring the product tables or making products write the core directly: Phase 6.

---

## 9. Decisions needed from Collins

1. **Projection by triggers** (section 4), rather than editing each writer function. Recommended.
2. **Documents and transactions.** Recommended: an invoice or proforma raised on its own creates a transaction with an obligation; a document raised from an existing sale, order or booking (a receipt, or an invoice for a shop order) attaches to that transaction rather than creating a second; a quotation is not a transaction until it is accepted or converted.
3. **Shop orders owe from the moment they are placed.** Recommended: placing an order creates an obligation for its total, paid by an online payment or by cash on delivery, so unpaid orders show as owed.
4. **Bookings owe a deposit, then a balance.** Recommended: a deposit obligation when the booking is made (if the service asks for one), and a balance obligation when the service is completed.
5. **The canonical state table in section 3.** Particularly: a booking no-show counts as cancelled, and a superseded document as reversed.
6. **When the readers switch.** Recommended: after one week of the reconciliation returning zero on live traffic, the same discipline as Phase 1's shadow week.

---

## 10. Build status (14 Nov 2026)

| Step | Migration | Status | Verified on live |
|---|---|---|---|
| 2a | 0082 commerce core tables | Built, live, committed (`2f00128`) | Tables, constraints, 38 product statuses mapped; 15/15 |
| 2b | 0083 products fill the commerce core | Built, live, committed (`3ebf551`) | Backfill: 20 transactions, 0 failures; every channel through the real writers; 18/18 |
| 2c | 0084 commerce reconciliation | Built, live, committed (`2188d35`) | Zero differences on live; a deliberate break caught; 7/7 |
| 2e | 0085 refunds, credits and reversals | Built, live, committed | The real 400 credit note recorded; refunds, credits and a reversal through the real functions; reconciliation zero; 11/11 |
| 2d | readers move to the core | Not started | Waits on the clean week |

**Order changed, with Collins's agreement:** 2e was built before 2d, so the clean week measures the finished core rather than restarting after 2e.

**The clean week** runs from 14 Nov 2026. If `select * from commerce_reconciliation_summary();` stays empty, 2d starts on 21 Nov 2026 (decision 9.6).

### Decisions made during the build

- **A projection never blocks a product write.** A failure is recorded in `commerce_projection_error` and reported by the reconciliation (0083).
- **Old lines say their price source is `unknown`**, rather than guessing catalogue or override after the fact (0083).
- **Where a product kept no cancellation, refund, credit or reversal reason, the core says so in words** ("no reason recorded") rather than leaving it blank. Shop orders and till sales have nowhere to keep a cancellation reason: a product gap for Phase 6.
- **A `credit` tender (sold on account) is not money received**: the sale stays owed (0083).
- **A document status nothing sets today, `archived`, maps to completed** until a product uses it (0082).
- **A proforma converted to an invoice keeps one transaction**, which passes to the invoice when it is issued (0083).
- **A credit on an already paid invoice is kept against the transaction**, as money the customer is owed (0085).

### Product issues found

| Issue | Status |
|---|---|
| After a refund, an invoice stayed "paid" (complete_refund and confirm_payment_intent counted only confirmed payments) | Fixed in 0085 |
| Credit notes never reduce the invoice's receivable, so the dashboard overstates what is owed (live: 400 GHS) | Fixed for readers by 2d (the dashboard reads the core) |
| A proforma converted to an invoice creates a second receivable, counted twice on the dashboard (none on live yet) | Fixed for readers by 2d |
| An invoice part paid and part credited stays "partially paid" in Documents, though nothing is owed | Open: needs a change to how Documents works out an invoice's status |
| Shop orders and till sales cannot record why they were cancelled | Open: Phase 6 |
