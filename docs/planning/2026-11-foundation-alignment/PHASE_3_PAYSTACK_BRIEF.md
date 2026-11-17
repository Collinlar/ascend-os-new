# Phase 3 brief: taking payments for merchants without holding their money

**Prepared:** 16 Nov 2026, for Collins's conversation with Paystack.
**Why now:** Phase 3 (Payments) cannot start until Ascend knows how a merchant's money reaches the merchant. That needs Paystack's written answers, and possibly advice on Bank of Ghana licensing, both of which take weeks. Nothing in Phases 1 and 2 waits on it.

Sections 1 to 4 are for Collins. Section 5 is the list of questions to send or take to Paystack as it stands.

---

## 1. What Ascend needs: control without custody

1. **The customer's money lands in the merchant's own account**, bank or Mobile Money, not in an Ascend account that later pays the merchant out.
2. **Ascend starts the payment and sees what happened to it**: initiated, pending (a MoMo prompt not yet approved), confirmed, failed, refunded, and settled to the merchant. Paid and settled are different moments and Ascend must see both.
3. **Ascend never holds the money**, not even for a day. If Ascend charges a fee per transaction (Phase 4), it is taken in the split, not by collecting the full amount and paying the merchant the rest.
4. **Mobile Money first.** MTN MoMo and Telecel Cash are how Ghanaian customers pay; cards and bank transfer come second.
5. **A merchant can start small.** A trader with a Ghana Card and a personal MoMo number must be able to receive payments, not only registered companies with corporate bank accounts.

## 2. Where Ascend is today

- `lib/payments/provider.ts` already separates "a payment provider" from the rest of the product, with Paystack as the Ghana implementation (MoMo, card, bank transfer).
- It uses **one platform key** (`PAYSTACK_SECRET_KEY`) and **no subaccounts**: a customer paying an invoice today would be paying Ascend's Paystack account. That is custody, and it is what Phase 3 changes.
- **No digital payment has ever been taken on live.** All 12 payments are cash at the till. There is nothing to migrate.
- The commerce core (Phase 2) already records what is owed and what is paid per transaction, and keeps refunds and credits separately. A provider's "paid" and "settled" events have somewhere to land.

## 3. What Paystack offers, as far as can be checked

Confirmed from Paystack's own help centre:

- **Subaccounts and transaction splits.** A payment can be split between accounts called subaccounts, by percentage or by flat amount. With flat splits, "any excess money after the flat amounts have been paid is settled into your main payout bank account." A split can be a single subaccount or a group of several. ([Transaction splits](https://support.paystack.com/hc/en-us/articles/360009881460))
- **Who pays Paystack's fee is chosen per split**: all accounts, all in proportion, the main account, or one named subaccount. For a single subaccount, the API takes `bearer: "subaccount"`. (same source)
- **Payout accounts in Ghana can be Mobile Money.** A Starter Business may use a personal bank account or MoMo number matching the ID it registered with; a Registered Business uses a corporate bank or corporate MoMo account matching its registration. ([Getting your money](https://support.paystack.com/hc/en-us/articles/360012149479-When-will-I-receive-my-payouts))
- **A new or changed subaccount must be verified before its first payout**, or that payout is "delayed indefinitely"; after verification, payout follows the next day. (same source)
- **Transaction fee in Ghana: 1.95%** per transaction, including Mobile Money. ([Transaction charges](https://support.paystack.com/hc/en-us/articles/360009881920-What-are-Paystack-s-transaction-charges))

Reported by other sources, to confirm with Paystack:

- Settlement the **next working day** (T+1) in Ghana, to subaccounts on the same schedule. ([Laravel package notes](https://packagist.org/packages/otatechie/laravel-paystack-connect), [Paystack in Ghana review](https://www.lilachbullock.com/paystack-in-ghana/))
- Transfers out cost **GHS 1 to a MoMo wallet** and **GHS 8 to a bank account**; MoMo payouts have no minimum, bank payouts a GHS 50 minimum. ([Paystack in Ghana review](https://www.lilachbullock.com/paystack-in-ghana/))
- A split goes into **one currency at a time** (GHS for Ghana). ([Paystack blog, multiple splits](https://paystack.com/blog/product/multisplits))

Not found anywhere: whether a **subaccount** (as opposed to a main account) can be paid out to a **Mobile Money** number. The help article on splits mentions only bank accounts. This is the single most important question below.

## 4. The two ways it could work

**Model A: one Ascend Paystack account, a subaccount per merchant.** Ascend is the business on Paystack. Each merchant is a subaccount with their own payout account. Every payment carries the merchant's subaccount, and Paystack settles the merchant's share straight to them; any Ascend fee is the split's remainder.

- For: one integration, one set of keys, merchants onboard inside Ascend in minutes, Ascend sees every payment.
- Against: Ascend is Paystack's customer for every merchant's payment, so Ascend may be the merchant of record, carry the refund and chargeback exposure, and be the one Paystack holds responsible for each merchant's KYC. Whether this counts as "custody" for Bank of Ghana purposes needs an answer (section 5, D).

**Model B: each merchant has their own Paystack account, connected to Ascend.** The merchant signs up with Paystack, and Ascend acts on their account.

- For: the merchant is clearly the merchant of record and the money is unambiguously theirs.
- Against: every merchant must open and activate a Paystack account first, which is a real barrier for a small trader; Ascend would need to hold each merchant's keys (a security burden) unless Paystack offers a connected-accounts arrangement.

**Recommendation:** go to Paystack asking for Model A, and decide only once their answers to sections 5A to 5D are in writing. If a subaccount cannot pay out to MoMo, or Ascend would have to be licensed to run Model A, Model B (or a different provider) becomes the starting point.

**Licensing.** Ghana's Payment Systems and Services Act, 2019 (Act 987) licenses payment service providers in tiers (Scheme, Enhanced, Medium, Standard, and a Payment and Financial Technology Service Provider licence), with merchant aggregation among the activities that need a licence. ([Act 987](https://ghalii.org/akn/gh/act/2019/987/eng@2019-05-14), [a practitioner's guide](https://ukgcc.com.gh/bfd_download/a-practical-guide-to-acquiring-a-psp-licence-in-ghana)) Whether Ascend, never holding money and working through a licensed provider, needs a licence or registration of its own is a question for Paystack's compliance team **and** for a Ghanaian lawyer. It should not be assumed either way.

## 5. Questions for Paystack

**A. Subaccounts and Mobile Money**
1. Can a subaccount be paid out to a **Mobile Money** wallet (MTN MoMo, Telecel Cash), or only to a bank account?
2. Can a subaccount belong to a **Starter Business** (an individual with a Ghana Card and a personal MoMo number), or must it be a registered business?
3. Who verifies a subaccount owner's identity: Paystack, or the main account holder? What does Ascend have to collect, and can verification be done through the API rather than the Dashboard?
4. Is there a limit on the number of subaccounts, or on the volume one subaccount can receive?

**B. Money flow and fees**
5. When a customer pays a merchant's subaccount, is the merchant's share settled **directly** to the merchant's payout account, without passing through Ascend's balance at any point?
6. Settlement timing to subaccounts in Ghana: next working day? Weekends and public holidays?
7. Can Ascend take a **platform fee** from each transaction through the split (percentage or flat), and is that fee settled to Ascend's main account?
8. The 1.95% fee: who can be made to bear it (merchant, Ascend, customer)? Is there volume pricing, and at what volume?
9. Are there any fees for subaccounts or splits themselves?

**C. Refunds, disputes and failures**
10. When a payment to a subaccount is **refunded**, whose balance is it taken from: the subaccount's, or Ascend's main account?
11. For a dispute or chargeback on a subaccount's payment, who is liable, and how is it recovered?
12. A Mobile Money prompt the customer never approves: how long until it is final, and which webhook says so? How does Ascend tell "still waiting" from "failed"?
13. Are webhooks sent per transaction with the subaccount identified, and can Ascend verify a transaction's status on demand?
14. Is there a way to see when a subaccount's payout was actually **settled** (not just paid), per transaction?

**D. Who is responsible**
15. In Model A, who is the **merchant of record** for a subaccount's sale: the subaccount, or Ascend?
16. Does Paystack's licence cover Ascend operating this way, or would Ascend need its own Bank of Ghana licence or registration (for example as a merchant aggregator)? Can Paystack's compliance team put that in writing?
17. Does Paystack offer a **connected accounts** arrangement (Model B), where merchants keep their own Paystack accounts and authorise Ascend to act on them without sharing secret keys?

**E. Getting started**
18. What does going live require from Ascend as the platform (documents, agreements, reviews)?
19. Is there a sandbox for subaccounts and splits with Mobile Money test numbers?

## 6. What Collins decides after the answers

- **Model A or Model B** (or another provider, if Paystack cannot pay subaccounts to MoMo).
- **Who bears the 1.95%**: the merchant (simplest and most honest), Ascend (a cost of the subscription), or the customer (rarely acceptable in Ghana).
- **Whether Ascend takes a fee per transaction** and how much (Phase 4, Commercial Architecture v2.0).
- **Whether to take legal advice on licensing before launch**, and from whom.

With those settled, the Phase 3 plan can be written: merchant payment profiles, provider accounts, the "unknown" state and its resolution job, and Paid versus Settled in the commerce core.

---

## 7. Sent

**17 Nov 2026.** Collins emailed the 19 questions (section 5) to Paystack's general inbox, hello@paystack.com, from Bold Vision MultiTech's business email. A shareable version of the page is on claude.ai (private until shared). If there is no reply within a week, follow up and ask to be put in touch with Paystack Ghana's partnerships or sales team, who handle platform arrangements.

---

## 8. Built ahead of Paystack's answers

**The unknown state, 17 Nov 2026 (0091, `lib/payments/resolve.ts`).** Provider-neutral, so it holds whatever Paystack answers. A payment intent still open a few minutes after it started is checked against the provider on the relay tick (back-off 2, 5, 15, 60 minutes, then hourly, for up to 7 days). Only the provider's "success" or "failed" closes a payment; "abandoned" only when the provider says so; no answer, a reversal or a currency mismatch leaves it `unknown` for a person. Time alone never fails a payment, and a late webhook still confirms. Runs only where `PAYSTACK_SECRET_KEY` is set. Tested 28 of 28 against the real migrations with a stand-in provider; not yet checked against Paystack itself (no test key in this environment). **Needs:** 0091 run, and the next deploy.

**Settled as its own moment, 17 Nov 2026 (0092).** Every confirmed payment now has a settlement state (`payment_settlement`): cash and money sent straight to the merchant are *in hand* when recorded; a provider-confirmed payment is *awaiting* until a payout covers it, then *settled*, with when, the provider's fee and the net. `transaction_settlement` gives, per commercial transaction, what was paid and how much of it has reached the merchant. `record_settlement` now refuses rather than drops: lines must add up to the payout, match confirmed payments of that business, and never settle a payment twice. The reconciliation gains `settlement_differs`. Tested 17 of 17. **Not here:** pulling payouts from Paystack, which depends on the arrangement in section 4.
