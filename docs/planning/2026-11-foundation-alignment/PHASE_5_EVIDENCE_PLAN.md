# Phase 5 Plan, part one: Business Events and Evidence

**Prepared:** 17 Nov 2026, against `main` at `498aa8d` (migrations through 0092)
**Source:** `Platform Foundation Specification/08_Business_Events_and_Evidence_Specification_v1.0.md`, and Phase 5 in `FOUNDATION_ALIGNMENT.md`
**Status:** Proposal for approval. No code until Collins approves the decisions in section 8.

The rest of Phase 5 (financial events and tax, one messaging path, the first slice of Risk and Trust) waits on the accountant and on 360dialog. This part needs nothing from anyone, and it is the part the Sustainability Score stands on.

---

## 1. What it is for

The spec separates two things:

- **Business Graph:** what exists, how it is related and what happened.
- **Evidence Ledger:** which events can responsibly support a claim, with what confidence and provenance.

The Sustainability Score is AscendSME's most important differentiator: a credibility record built from how a business actually operates. It is only as honest as the evidence under it. This part makes the evidence tell the truth about refunds, credits and reversals, read money from the commerce core instead of five product tables, and keep the spec's two rules that protect the score's meaning:

> Using more Ascend products may improve evidence coverage. It must not automatically improve score. (section 9)
>
> Missing evidence reduces confidence and should not always be treated as negative performance. (section 10)

**Exit gate:** a refund, credit or reversal lowers the evidence it undoes; a business's score does not rise merely because it turns on another product; evidence confidence is worked out from the spec's five factors and reported apart from the score; every score keeps its model version, period, evidence snapshot and explanation.

---

## 2. Where things stand (measured 17 Nov 2026)

What already holds, and stays:

- Evidence is separate from the score, and confidence is reported separately (`compute_readiness`, 0022).
- Achievement per dimension is capped, so volume does not inflate a score.
- A dimension with no evidence is labelled "not shown yet", not "poor".
- Every result keeps its model version; evidence is idempotent per event; promotion spend can never become evidence (0026).
- Live: 55 evidence records across 5 businesses; 31 businesses have scores (49 runs of each output).

What is wrong:

| Finding | Effect today |
|---|---|
| **Reversals and refunds never reach the evidence.** `execute_sale_reversal` emits `pos.sale.reversed` and `complete_refund` emits `finance.payment.refunded`, both marked as corrections, but the evidence engine only acts on event types it has a rule for, and neither has one. | A reversed sale or a refunded payment keeps its positive evidence. |
| **Credit notes count as documentation.** A credit note is issued through `issue_document`, so it emits `documents.document.issued` and earns +1 as "issued documentation". | Crediting an invoice raises the documentation dimension. |
| **A rule nothing triggers.** `documents.document.paid` has a rule; nothing emits it. | Collected invoices earn nothing. |
| **Missing dimensions pull the score down.** A dimension with no evidence earns 0 points of its weight. | Turning on another product raises a score even if the business runs no better. This breaks the spec's section 9 and 10. |
| **Confidence measures one factor of five.** It weighs evidence by verification level only. Freshness is counted but unused; coverage, consistency and integrity are not considered. | A business with strong evidence from a year ago reads as fully confident today. |
| **The ladder has five rungs on paper, three in use.** Events carry merchant-declared, customer-confirmed or provider-confirmed. "System-recorded" and "institution-verified" are never set, and nothing enforces the five. | |
| **The event record lacks spec fields:** actor role, source, idempotency key, a reversal reference separate from correction, and the category. | Evidence cannot say whose action it was or how it entered the system. |
| **Results lack spec fields:** assessment period, evidence snapshot, strengths and weaknesses (section 14). | A score cannot be reproduced from exactly the evidence it used. |

---

## 3. The design

### 3.1 Commerce evidence comes from the commerce core

Sales, orders, bookings and collected invoices are already one record in the core, with refunds, credits and reversals as adjustments and payments with their settlement state (Phase 2, 0092). Commerce evidence is derived from that, not from each product's events:

- **Earned** (a transaction reaching `earned_at`): positive evidence of financial and customer activity.
- **Adjustments** (refund, credit, reversal): negative evidence against the same transaction, in proportion to the amount (a 25% refund undoes 25% of that transaction's evidence).
- **Verification from the money:** paid through the provider (and settled) is *payment-verified*; paid in cash or straight to the merchant is *merchant-declared*; a shop order the customer placed and paid for is *customer-confirmed*.

The product-event rules for sales, orders, bookings and payments stop with the new rule version. Their existing records are superseded by the core-derived ones (the spec's correction history keeps the originals).

### 3.2 Every correction reaches the evidence

For events that are not commerce (shifts, attendance, approvals, tasks, expenses), a correction applies the rule of the event it corrects, as a negative entry pointing at the original. Credit notes stop counting as documentation; they are commerce adjustments under 3.1.

### 3.3 The five-level ladder, enforced

Evidence records may only carry the spec's five levels. Each event's level is set by a single mapping (for example: a till sale is merchant-declared; a shift closed with the cash counted is system-recorded; a provider-confirmed payment is payment-verified). Institution-verified is reserved for verifications an institution performs, which arrive later.

### 3.4 The event envelope

The event record gains the spec's missing fields: actor role, source, idempotency key, reversal reference and category. They are filled by the database when an event is written, as Phase 2 filled the core, so none of the 26 functions that emit events has to be edited.

### 3.5 Evidence Confidence from the spec's five factors

| Factor | Worked out as |
|---|---|
| Coverage | the share of the archetype's dimensions with evidence |
| Source strength | evidence weighted up the five-level ladder (today's measure) |
| Freshness | how much of the evidence is from the last 90 days |
| Consistency | the share of recent months with activity, so a burst then silence reads lower than steady trade |
| Integrity | reversals, refunds and till gaps (`pos.sales.unaccounted`) against activity |

Each is shown, and combined into one confidence figure under a new confidence model version. Confidence never feeds the score.

### 3.6 The score over what is shown

Each dimension's weight counts only once the business has evidence in it; the score is worked out over those dimensions, and coverage and the "provisional" flag say how much of the picture that is. So a business doing well in the three dimensions its products show is scored on those three, and switching on a fourth product adds coverage, not points. Negative evidence still lowers the dimension it belongs to (section 11).

This changes existing scores, so it is a new score model version; every earlier result keeps the version it was made with (section 14).

### 3.7 Results that can be reproduced

Each run records its assessment period, a snapshot of the evidence it used (the record ids and their weights at the time), strengths, weaknesses and missing evidence, alongside the existing breakdown and recommendations.

---

## 4. Sequence, with exit gates

| Step | What | Exit gate |
|---|---|---|
| 5a | Event envelope fields filled on write, and backfilled; the five-level ladder enforced on evidence | Every event on live carries category, source and idempotency key; no evidence record outside the five levels |
| 5b | Corrections reach the evidence (3.2); credit notes stop counting as documentation | A reversed sale and a refunded payment each produce negative evidence on a throwaway business; a credit note produces none as documentation |
| 5c | Commerce evidence from the core (3.1), with the old product records superseded | On live, every earned transaction and adjustment has its evidence; nothing double counted; totals match by hand on a throwaway business |
| 5d | Evidence Confidence from five factors (3.5) | Each factor shown and checked against worked examples |
| 5e | The score over what is shown (3.6) and reproducible results (3.7), as new model versions | A business's score does not change when another product is turned on with no new activity; old results unchanged |
| 5f | Rescore the 31 businesses under the new versions | New results beside the old, with a before and after list for Collins |

---

## 5. How it will be tested

- Local Postgres replaying every migration, as for every phase so far, with worked examples for each rule: a sale, a partial refund, a full credit, a reversal, a shift, a correction.
- Live checks on throwaway businesses, cleaned up by id.
- **The product-neutrality test:** one business scored, a product switched on with no new activity, scored again: the score must not move.
- A before and after list of all 31 live scores, for Collins to read before 5f is run.

## 6. Risks

- **Scores change.** Every business's score moves under 3.6 and 3.1. Mitigation: new model versions, old results kept, the before and after list reviewed first, and shared reports keep the version they were shared with.
- **Commerce evidence counted twice** while old product records and new core records overlap. Mitigation: the old ones are superseded in the same step, and the check in 5c is that nothing counts twice.
- **Over-reading thin records.** Scoring over shown dimensions could make a business with one strong dimension look complete. Mitigation: coverage and "provisional" travel with every score and every shared report, and confidence falls with low coverage.

## 7. Out of scope here

- Institution verification flows (who verifies, and how): later, with the Control Center.
- The Risk and Trust module (spec 09), financial events and tax (spec 07), the communications engine (spec 05): the other parts of Phase 5.
- What the readiness screens show: they keep working as they are; presenting confidence factors is a later screen change.

## 8. Decisions for Collins

1. **Commerce evidence from the core** (3.1), with refunds, credits and reversals as proportional negative evidence. *Recommended.*
2. **Every correction applies the rule of what it corrects** (3.2), and **credit notes stop counting as documentation.** *Recommended.*
3. **Score over the dimensions shown** (3.6), with coverage and "provisional" beside it. *Recommended*: it is what the spec's sections 9 and 10 require. The alternative keeps today's behaviour, where switching on a product raises a score.
4. **Confidence from the five factors** (3.5), weighted equally to start. *Recommended*; the weights can be tuned as real data arrives.
5. **Rescore the 31 businesses only after you have read the before and after list** (5f). *Recommended.*
