# Communications Engine check (spec 05)

17 November 2026. For Collins to approve before anything is built.

Spec: `05_Communications_Engine_Specification_v1.0.md`. The aim: when 360dialog approves the templates, switching WhatsApp on is a setting, not a build. And before any real customer gets a message, consent, opt-out and the DELETE reply must already work.

---

## 1. What is built, and holds

| Spec | Where it lives | State |
|---|---|---|
| One send path (s1, s5) | `queue_message` (0015, latest 0070) and `dispatchQueuedMessages` in `lib/messaging/send.ts`, run by the relay | Every product send goes through it: invoices, receipts, order confirmations, reminders |
| Marketing and transactional consent kept apart (s4, s6) | `message_template.purpose`; `queue_message` blocks marketing without consent and records the refusal | Holds |
| Consent per business (s6) | `consent_record` (0066): business, customer, purpose, channel, granted, withdrawn, detail; customer flags kept in step | Holds; consent is never assumed across businesses because each customer row belongs to one business |
| Templates with approval (s7) | `message_template` with language, variables (`param_order`), approval state (0027), class (`purpose`) | Partly: see 2.4 |
| WhatsApp rules | The 24-hour window (`whatsapp_session`, 0027); outside it only an approved template is sent | Holds |
| Usage billing (s8) | `unit_cost` per template, deducted from Ascend Balance, refunded if the send fails; sponsored sends (0025) | Holds |
| Channels (s2) | WhatsApp (360dialog), email (Resend) | SMS, push and in-app are not built |

On live: 7 templates, all transactional (4 WhatsApp, marked submitted; 3 email); 1 message ever, failed (no provider key); no consent records; no WhatsApp sessions.

## 2. What is missing

### 2.1 Delivery states come back from nobody (s11)

The engine marks a message `sent` when 360dialog accepts it, and stops there. The inbound webhook (`app/api/messaging/inbound`) acknowledges status callbacks and ignores them, so nothing is ever `delivered`, `read` or `failed` after acceptance. There is no record of each attempt, only a retry count. The spec's states are queued, submitted, delivered, failed, bounced, read; ours have no `bounced` (email) and call submitted `sent`.

### 2.2 Customers cannot opt out by replying (s6)

The inbound webhook reads only who wrote, not what they wrote. A customer replying STOP is not opted out. A customer replying DELETE gets nothing, although BVM promises in writing that replying DELETE to any WhatsApp follow-up deletes their data (Ghana Data Protection Act 2012). Consent records have no `source` or `scope` columns (the spec's fields), so a withdrawal by reply could not say how it came.

### 2.3 A reply opens the window for every business

When a customer writes, the webhook opens the free-messaging window for every business that has that phone number as a customer. A customer replying to business A lets business B send them free-form messages too. Whether that matters depends on how WhatsApp numbers are set up (decision 1).

### 2.4 Templates have no version, owner or operational class (s4, s7)

Templates are global, keyed by name, with no version: changing the words of an approved template silently changes what was approved. No template belongs to a business, which marketing will need. There is no operational class (staff approvals, low-stock alerts, device warnings): `purpose` is only transactional or marketing, and Office does not send staff notifications through the engine at all.

### 2.5 No provider adapter (s10)

The 360dialog and Resend calls are written inline in `send.ts`. Adding SMS (Africa's Talking, for customers not on WhatsApp) or a second WhatsApp provider means editing the dispatcher. Payments already has the pattern to follow (`lib/payments/provider.ts`).

### 2.6 No abuse signals (s9) and no view for the Control Center (s13)

Nothing watches for spikes, opt-out rates, failure rates or bulk sends to numbers that are not customers. There is no summary of volume, cost, delivery, failure or opt-outs per business.

### 2.7 Not built, and not needed yet

Campaigns, triggers and schedules (s3): no marketing is sent today, and campaigns belong with the CRM product. Conversations (s3): the window is tracked, but message content is not stored; the CSBot will need it. AI (s12): nothing drafts messages yet; the rule that AI cannot bypass consent is met by AI never having its own send path.

OTP codes (`lib/auth/otp.ts`) go to 360dialog directly, outside the engine. That is deliberate (decision 4).

---

## 3. What this plan builds

| Step | What | Exit gate |
|---|---|---|
| C1 | Delivery states from the provider: the webhook reads status callbacks and moves each message on (submitted, delivered, read, failed); a `message_attempt` row for every provider call; `bounced` for email | A test message on a throwaway business moves through submitted, delivered and read from posted callbacks, on live |
| C2 | Replies: STOP opts the customer out of marketing (decision 2); DELETE records a deletion request and confirms it (decision 3); START asks for consent again rather than assuming it; `consent_record` gains `source` and `scope` | STOP and DELETE posted to the webhook for a throwaway customer, on live: consent withdrawn with its source, deletion request recorded |
| C3 | Templates: version, owning business (none for Ascend's own), and an operational class; approval belongs to a version | Changing an approved template's words makes a new, unapproved version; the old one keeps sending |
| C4 | A provider adapter for WhatsApp and email, the shape payments uses, with room for SMS | Every existing send goes through it unchanged; the dispatcher has no provider code |
| C5 | Abuse signals and a per-business summary for the Control Center: volume, cost, delivery, failure, opt-out rate; flags for spikes and high opt-outs; a daily cap on marketing sends (decision 5) | The summary matches the message table on live; a cap refuses the send after the limit, recorded, not dropped |

The window fix (2.3) goes into C2 once decision 1 is made. Nothing here sends a real message: there is no provider key, test numbers are +233000, and callbacks are posted by the test.

## 4. Decisions for Collins

1. **One Ascend WhatsApp number, or one per business?** *Recommended: one Ascend number to start*, with each template naming the business. It is one 360dialog setup and one approval, not 31. Replies are then attributed to the business that last messaged that customer, and only that business's window opens. Per-business numbers can come later for businesses that want their own.
2. **What STOP means.** *Recommended:* STOP opts the customer out of marketing from every business on Ascend that knows their number, because they cannot tell which one they are stopping, and the safe reading is all. Transactional messages they asked for (receipts, invoices, booking reminders) continue. Each business keeps its own record of the withdrawal.
3. **What DELETE does.** *Recommended:* it records a deletion request and replies to confirm it was received, and BVM completes it by hand within 30 days. It does not erase automatically: invoices and receipts are tax records a business must keep, so deletion means removing the person's contact details and marketing data, not the business's books. The request appears for BVM to act on.
4. **OTP codes stay outside the engine.** *Recommended:* a sign-in code is between Ascend and the person, not a business and its customer, and must never sit in a merchant's message log. It keeps its own path, documented.
5. **A daily cap on marketing per business** until the abuse signals have real data. *Recommended: 200 marketing messages per business per day*, raised per business by BVM on request.
6. **Campaigns, conversations and SMS wait.** *Recommended:* campaigns with the CRM product, conversations with the CSBot, SMS when a business asks for it (the adapter in C4 leaves room).
