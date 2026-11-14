# Foundation Alignment: bringing the existing codebase onto the 8 Nov 2026 Platform Foundation

**Prepared:** 10 Nov 2026, against `main` at `48b17e8` plus migrations 0064 to 0066 (applied by Collins)
**Source pack:** `Ascend new build files/` (Platform Foundation Specification, 14 files; Regenerated Documents, 17 files; all dated 8 Nov 2026)
**Status:** Analysis and proposed path. No code or schema has been changed by this document.
**Relationship to `docs/planning/2026-11-platform-review/`:** that folder plans against the previous generation of specs (5 Nov). Where the 8 Nov pack differs, this document supersedes it. Its code claims were re-checked and held up, so its evidence is still usable. Its sequencing is not.

---

## 1. Executive summary

The new foundation is not a different product. It is the same product with the ownership turned the right way round: the business, the person, the customer, the transaction and the payment become shared core objects, and POS, Shop, Services, Documents, Office, CRM, Discover, Finance and Readiness become experiences that read from and write to that core.

The existing codebase is closer to that shape than a rewrite would assume, and further from it than the documentation claims.

**Closer.** The inventory ledger with derived balances, the capability register that separates essential from core capabilities, the transactional outbox, the evidence-versus-score split, the paid-versus-settled distinction, device identity with offline POS, and an RPC-centred domain layer (76 RPCs called from application code against 38 direct table writes) all already match the spec's intent. These are the hardest ideas to retrofit and they are in.

**Further.** Four things the spec treats as constitutional are absent or contradicted:

1. **No commercial spine.** Sales, shop orders, bookings, documents and payments each carry their own money and their own states. The spec's Commercial Transaction, Payment Obligation and Payment Allocation do not exist. Everything downstream (Finance, CRM revenue, Readiness evidence, commissions) depends on them.
2. **Authority is described, not enforced.** Role permissions are stored but no route or RPC checks them. Row level security is keyed on `auth.uid()`, which the custom OTP sessions never populate, and every query uses the service role. Append-only tables are append-only by convention only (proved with a probe row, since cleaned up). Delegated authority has no readers.
3. **Payments hold the money.** One Paystack secret key, no merchant payment profile, no subaccount or split. The spec's "control without custody" rule is the opposite of the current arrangement.
4. **Billing does not match the new commercial architecture.** Ascend Balance is one pool, not split by merchant-funded versus sponsored. Seeded price-book rows (`catalogue_50`, `catalogue_250`, `assurance_annual`) contradict Commercial Architecture v2.0. Commissions, usage meters and attribution do not exist.

**Recommendation.** Retrofit under the running products. Do not rebuild. Do not build new products until the constitutional core (phases 0 to 3 below) is in. Live volumes are tiny (8 sales, 5 shop orders, 2 bookings, 12 cash payments, 0 digital payments), so this is the cheapest the retrofit will ever be. Every month of new product code on the current shape adds backfill and rewrite cost.

**Two defects of mine come first.** Both are in migration 0064, which I wrote:

- `book_service` was rebuilt from 0018 instead of 0020, so it lost the deposit-hold logic (`hold_expires_at`, hold minutes, the richer duplicate-return payload). My earlier verification of 0064 checked customer reuse and that the functions ran. It did not check parity with 0020, so "verified" was narrower than it sounded.
- `merge_customers` (0064 line 135) ORs `marketing_consent` across the merged records, which can grant consent the person never gave.

Both are Phase 0 and go in a forward migration (0067). 0064 stays as applied.

---

## 2. What the new foundation requires (compressed)

**Six layers:** Identity and Authority; Shared Business Capabilities; Product Experiences; Channels; Intelligence and Trust; Platform and Operations.

**Thirteen core rules (one of each):** Business ID, Person ID, customer relationship per business, catalogue, commerce truth, payment truth, inventory ledger, financial-event foundation, permissions model, event model, evidence standard, entitlement engine, audit standard.

**Governing sentence:** "Products do not own the business. Products read from and contribute to the shared business core."

**Gate:** twelve-question Architecture Review Gate before any product or capability ships, and phases A to F for ordering.

---

## 3. Canonical object map

Legend: **Keep** (conforms), **Extend** (right idea, needs more), **Build** (absent), **Fix** (present but wrong or unenforced).

| Spec object | What exists today | Verdict | Work |
|---|---|---|---|
| Business ID | `business` table, `ascend_business` cookie, `activeMembership`, `currentWorkspace` | Extend | One resolver returning person + business + role + location + device, used by every route |
| Person ID | `person`, custom OTP `auth_session` | Keep | Make the phone format country-configurable (`+233` is hard-coded) |
| Membership and roles | `business_membership`, `role` (jsonb permissions, cloned per business) | Fix | Permissions stored, never checked. Add enforcement point in the domain layer |
| Delegated authority | `delegated_authority` table | Fix | Zero readers. Either wire into the resolver or remove from the claimed model |
| Audit | `audit_log` | Extend | No before/after/reason. Add the three and a single writer |
| Customer relationship | One record per business via 0064 (`find_or_create_customer`, `merge_customers`) | Fix | Restore `book_service` hold logic, correct consent merge, then keep |
| Consent | 0066 consent record | Keep | Merge must never broaden it |
| Catalogue | Shop catalogue plus POS catalogue sync | Extend | Confirm single item table across POS, Shop, Services (verify during Phase 2) |
| Commercial Transaction | `sale`, `shop_order`, booking, `document` each separately | Build | The new spine. Dual-write then switch readers |
| Payment Obligation | None. `payment` rows are receipts against sales | Build | |
| Payment Allocation | None | Build | |
| Payment | `payment` table, Paystack provider interface, settlement tracking | Extend | Provider-neutral profile, `unknown` state resolution, per-merchant account |
| Merchant Payment Profile | None | Build | Prerequisite for control without custody |
| Inventory | `stock_movement` ledger, `stock_balance` and `stock_reserved` views | Keep | Best-conforming object in the codebase |
| Financial event | None. Tax is not computed anywhere (grep for VAT, NHIL, GETFund, tax rate returns nothing) | Build | Finance PRD depends on it |
| Business event | `event_outbox` plus relay; 3 app-level non-atomic `publishEvent` calls | Extend | Fold the 3 into SQL transactions, add the envelope fields the spec lists |
| Evidence | `evidence`, `evidence_summary`, score tables | Extend | Five evidence levels. Evidence Confidence stays separate from Sustainability Score (already true) |
| Entitlement | `capability`, `product_set`, `product_set_capability`, `entitlement` | Fix | `business_capabilities()` and `entitlements.ts` ignore `starts_at`, `expires_at`, `grace_until`. Lapsed passes never lapse |
| Billing offer, meter, pass | `purchase`, `price_book` | Build | Replace seeds, add meters |
| Ascend Balance | `balance_entry` (top_up, promo_credit, sponsor_credit, deduction, reversal) and `ascend_balance` view | Fix | One pool today. Spec needs merchant-funded and sponsored separated |
| Commission, attribution | None | Build | |
| Communications engine | `message`, outbound queue, 360dialog templates (currently `submitted`) | Extend | Consolidate to one send path with consent check and template registry |
| Risk and Trust | None | Build | |
| Control Center | Platform admin routes (`currentAdmin`) | Extend | Spec lists modules; most absent |
| Feature flags, country config | None used | Build | Remove `GHS` and `+233` hard-coding as part of this |

Database shape today: 79 base tables and 8 views (`unsettled_collections`, `stock_balance`, `evidence_summary`, `business_revenue`, `stock_reserved`, `discover_unmapped_categories`, `ascend_balance`, `current_readiness`).

---

## 4. Layer-by-layer assessment

### Layer 1: Identity and Authority

Conforms: one person, custom sessions, memberships with location scope and expiry, device pairing for POS.
Contradicts the claim of one permissions model: permissions are never enforced.

- `role.permissions` is jsonb, cloned per business, read by nothing that decides access.
- `is_business_member()` (0006) keys on `auth.uid()`. With custom OTP sessions that function is dead, so RLS policies written against it protect nothing. All application queries use the service role regardless.
- `docs/ARCHITECTURE.md` states RLS tenant isolation and append-only claims as invariants. Neither is functionally true. The document has not been updated since the initial commit (2026-08-24).
- Route auth is inconsistent: many routes check a session and membership, a minority check capability, and device routes (`pos/sync`, `pos/refund-request`, `pos/catalogue`) derive business and location from the paired device token, which is sound.
- Idempotency keys (`client_ref`) are globally unique rather than unique per business on `sale`, `payment`, `shop_order`, `stock_movement`, `message`, `pos_shift`, `attendance_record`, `till_expense`, `document` (by migration grep). Two businesses generating the same key collide, and a guessable key becomes cross-tenant.

**Honest posture on RLS:** with a service-role client everywhere, RLS is not the boundary. The boundary is the domain layer. The retrofit should make that explicit, enforce authority there, and treat real RLS as later defence in depth rather than leave a policy set that implies protection that does not exist.

### Layer 2: Shared Business Capabilities

- Customer: now one record per business. Needs the two Phase 0 fixes.
- Catalogue and Inventory: inventory conforms. Catalogue needs a check that Shop, POS and Services draw on one item table.
- Commerce: absent as a core. Each product writes its own transaction shape. See section 6.
- Payments: provider interface exists (`lib/payments/provider.ts`, single `PaystackProvider` on `PAYSTACK_SECRET_KEY`). No merchant profile, no subaccount or split, no `unknown` state handling.
- Billing: partial and divergent from Commercial Architecture v2.0.
- Communications: functional but fragmented.
- Financial Foundation: absent. Office handles expenses and tills, Documents issues invoices, but no financial events exist and tax is never computed.

### Layer 3: Product Experiences

Products today own their data. The spec's test is whether each can be rebuilt as a thin experience over the core. Section 7 gives the per-product list.

### Layer 4: Channels

Business App is a PWA with IndexedDB offline POS. The new spec's native channel intent is not started. `window.AscendPrinter` is referenced (`lib/pos/printer/index.ts` lines 33 and 96) but the bridge is not implemented. Office is gated by entitlement only at the nav link: neither `app/work/page.tsx` nor `app/api/office/actions/route.ts` consults it, so a direct URL or API call bypasses the capability.

### Layer 5: Intelligence and Trust

Evidence is separate from score (conforms). Missing: the five-level evidence confidence ladder as an enforced property, the Risk and Trust module, and the event envelope the spec requires. Groq-based AI suggestions exist and are not blocking anything.

### Layer 6: Platform and Operations

Outbox with relay on a Netlify scheduled function conforms. Missing: feature flags, country configuration actually used, Control Center modules.

---

## 5. What conforms and must not be disturbed

These are the assets that make a retrofit possible. Do not refactor them as a side effect.

- Inventory ledger and derived views.
- Capability register and the essential-versus-core split.
- Transactional outbox, with events written in the same SQL transaction as the change.
- Settlement as a separate concept from payment (Paid versus Settled).
- Evidence/score separation and report-sharing controls.
- Device identity and offline POS sync with idempotent replay.
- The RPC-only convention: write via `security definer` functions.

---

## 6. The retrofit path

**Method.** Forward migrations only. Never edit an applied migration. For each new core object: create it, dual-write inside the same SQL transaction as the old write, backfill existing rows, move readers, retire the old path. No big switch, no downtime, and each phase leaves the products working.

**Collins applies migrations by hand.** Every migration in this plan is a single file with a header listing the tables and columns it touches, and I verify every column against the live schema before handing it over (see memory note on this).

### Phase 0: Repairs (small, no new concepts)

Exit gate: every item verified against the database, not just run.

1. **0067:** restore `book_service` deposit-hold logic from 0020 (including the richer duplicate-return payload) while keeping the `find_or_create_customer` call. Compare function bodies against 0020 line by line before handing over, and run a hold-then-expire case.
2. `merge_customers`: take consent from the surviving record, never OR the flags.
3. Enforce entitlement windows (`starts_at`, `expires_at`, `grace_until`) in `business_capabilities()` and `lib/domains/entitlements.ts`.
4. Server-side capability check on the Office page and its action route.
5. Make `client_ref` unique per business on the nine affected tables.
6. Move the 3 app-level `publishEvent` calls (`app/api/office/actions/route.ts` lines 152 and 260, `app/api/shop/catalogue/route.ts` line 127) into the owning SQL transaction.
7. Append-only enforcement by trigger on the tables the architecture document calls append-only, so the claim becomes true against the service role.
8. Rewrite `docs/ARCHITECTURE.md` invariants to say what is actually enforced.
9. **Unassigned bookings can double-book.** The overlap guarantee (`service_booking_no_provider_overlap`, 0018) only applies when `assigned_membership_id` is set. `book_service` accepts a blank provider and `app/api/services/book/route.ts` passes `body.membershipId ?? ""`, so a direct call with no provider can book a time already held or taken. The slot picker is per provider, so the normal flow avoids it, but the database does not enforce it. Found while testing 0067 (the first run failed this check; with a provider assigned it passed). Fix: require a provider for fixed-slot services, or extend the overlap rule to cover unassigned bookings per location and item.

   **Done:** shipped as 0068 on 13 Nov 2026. A check constraint (`service_booking_live_needs_provider`) now requires a provider on any confirmed or in-progress booking, closing both `book_service` and `advance_booking`. `book_service` also refuses a provider who is not an active member of the same business (a cross-business gap found while fixing this).
10. **Availability is not checked server-side.** `book_service` does not check the provider's working hours, approved leave or buffer time; only the slot picker does, so a direct call can book outside hours or over approved leave. `assign_booking` (0063) can also surface a raw overlap error when reassigning to a busy provider. Not fixed.

   **Item 4 (Office gate) done, 13 Nov 2026.** `/work` and `/api/office/actions` now enforce capability on the server. The mapping lives in one table, `lib/office/access.ts`, read by the page, the route and the board, built from the register in 0044 and the Office PRD: a till keeps attendance and refund approvals, Shop and Services keep fulfilment and provider assignment, and projects, leave, purchase requests, expenses, the command centre and the schedule need Office. Refund approvals deliberately stay open to `pos.refunds`, because a till raises them and this board is where they are decided. Verified with six throwaway businesses and real session cookies (58 checks). The page redirect arrives as a streamed 200 with `NEXT_REDIRECT`, the same as the existing Services and Shop gates.
11. **Most nav destinations are gated only at the link.** A rough survey of the 15 nav destinations found server-side capability checks on Services and Shop only, plus Office now. POS, Orders, Bookings, Documents, Customers, Devices, Availability, Team, Promote, Readiness and Sharing showed none in the page or its API folder (approximate: a grep, not a trace). Fixing each by hand repeats the same pattern 11 times, so this belongs in Phase 1 as one route-and-page wrapper that takes a capability list, using `lib/office/access.ts` as the model.

   **Item 5 (idempotency keys per business) done as 0070, 14 Nov 2026.** All nine tables are now unique on `(business_id, client_ref)`, and the 13 functions that named the old rule or replayed without a business were regenerated from their latest definitions with counted substitutions. `close_pos_shift` now takes the business and refuses an ambiguous key. Proved first on a local Postgres replaying every migration (9 of 14 scenarios misbehaved before, 14 of 14 pass after), then on live data (13 of 13).

   **Item 6 (events in the same transaction) done as 0071, 14 Nov 2026.** `complete_task` and `publish_catalogue_item` are new, `record_attendance` writes its own event, and the TypeScript `publishEvent` helper is gone. 12 of 12 locally (including a forced half-way failure that left nothing behind), 6 of 6 on live.
   **Items 7 and 8 (append-only history, honest ARCHITECTURE.md) done as 0072, 14 Nov 2026.** The seven history tables refuse UPDATE, DELETE and TRUNCATE by trigger, which binds the service role. Scope and the exception were decided with Collins: the seven tables only (sale and payment wait for Phase 2), and one audited `erase_history()` path for data protection requests and test data. `docs/ARCHITECTURE.md` now lists what is enforced and, separately, what is not (RLS, role permissions, most capability gates). 19 of 19 locally, 10 of 10 on live.

   **Phase 0 is complete except item 10** (availability is not checked by `book_service`).

*Status: items 1 and 2 (consent on merge) shipped as 0067 on 11 Nov 2026 (20 checks); item 9 shipped as 0068 on 13 Nov 2026; item 4 done as above. All verified against the live database with test data removed.*

### Phase 1: Identity and Authority enforced

Exit gate: a route or RPC that skips the authority check fails a test.

- One server-side authority resolver: person, business, role, location scope, device. All routes call it.
- A permission catalogue and a single `can(actor, permission, scope)` used by domain functions, not just routes.
- Wire `delegated_authority` into the resolver or retire it.
- `audit_log` gets before, after and reason, written by one function.
- Decision recorded on RLS posture (section 9).

### Phase 2: Commerce core

Exit gate: Finance-style questions (what was sold, what is owed, what was paid) are answerable from the core without touching `sale`, `shop_order` or booking tables.

- Create `commercial_transaction`, `payment_obligation`, `payment_allocation` with the canonical states from the spec.
- Dual-write from `record_sale`, `place_shop_order`, `book_service` and document issue, in the same transaction.
- Backfill: 8 sales, 5 orders, 2 bookings, 12 cash payments. Trivial today.
- Switch readers (reports, Office, Discover, Readiness evidence) to the core.
- Retire product-owned money columns only after a full reconciliation passes.

### Phase 3: Payments

Exit gate: a digital payment for a test merchant lands in that merchant's own provider account, and Ascend can show it as `unknown` then resolved.

- Merchant Payment Profile and provider account tables.
- Provider-neutral interface; Paystack becomes one implementation using subaccounts or split rather than a single platform key.
- `unknown` state with a resolution job, and Paid versus Settled preserved.
- Zero digital payments exist today, so there is nothing to migrate.

### Phase 4: Billing and Ascend Balance

Exit gate: the seeded price book matches Commercial Architecture v2.0 exactly.

- Replace the conflicting price-book seeds.
- Offers, usage meters, passes.
- Split balance entries by funding source (merchant-funded versus sponsored); rebuild the `ascend_balance` view.
- Commissions and attribution.
- Wire Paystack success to `record_purchase` (already pending from earlier work).

### Phase 5: Financial events, evidence envelope, comms, risk

- Financial event foundation and real tax computation (VAT, NHIL, GETFund, COVID levy as applicable; rates confirmed by Collins's accountant, not guessed).
- Event envelope fields per spec; evidence confidence levels enforced.
- One communications send path with consent check and template registry; 360dialog templates approved.
- Risk and Trust first slice.

### Phase 6: Products re-expressed, Control Center, new products

- POS, Shop, Services, Documents, Office reduced to experiences over the core.
- CRM, Finance and Inventory as product sets (capability register already supports this).
- Control Center modules.
- Only now do new products start.

---

## 7. What changes per product

| Product | Today | Changes under the foundation |
|---|---|---|
| POS | Owns `sale`, `payment`, `pos_shift`; offline sync works | Writes a commercial transaction and allocation; keeps offline replay; printer bridge still to build |
| Shop | `place_shop_order` clean; storefront | Order becomes a commercial transaction; payments via merchant profile |
| Services | `book_service` regressed | Phase 0 repair, then bookings become commercial transactions with deposit obligations |
| Documents | `document` with its own client_ref | Invoices become obligations against a transaction; tax computed |
| Office | Expenses, tills, attendance; gate only on nav | Server-side gate; expenses emit financial events |
| CRM | Reads one customer record | Becomes a product set over the customer relationship; revenue from core |
| Discover | Reads catalogue and categories | Reads from core catalogue; trust signals from Evidence |
| Finance | Not built | First product to be built entirely on the core |
| Readiness | Score and evidence separate | Evidence from financial events; confidence ladder enforced |
| Business App | PWA | Single authority context; native channel later |
| Control Center | Platform admin | Add modules incrementally from Phase 3 |

---

## 8. Risks

- **Dual-write drift.** Mitigation: same transaction, plus a nightly reconciliation query that must return zero rows before readers switch.
- **Migration by hand.** One file per phase step, verified against live columns before delivery.
- **Product pressure during pause.** The pause is only on new products. Existing products keep getting bug fixes.
- **Spec drift.** The pack has no numbered requirement IDs, so traceability to the spec is by section. If IDs are wanted, they should be added to the spec rather than invented here.
- **Custody and licensing.** "Control without custody" has regulatory and provider implications. This needs a confirmed Paystack arrangement before Phase 3, not an assumption.

---

## 9. Decisions needed from Collins

1. **Sequencing:** accept retrofit-first, with new products paused until Phase 3 exit? (Recommended.)
2. **Supersession:** treat the 5 Nov planning workspace as superseded by the 8 Nov pack?
3. **Custody model:** Paystack subaccounts with split, or a different provider arrangement? Needs the Payments Partnership document's position confirmed.
4. **Tax:** who confirms current rates and treatment for Phase 5?
5. **RLS posture:** domain-layer enforcement now with RLS as later defence in depth (recommended), or rework sessions so `auth.uid()` is real?

---

## 10. Evidence appendix: how findings were checked

| Finding | How verified |
|---|---|
| 76 RPCs versus 38 direct writes | Script scanning `app/` and `lib/` for `.rpc("...")` and `.from(...).insert/update/delete/upsert` within 7 lines |
| 79 tables, 8 views | Live schema from PostgREST OpenAPI, compared to `create table` statements in migrations |
| Idempotency keys globally unique | Grep of `client_ref text unique` across migrations |
| No tax logic | Grep of app, lib and components for VAT, NHIL, GETFund, covid levy, tax rate, computeTax |
| Office not gated server-side | Grep of `app/work/page.tsx` and `app/api/office/actions/route.ts` for capability or entitlement checks (none) |
| Append-only unenforced | Inserted and attempted to alter a probe row through the service role; probe removed |
| 0064 `book_service` regression | Compared the function body in 0064 to 0020: no `hold_expires_at`, no hold minutes, reduced return payload |
| Consent OR on merge | `0064_one_customer_record.sql` line 135 |
| Entitlement windows ignored | `lib/domains/entitlements.ts` and `0044_capability_register.sql` `business_capabilities()` filter only on status |
| Live volumes | Row counts against the live database |

**Not verified:** route-by-route counts of auth style are directional (my classifier needed a fix for device-token routes). Anyone relying on exact counts should rerun the classifier in the scratchpad.
