# AscendSME Platform Architecture

Modular monolith with event-driven boundaries (Master PRD §6.3). Product sets
are experience and commercial packages on one shared engine; they are not
independent systems.

## Layer map

| Layer | Where it lives | PRD ref |
|---|---|---|
| Experience | `app/` routes per channel (Business Web, POS Terminal, Customer Web) | §7 |
| Product workflow | `lib/domains/pos.ts` and successors per set | §10 |
| Shared core | `supabase/migrations/0001..0005` + domain services | §9 |
| Event and evidence | `event_outbox`, `evidence_record`, `lib/domains/events.ts`, `lib/domains/evidence.ts` | §13 |
| Partner and intelligence | `report_share`, `score_result`, institution tables | §22 |

## Domain ownership (zero-silo)

Every capability has exactly one owning domain (CAP-001). The `capability`
table is the canonical register (ARC-015).

| Domain | Tables | Owner of |
|---|---|---|
| Identity and People | `person`, `business_membership`, `role`, `delegated_authority`, `device_registration` | who can do what, where, on which device |
| Business Core | `business`, `location`, `country_config` | business identity and localization |
| Customer Core | `customer`, `consent_record` | one customer record for all sets |
| Catalogue Core | `catalogue_item`, `item_variant`, `channel_listing`, `price_version` | one item identity, channel-specific presentation |
| Inventory Core | `stock_movement` (+ derived `stock_balance`) | movement-based stock, never overwritten totals |
| POS Core | `sale`, `sale_line`, `pos_shift` | append-only sales and shift accountability |
| Commerce Core | `shop_order`, `shop_order_line` | structured online orders |
| Services Core | `service_booking`, `staff_availability` | bookings, classes, field jobs |
| Documents Core | `document`, `document_delivery` | immutable issued versions, controlled conversion |
| Finance Core | `payment`, `ledger_entry`, `receivable`, `provider_callback` | one payment model, verification confidence explicit |
| Work Core | `project`, `task`, `approval_request`, `expense`, `attendance_record` | connected work that references, never copies |
| Commercial Core | `entitlement`, `purchase`, `balance_entry`, `price_book_entry` | access, Ascend Balance, country price book |
| Evidence Core | `event_outbox`, `evidence_record`, `score_result`, `report_share` | activity into explainable evidence |

## The write path (example: POS sale)

1. Terminal completes the sale locally: sale, payment, movement, receipt and
   outbox entry persist on-device before success shows (POS-OFF-001).
2. Device syncs its outbox to `POST /api/pos/sync` in dependency order.
3. `lib/domains/pos.ts` validates business, location, device and user scope;
   revoked devices are refused and audited (POS-SYN-003, OFL-013).
4. `complete_pos_sale()` (migration 0007) applies sale, lines, movements,
   payments, ledger entry and the `pos.sale.completed` outbox event in one
   transaction. Retries return the original mapping (POS-SYN-001).
5. The outbox relay dispatches events; the evidence engine
   (`lib/domains/evidence.ts`) writes weighted, versioned evidence records.
   Corrections write negative adjustments; history is never deleted.
6. Readiness computes MOT, Sustainability Score, Trust Level and Funding
   Readiness from evidence with versioned models (`score_model_version`).

## Invariants enforced in schema

- Append-only: `stock_movement`, `ledger_entry`, `balance_entry`,
  `evidence_record`, `score_result`, `audit_log`, `report_access_log`
  (update/delete revoked).
- Idempotency: `client_ref` unique columns on everything a device can create
  offline; `(source_event_id, evidence_type)` unique on evidence.
- Verification confidence: `payment.verification` enum keeps
  merchant-declared distinct from provider-confirmed everywhere (PAY-006).
- Separation of duties: `approval_request` check constraint blocks
  self-approval (IDN-016).
- One open shift per device: partial unique index (POS-SHF-010).
- Tenant isolation: RLS enabled on all business-scoped tables with
  membership-based policies (SEC-001).

## What deliberately does not exist

- No per-product-set customer, product or payment tables.
- No score inputs from product purchases, login frequency or paid promotion
  (RDY-005, EVT-016, EVT-017).
- No hard delete paths for financial or evidence history.
- No prices in code; the country price book owns them (ENT-018).

## Auth and onboarding (phase 2, built)

WhatsApp OTP is the identity flow (migration 0008 + `lib/auth/`):
hashed codes with 10 minute expiry, 5 attempts, hourly rate limit and resend
throttle; revocable server-side sessions behind an HMAC-signed HttpOnly
cookie. `create_business()` turns a verified person into an operating
business in one transaction: business, first location, roles copied from
platform templates, owner membership, free Start entitlement for the chosen
entry set (MON-002), the `business.created` outbox event and the audit row.
`/onboarding` walks details, WhatsApp code, creation, then routes to first
value. Without `WHATSAPP_360DIALOG_API_KEY` the OTP flow runs in
development mode and surfaces the code on screen.

## Outbox relay and evidence loop (phase 3, built)

Migration 0009 + `lib/relay.ts`: `claim_outbox_batch()` leases pending
events with `FOR UPDATE SKIP LOCKED` (a crashed worker just re-leases after
two minutes; consumers are idempotent so re-delivery is safe), dispatch
marks success, failures back off quadratically capped at an hour and park as
`failed` after ten attempts. Vercel cron hits `/api/internal/relay` every
five minutes behind `CRON_SECRET`. The evidence consumer writes weighted,
versioned records; `evidence_summary` aggregates current unexpired evidence
per dimension and feeds `/readiness`, which shows coverage and confidence
separately from scores (EVT-021) and states plainly that purchases never
move the record (RDY-005).

## Shop catalogue-first onboarding (phase 4, built)

Photo-led Shop setup (SHP-001..005): `/shop/setup` takes product photos,
`/api/shop/catalogue-suggest` returns Claude-generated name, description,
category, visible attributes and a GHS pricing note as strict JSON
(`lib/claude.ts`, model `claude-sonnet-5` — the documented replacement for
the deprecated claude-sonnet-4-20250514 in the original stack decision).
The merchant edits and approves; `/api/shop/catalogue` writes the shared
catalogue item with the original suggestion kept for provenance and
`ai_content_approved_at` stamped (API-012), creates the Shop channel
listing, and publishes `shop.catalogue.published`. Nothing is published
without merchant approval (SHP-003).

## Shop storefront and order placement (phase 5, built)

Customer Web storefront at `/s/{shop_slug}` (migration 0010): a customer
opens the shared link from WhatsApp or a QR code, browses visible Shop
listings, baskets, and orders with just a name and WhatsApp number — no
account, no download (CHN-004). `place_shop_order()` is atomic and
idempotent on a client-generated ref: it re-prices every line from the
shared catalogue server-side (the basket is a claim, not a price source),
finds or creates the one shared customer record per business and phone,
writes reservation movements for tracked stock (SHP-018), and publishes
`shop.order.placed` with customer-confirmed verification. `create_business`
now claims a readable shop slug at creation.

## Order management (phase 6, built)

`advance_shop_order()` (migration 0011) is the single transition service:
a whitelist function defines the legal state graph, the transition is
applied under `FOR UPDATE`, and a repeat call landing on the current state
returns `unchanged` rather than double-applying. Reservation handling is
the point of the phase — fulfilment releases the hold *and* commits a real
`sale` movement (stock finally drops for goods that left), cancellation
releases only, and a refund returns goods via `customer_return` plus a
reversing ledger entry. Every movement carries a deterministic `client_ref`
so retries are no-ops. `/orders` puts orders needing a decision at the top
with one obvious next action each and a WhatsApp reply link (OFF-008).
Evidence: placement and fulfilment are weighted separately, and a refund
writes negative evidence against fulfilment rather than deleting it
(EVT-005); cancellations and intermediate progress carry no evidence rule.

## POS offline layer (phase 7, built)

The terminal is now offline-capable in the PRD's sense — it completes real
operations without the server, rather than displaying cached data (§17.1).

- `lib/pos/db.ts` — versioned IndexedDB store (catalogue, sales, outbox,
  shift, meta). `commitSaleLocally()` writes the sale and its outbox entry
  in **one** transaction and resolves on commit, not on request success, so
  a sale is durable before the cashier is told it worked (POS-OFF-001).
  Migrations are keyed on `oldVersion` and additive, so an app update never
  discards queued sales (POS-OFF-012). `requestDurableStorage()` asks the
  browser not to evict the queue; `storageHealth()` warns at 85% before the
  till can lose a sale (POS-SYN-011).
- `lib/pos/outbox.ts` — drains in creation order (POS-SYN-002), stops the
  batch on a temporary failure to preserve order, marks permanent
  rejections `failed` and keeps them visible rather than discarding them
  (POS-SYN-004), retries on quadratic backoff capped at 15 minutes, and
  treats a `duplicate` response as success (POS-SYN-001). Auto-drains on
  reconnect, focus and a slow timer; `drainOutbox(true)` is the merchant's
  manual sync (POS-OFF-010). `statusText()` keeps the strip non-technical.
- `public/sw.js` — network-first navigations with cache fallback so a cold
  start on a dead network still opens the till; API routes are never
  cached. `/offline` is the fallback page, and it points back at the till.
- Receipt numbers use a device-scoped sequence persisted in `meta`, so a
  restart never reissues a number (POS-RCP-008).

## Terminal registration (phase 8, built)

Migration 0012 closes the phase-7 gap: a till is now bound to a business.

- **Pairing.** The owner generates a single-use, 30-minute code on
  `/devices`; the cashier types it on the till. `register_device()` consumes
  the code atomically and mints a device token, returned once and stored
  only on that device. Codes and tokens are sha256-hashed at rest, and the
  code alphabet omits O/0 and I/1 so a cashier cannot mistype them.
- **Server decides scope.** `/api/pos/sync` and `/api/pos/catalogue`
  authenticate the Bearer token via `authenticate_device()`. Business,
  location and device id are injected server-side and the terminal no
  longer sends them at all — a till can only ever write to the business it
  was paired with (POS-SYN-003).
- **Leases.** Every authenticated call renews a 14-day offline lease and
  the owner-visible `last_sync_at` (POS-013). A till that has been offline
  past its lease locks to a "check in now" screen rather than selling
  indefinitely (POS-OFF-006); its saved sales stay intact.
- **Revocation.** `revoke_device()` cuts the lease immediately and flips
  status; the next sync gets a 401, the terminal stops retrying and shows
  "This till has been stopped" with its unsent count (OFL-013, POS-022).
  Owners revoke from `/devices` behind a confirm step.
- Only owners and managers can pair or stop a till; cashiers cannot.

## Shifts and cash accountability (phase 9, built)

Migration 0013 makes the till reconcile a day, not just record sales.

- **Sales belong to a shift.** A cashier opens a shift with a counted float
  before selling (POS-SHF-001/002). `open_pos_shift()` is idempotent on the
  device ref and, if a shift is already open on that device, returns it
  rather than opening a second drawer (POS-SHF-010).
- **Offline-native.** Open, sell, record money out of the drawer and close
  all work with no network (POS-SHF-007). Sales carry the *local* shift ref;
  `complete_pos_sale()` resolves it to the real shift once the shift has
  synced, and raises `shift_not_yet_synced` — classified **temporary** — if
  it has not, so the device simply retries after its earlier queue item
  lands (POS-SYN-006).
- **The server does the arithmetic that matters.** `close_pos_shift()`
  recomputes expected cash from its own payment and expense records rather
  than trusting the terminal, and stores the device's figure beside it in
  `device_expected_cash`. A disagreement is visible, not overwritten.
- **Till expenses ride with the close.** Money paid out of the drawer is
  recorded locally during the shift and inserted with the close, so the
  expected figure accounts for it instead of reading as a shortfall
  (POS-SHF-006). Deterministic refs keep a retried close a no-op.
- **A real gap needs an explanation.** Differences beyond GHS 5 require a
  note before the shift can close (POS-SHF-005); the close screen states
  plainly whether the drawer balanced, was over, or was short.

## Document issuance (phase 10, built)

Migration 0014. Issuing is the moment a draft becomes a commercial record.

- **Numbering.** `document_sequence` is keyed on (business, type, year) and
  `next_document_number()` increments under a row lock, so two devices
  issuing at the same instant cannot collide. Format `INV-2026-0001`,
  restarting each year.
- **Immutability enforced in the database, not the UI.** `issue_document()`
  freezes the full content into `issued_snapshot`, and the
  `document_immutable_after_issue` trigger rejects any later change to
  lines, totals, type, customer, number or snapshot. Status, delivery and
  payment progress still move. Corrections go through revision, credit note
  or cancellation (DOC-004, DOC-005) — an issued invoice cannot be edited
  even by code that tries.
- **Re-issue is idempotent**: an already-issued document returns its number
  rather than burning another from the sequence.
- **Conversions** follow the approved graph only (quote → proforma/invoice,
  invoice → receipt/credit note). The new document is a draft carrying
  `converted_from`; the source keeps its number and is marked accepted,
  never erased (DOC-003).
- **Receivables** are created on issue for invoices and proformas (DOC-017),
  and `issue_receipt_for_sale()` turns a completed POS sale into an issued
  receipt straight from the shared engine (DOC-002, POS-006).

## Messaging engine (phase 11, built)

Migration 0015. One engine owns templates, consent, cost, rendering,
delivery status and retries; product sets call it rather than each growing
their own (MSG-008, CAP-009).

- **`queue_message()` is the single gate.** Consent is checked first, so a
  message the customer refused never costs the merchant money; balance
  second, so a merchant who cannot pay is told before the send rather than
  after. Both refusals are *recorded* as `blocked_no_consent` /
  `blocked_no_balance`, not silently dropped (MSG-002, MSG-006).
- **Transactional vs marketing.** Purpose lives on the template. A receipt
  is the service the customer asked for and needs no marketing consent; a
  promotion does, and is blocked without it.
- **Cost is disclosed and reversible.** Templates carry `unit_cost`; a paid
  send deducts from Ascend Balance with a `service_key` naming exactly what
  it bought (ENT-003), and `fail_message()` refunds a send that never
  reached the provider (ENT-004).
- **Rendering is allowlisted.** Only variables the caller supplies are
  substituted; any remaining placeholder is stripped rather than leaked to
  the customer.
- **Dispatch rides the relay**, not the request path — a merchant issuing an
  invoice never waits on WhatsApp. Delivery failure never fails issuance:
  the document is a record whether or not the message got through (MSG-007).
- **Secure links.** `/d/{token}` renders an issued document for a customer
  with no account and no download (DOC-007, CHN-004). Tokens are random,
  stored hashed, expiring and revocable. The page renders **from
  `issued_snapshot`**, so what the customer sees is what was issued even if
  the merchant's catalogue or branding changed since.

## Payment collection (phase 12, built)

Migration 0016 + `lib/payments/`. Ascend owns the payment experience and the
reconciliation record; Paystack does the regulated processing (§19.1).

- **`payment_intent` is separate from `payment`.** An abandoned checkout is
  an abandoned intent, never money received. Only the verified webhook
  promotes an intent into a confirmed payment.
- **This is the only path that writes `provider_confirmed`.** Everywhere
  else in the platform a payment is `merchant_declared`. A merchant typing
  a MoMo reference can never reach this verification level (PAY-006), which
  is what makes the distinction meaningful to a bank reading the evidence.
- **Webhook safety.** The raw body is read as text (re-serialising would
  break the bytes), the HMAC SHA512 signature is compared in **constant
  time**, and the event is recorded in `provider_callback` *before* it is
  acted on — the unique `(provider, external_id)` constraint is what makes a
  replayed delivery a no-op rather than a double credit (PAY-005, API-007).
  Unverified signatures are rejected with 401 and never parsed.
- **Purpose decides meaning.** A document payment settles the receivable and
  moves the document to paid or partially paid (status moves are exactly
  what the immutability trigger permits); a top-up credits Ascend Balance.
- **Provider is replaceable** behind `PaymentProvider` (PAY-014) — country
  configuration, not a rewrite.
- Customers pay from the shared link with no account (`/d/{token}`).

## Dashboard on live data + revenue recognition fix (phase 13, built)

**Defect corrected (migration 0017).** Migration 0016 posted a
`sale_revenue` ledger entry when a document payment confirmed, but revenue
had usually already been recognised by the POS sale, the fulfilled Shop
order, or the issued invoice. An invoice issued and then paid online
counted its revenue **twice**, so every ledger-derived sales figure would
have overstated income. The rule now: revenue is recognised once, when it
is earned — issuing an invoice (unless it restates an existing sale or
order) recognises it, a credit note reverses it, and confirming a payment
settles a receivable without posting revenue. Balance top-ups post as
`adjustment` and are excluded from the `business_revenue` view, because a
merchant buying Ascend services is not customer income.

**Dashboard** (`lib/reporting/dashboard.ts`) reads real records:

- Attention items are computed, not decorative: orders awaiting
  confirmation (with how long a customer has waited), overdue invoices with
  their total, sales still sitting unsent on a till, and messages blocked
  by an empty balance. An empty list says so plainly instead of inventing
  filler.
- **Sales today** sums POS sales and fulfilled Shop orders from their own
  source records, so the two channels cannot double-count (REP-004).
- **Money received today** is deliberately a separate card from sales, and
  names how much was provider-confirmed versus declared (REP-003).
- Freshness is stated: when a till last checked in, and how much is unsent
  (REP-002, ARC-013).

## Services product set (phase 14, built)

Migration 0018. Services sell time, so the scarce resource is a calendar
and the correctness requirement is that two customers can never hold the
same provider at the same moment.

- **Double-booking is prevented by the database, not by application logic.**
  A generated `tstzrange` column plus a GiST exclusion constraint
  (`assigned_membership_id WITH =, scheduled_range WITH &&`, scoped to live
  statuses) makes an overlapping booking physically impossible to insert.
  No amount of concurrent traffic, retried requests or future code can
  create a clash (SRV-004). `book_service()` catches the
  `exclusion_violation` and turns it into "Someone just took that time.
  Pick another one" — and the customer is bounced back to freshly loaded
  slots rather than a dead end.
- **Availability is computed, not stored as slots.** `available_slots()`
  derives free start times from the provider's working windows minus live
  bookings, honouring per-service duration, buffer and grid step, and never
  offering a time in the past.
- **Booking models** decide the entry status: a fixed slot confirms on
  booking, a request or quote-first job waits for the provider (SRV-001).
- Bookings use the shared customer record (CAP-003) and the shared
  catalogue — service duration, capacity and deposit live in
  `catalogue_item.service_attributes` rather than a parallel service table
  (SRV-003).
- Completion recognises revenue once, consistent with the phase-13 rule.
- Staff notes stay server-side and owner-only; no customer surface reads
  them (SRV-013).

## Provider availability and time off (phase 15, built)

Migration 0019 closes the phase-14 gap: providers can now set their own
hours instead of availability being seeded directly in the database.

- **`replace_availability()` writes a week as one atomic set.** Replace-all
  rather than patch: a half-applied schedule is worse than either the old
  or the new one, and merchants think in whole weeks. A closed day is
  absent, not a zero-length window.
- **Time off is not cosmetic.** `staff_time_off` blocks real periods and
  `available_slots()` now excludes them alongside existing bookings — the
  feature would be worse than useless if blocking a day still let customers
  book into it.
- **Blocking time never cancels commitments silently.** The API returns
  what already clashes (`bookings_in_period()`), the UI lists those
  customers by name and time, and says plainly that nothing was cancelled
  and the provider must decide (SRV-012).
- **Authorisation follows the person.** A provider manages their own
  schedule; owners and managers manage anyone's; a cashier cannot change
  someone else's hours (IDN-004). Omitting `membershipId` defaults to the
  caller's own, so the common case needs no id at all.
- The editor states the consequence rather than the setting: "You are
  closed every day, so nobody can book you."

## Booking deposits (phase 16, built)

Migration 0020. Taking the money is the easy half; the hard part is the gap
between choosing a slot and paying for it.

- **The slot is held, but the hold expires.** Leave the slot open during
  checkout and two customers pay for the same time. Hold it indefinitely
  and one abandoned checkout blocks a provider's Saturday forever. A
  deposit booking therefore sets `hold_expires_at` (default 30 minutes,
  per-service via `hold_minutes`).
- **`release_expired_holds()` runs on the relay** and returns abandoned
  slots to the calendar. It only touches bookings still waiting on a
  deposit — a booking someone actually paid for is never reclaimed — and
  emits an event so the cancellation is visible rather than silent.
- **The customer goes straight to Mobile Money** after booking rather than
  hunting for a link later, when the hold may already have lapsed. If
  checkout cannot open, the booking still exists and the page says so
  instead of losing their slot quietly.
- **A paid deposit clears the hold** and records `deposit_paid`; revenue
  still waits for completion, consistent with the phase-13 rule that
  revenue is recognised once, when earned.
- `/booked/{id}` confirms the customer's own booking and nothing about the
  business's other work — including the honest case where the hold expired
  and the time went back on the calendar.

## Office product set (phase 17, built)

Migration 0021. The internal operating layer behind sales, orders, services
and projects.

- **Connected work references, never copies.** `create_linked_task()` and
  `project_from_quotation()` create work that *points at* the source order,
  booking or document (OFF-003..006, CAP-008). A fulfilment task is not a
  second version of the order, and the quote keeps its own number and
  history. Both are idempotent, so a repeated trigger does not litter the
  board.
- **Nothing reaches the ledger unapproved.** `submit_expense()` checks the
  business's own `approval_rule` threshold: below it, the spend is a cost
  recorded immediately; at or above it, it becomes a request and posts
  **nothing** until approved. An unapproved claim is a request, not a cost.
- **Separation of duties is enforced twice** — by the `approval_request`
  check constraint from migration 0004, and again in `decide_approval()`
  with a message a human can act on (IDN-016). The UI additionally declines
  to offer buttons that would be refused, but the database is the authority.
- Attendance toggles check-in/check-out with one action, available without
  full Office (POS-019, OFF-021).
- `/work` puts decisions waiting on this person above their own tasks, and
  each task states what it came from — a fulfilment task without its order
  is just a sentence.

## Readiness scoring (phase 18, built)

Migration 0022. The evidence ledger becomes explainable outputs — the
product thesis closing on itself.

- **The model is data, not code.** `score_model_version` holds archetype
  weight/expectation maps as JSON, so the model can be reviewed, approved
  and audited without a deployment (SCR-002, SCR-007). Every result stores
  the `model_version_id` that produced it, so a report issued today can
  always be reproduced (RDY-018, EVT-020).
- **Expectations are archetype-specific.** A walk-in retailer is measured on
  financial activity and governance; an online seller on customer and
  market activity. A dimension absent from an archetype's map is simply not
  expected, so a business is never marked down for not using an irrelevant
  product set (SCR-006).
- **Missing is not bad.** A dimension with no evidence reports
  `not_shown_yet`, and the UI says "Not shown yet" — never a zero framed as
  poor performance (SCR-008, RDY-010). Net *negative* evidence (reversals
  outweighing activity) is a separate `concerning` state.
- **Achievement is capped at full.** Ten times the expected volume does not
  make a business ten times more creditworthy, and an uncapped ratio would
  reward activity padding (EVT-009).
- **Confidence is reported beside the score, never blended into it**
  (EVT-021, SCR-011): paid verification can raise how much the record can
  be trusted, but cannot buy a better operating score.
- **Thin records are labelled provisional** below 50% coverage rather than
  presented as a confident number.
- **Funding Readiness carries its disclaimer in the data**, not just the UI:
  Ascend evidence is one input into a partner's own decision (SCR-005,
  SCR-014).
- The relay rescores only businesses whose evidence moved in that batch.

## Institutional and partner layer (phase 19, built)

Migration 0023. The surface a bank reads. The properties that matter here
are the negative ones — what a partner cannot see, infer, or keep.

- **Field scope is an allowlist, enforced server-side.** `shareable_field`
  defines what may ever leave a business; `grant_report_share()` **rejects**
  an unknown field rather than silently dropping it, since a silent drop
  would let a caller believe something was shared (INS-006, RDY-014).
- **Individual customers, staff and transactions are never shareable at any
  scope.** Only summaries — monthly revenue totals, document counts,
  activity counts. There is no field that exposes a customer record.
- **Access is logged before data is returned**, so a read cannot occur
  without a record of it, and the business sees the count and last-opened
  time on `/sharing` (INS-010, RDY-015).
- **Revocation is immediate**: the next read returns nothing. Expiry is
  mandatory (default 30 days, max 180) — consent that never lapses is not
  really consent.
- **Limitations travel inside the payload**, not just the page, so a
  partner integration cannot render the numbers while dropping the caveats
  (INS-009, SCR-014, INS-008).
- **Cohort aggregates are suppressed below five businesses.** An "average"
  over two businesses discloses both. Sponsors get adoption and coverage,
  never a roster of who is struggling (INS-007, INS-008).
- Sharing is owner-only; it is not a staff decision.

## MOT (phase 20, built)

Migration 0024. **MOT is not another score** — that separation is the whole
point (RDY-002, SCR-001). The Sustainability Score answers "how strong is
this record". The MOT answers "what is wrong right now, and what should be
done about it". A business can pass its MOT on a modest score, and a
business with a good score can fail one because something broke this month.

Seven checks, each reading a real condition and naming the specific action
that fixes it (SCR-004):

1. **Trading consistency** — long silences are the earliest signal a
   business has stopped operating, or stopped recording.
2. **Cash reconciliation** — shifts left open, or closed with an
   unexplained difference.
3. **Collections** — overdue receivables, weighted by count and value.
4. **Device health** — sales stranded on a till are in nobody's record but
   that device's, and the owner usually does not know.
5. **Documentation** — sales recorded but nothing issued means no paper
   trail.
6. **Nothing stuck** — orders and approvals waiting on a person.
7. **Identity** — unverified is `attention`, never a failure: the platform
   does not require legal registration (VIS-002, MKT-005).

Checks that do not apply to how a business operates return
`not_applicable` rather than marking it down for something it does not do
(SCR-006). Reviews are append-only and carry their model version; the next
review is due in 90 days, and an owner can run one on demand before a
lender meeting.

## Sponsored entitlements (phase 21, built)

Migration 0025. An institution can fund access for a cohort. The rules that
make this safe for the *business* rather than only convenient for the
sponsor:

- **Sponsorship funds access, never ownership.** Records belong to the
  business throughout and afterwards (INS-003, ONB-011); a sponsor never
  gains owner-equivalent access (IDN-018).
- **The ending is written at the start.** `transition_plan` is stored on the
  sponsorship and shown to the business on `/sponsorship` *before* funding
  ends — records kept, export available, funded products drop to free tier,
  unspent credit returns to the sponsor.
- **Ending deletes nothing.** `end_sponsorship()` moves entitlements to a
  30-day grace rather than cutting a business off mid-transaction, and the
  audit row records `records_deleted: 0` explicitly (PRI-004, ENT-008,
  INS-014).
- **Sponsor credit is restricted money.** `restricted_to` rides on the
  balance entry itself, and `available_balance(business, service_key)` is
  now what spending checks against — so funded credit cannot be spent
  outside what the sponsor agreed to fund (INS-015, ENT-005). `queue_message`
  was updated to use it; without that change, restricted money would have
  silently behaved like general money.
- **Unspent credit returns to the sponsor**, because it was never the
  business's money.

## Ascend Discover (phase 22, built)

Migration 0026. The last product set, and the one most capable of
corrupting the platform's core promise — so it is built around its
constraints rather than its capability.

- **Promotion activity can never become evidence.** The
  `evidence_excludes_promotion` trigger rejects any evidence row resembling
  promotion, impressions or Discover activity. A future developer adding a
  rule for `discover.*` gets a loud failure instead of silently converting
  ad spend into creditworthiness (DSC-016, EVT-016, RDY-005).
- **Money buys order, never admission.** Promoted results are drawn *only*
  from already-eligible listings, so a suspended business cannot pay its
  way back into results (DSC-005).
- **Paid placement is labelled as what it is and what it is not**: "this
  business paid to appear here, it is not a recommendation" (DSC-002,
  PRI-006, RDY-016).
- **Paid results are capped at roughly a quarter of a page.** A results list
  that is mostly advertising stops being useful to customers, and a
  Discover nobody trusts is worth nothing to merchants either.
- **Budgets are hard.** `record_discover_click()` charges at most the
  remaining budget, checks `available_balance` for the restricted service
  key, and marks a campaign `exhausted` rather than overspending.
- **A failed click record never blocks the customer** from reaching the
  business they chose.
- Merchant reporting covers impressions, clicks and attributed actions
  (DSC-010, DSC-011) and is framed as reach, never as performance or trust.

## Gap closure (phases 23–25, built)

**WhatsApp compliance** (0027, 0028). The engine now tracks the 24-hour
customer service window opened by an inbound message, sends free text
inside it and a registered template outside it, and refuses to spend a
merchant's balance on a message the provider was always going to reject.
Checks run consent → deliverability → money, so nobody is charged for an
undeliverable send. Message variables are stored so template parameters go
out in the provider's registered order.

**Refunds and settlement** (0029). Refunds validate against what remains
refundable, go to the provider, and count only when the provider confirms —
then write a reversing payment linked to the original, post a refund ledger
entry, and unwind whatever the original settled. Cash payments are refused
with an explanation rather than attempted. Settlements record gross, fees
and net with their constituent collections; `unsettled_collections` answers
"the app says I took GHS 4,000, where is it".

**Discover moderation and campaigns** (0030). Suspension requires a reason
and pauses running campaigns so a merchant does not keep paying for reach
they cannot receive. `appeal_listing()` gives a right of reply that is
recorded permanently; the merchant sees the reason and can answer it.
Campaigns refuse to start on ineligible listings or beyond available
balance.

## Remaining known gaps

- **Open product decision:** POS receipt numbers do not consume document
  numbers. Making every offline cash sale claim one would leave gaps in the
  sequence whenever a sale fails to sync. This needs a product call, not an
  engineering one.
- **Platform-side moderation console** is unbuilt: `suspend_listing()` and
  `decide_appeal()` exist and are callable, but there is no internal review
  UI. Appeals currently land in the database awaiting a human with database
  access.
- **Regional configuration beyond Ghana** and **migration from the first
  deployment** are untouched. The latter needs the existing deployment's
  schema, which this repository does not have.
- Nothing here has run against a live database. `supabase db push` is the
  first real test, and the Next.js build does not type-check migrations.
3. Shift open/close service functions mirroring `complete_pos_sale`.
4. Documents issuance with per-business numbering sequences.
