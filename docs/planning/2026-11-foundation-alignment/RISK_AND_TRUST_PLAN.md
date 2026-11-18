# Risk and Trust, first slice (spec 09)

18 November 2026. For Collins to approve before anything is built.

Spec: `09_Risk_and_Trust_Specification_v1.0.md`. It covers fifteen risk domains, from payment fraud to field agents and AI. This plan builds the part that works with what Ascend has today and leaves the rest named, so it is picked up when its product exists.

The spec's first rule shapes everything here: **risk is an operational control, never a public score.** The Sustainability Score and trust level (Phase 5) say how a business is doing; a risk state says what Ascend is watching or limiting. They never mix, and a risk state is never shown to a lender or on Discover.

---

## 1. What exists today

| Spec | Where it lives | State |
|---|---|---|
| Suspending a business (s5) | `business.status` active, suspended or closed, set only by a platform admin with a reason, audited (0081); a suspended business can read but not change anything | Holds, but there is nothing between "fine" and "suspended" |
| Discover takedown and appeal (s9) | Listing suspension with the business's right of reply (0030, admin page) | Holds, for listings only |
| Messaging abuse (s3) | Flags for spikes, opt-outs, failures, spam, bulk sends, and a daily cap (0110) | Holds |
| Refund control | Refunds need `refunds.approve`; approvals are never self-approved (0077) | Holds |
| Cash discipline signals | Till gaps (`pos.sales.unaccounted`), shifts that do not count out, reversals | Recorded, but nothing reads them as risk |
| Internal risk (s11) | Least privilege by permission (Phase 1), audit log, append-only history | Partly: no maker-checker on Ascend's own admin actions |

## 2. What is missing

1. **No risk states.** The spec's six (normal, monitor, review, restricted, suspended, terminated) collapse into active or suspended. There is no way to watch a business quietly, or to limit one thing (say online payments) without stopping everything.
2. **No risk cases.** Suspending a business leaves a reason and an audit line, not a case: no trigger, no evidence snapshot, no owner, no notes, no resolution.
3. **No signals.** The data that would flag refund abuse, till leakage, a sudden jump in volume or a sale far bigger than usual is all recorded and nothing looks at it together.
4. **No targeted restrictions.** Payment collection, refunds, marketing and Discover can only be stopped together, by suspension.
5. **No appeal for a restriction** (s14), except on Discover listings.
6. **Customers cannot report a business** (s9, s13). The invoice page, the shop and receipts show no "report a problem" route.
7. **No maker-checker** on Ascend's own most serious actions (s11): one admin can suspend a business alone.

## 3. What this plan builds

| Step | What | Exit gate |
|---|---|---|
| R1 | Risk states and cases: `risk_case` (domain, trigger, evidence snapshot, affected business, controls, owner, append-only notes, resolution) and a risk state per business, changed only through a case | On live, a throwaway business moved from normal to monitor to restricted and back, each step on its case, audited |
| R2 | Targeted restrictions, enforced where the action happens: online payment collection, refunds, marketing messages, Discover listing (decision 4) | A restricted throwaway business is refused exactly the restricted action and nothing else |
| R3 | Signals: refund rate, reversal rate, till gaps and shifts that do not count out, volume spike, a sale far above the business's usual size, a brand-new business with heavy volume, likely duplicate businesses, messaging flags (C5), customer reports (R4). Each with its figures and a severity; none acts by itself (decision 3) | Each signal fires on a throwaway business built to trip it, and not on the real businesses without cause |
| R4 | Customer reports: "Report a problem with this business" on the invoice page, the shop and receipts; a report becomes a signal and can open a case (decision 6) | A report from the public invoice page reaches the admin desk, rate-limited |
| R5 | Appeals and what the business sees: a restricted or suspended business sees what is limited, why, and how to appeal; monitor and review stay internal (decision 5) | A throwaway business sees its restriction and its appeal reaches the case |
| R6 | The Risk desk in the admin area: open cases, signals, restrictions, appeals, and the second admin's confirmation for suspend and terminate (decision 2) | Opened, worked and closed from the page, as an admin, at phone width |

Built and tested as before: local Postgres with every migration replayed, then throwaway ZZ businesses on live, cleaned up by id.

## 4. Named, and not built here

- **Payment and settlement risk** beyond the restriction switch (velocity per payment method, settlement-change monitoring): with Phase 3, once Paystack is live.
- **Field agents** (s10): no agents yet. When the agent programme starts, identity, Agent ID, territory and complaints go in with it.
- **Account takeover and device signals** (login anomaly, device fingerprint): a separate step with the authentication work.
- **API, AI action and commission abuse**: when those surfaces exist.
- **Public trust labels** (s8, decision 7).

## 5. Decisions for Collins

1. **Risk state is separate from business status.** *Recommended:* the six risk states live on their own, and "suspended" or "terminated" also sets `business.status` through the existing function, so there is still one switch that stops a business. "Closed" stays the owner's choice, not a risk state.
2. **Who can change a risk state.** *Recommended:* platform admins only, always through a case. Monitor, review and restricted need one admin. **Suspended and terminated need a second admin to confirm** (maker-checker, spec 11), with the first admin unable to confirm their own.
3. **Signals never act on their own.** *Recommended:* in this first slice a signal shows on the desk with its figures and nothing more; a person opens the case and decides. Ascend has little data yet, and an automatic restriction on a false alarm would cost a real business its sales.
4. **The first restrictions.** *Recommended:* online payment collection, refunds, marketing messages and the Discover listing. High-value sales need a threshold per business and wait for payment data.
5. **What the business sees.** *Recommended:* restricted and suspended are shown to the owner with the reason and an appeal route (spec 14). Monitor and review are never shown: telling someone they are being watched for fraud tells the fraudster to stop leaving evidence.
6. **Customer reports.** *Recommended:* a short "Report a problem with this business" link on the invoice page, the shop and receipts. No sign-in, the customer's number optional, limited to 3 reports per number or device a day. A report is a signal, never a verdict.
7. **No public trust labels yet.** *Recommended:* no "Verified" or "Trusted" badge anywhere until there is a written policy for what earns one; when there is, it can never come from paying for Discover promotion (spec 8).

## 6. Build status

| Step | Migration | Status |
|---|---|---|
| R1 Risk states and cases | 0111 | Run on live 18 Nov 2026, checked with a throwaway business, committed |
| R2 Targeted restrictions | 0112 | Run on live, each restriction refused exactly its action, committed (payment route change waits for a deploy) |
| R3 Signals | 0113 | Run on live, read only. On real businesses only the three "Adjoa Provisions" show, as likely duplicates |
| R4 Customer reports | 0114 | Run on live, 13/13 through the real route on a throwaway business. Report link on the invoice, shop and booking pages; Risk page in the admin area. App code waits for a deploy |
| R5 Appeals and what the business sees | | Next |
| R6 The Risk desk | | After R5; grows the R4 Risk page |

Receipts: a receipt sent to a customer opens on the same document page as an invoice, so it carries the report link too.
