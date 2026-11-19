# D4 Tills: plan and decisions

18 November 2026. Part of the v3 design move (`DESIGN_V3_PLAN.md`, step D4). For Collins to approve before any till code changes.

## Where the till is today

`/pos` is one 971-line page that runs every till, from a Sunmi handheld to a counter screen. It is careful where it matters: sales are saved on the device first and sent by an outbox when the network allows, the catalogue and stock are cached in IndexedDB, staff PINs are checked on the device (PBKDF2, five tries, then a minute's lockout), shifts open and close offline, and a second tab cannot run the same till.

What it sells with is narrow: **cash only, no customer, no discount, no returns.**

The server is already further ahead than the till. A till sale (`sale.completed`, `CompleteSaleInput`) already accepts:

- a customer (`customerId`)
- line discounts and a sale discount (`discount`, `discountTotal`)
- several payments per sale, with methods `cash`, `mobile_money`, `card`, `bank_transfer`, `credit` and others, a provider (`mtn_momo`, `telecel_cash`), a reference and a status

`0118` already makes sure a sale on credit is not counted as money received. A refund request route exists (`/api/pos/refund-request`: the cashier asks, the owner decides), but no till screen calls it.

So most of D4 is the till catching up with its own server, inside the design's two layouts.

## What the design asks for

- **Counter Register** (the big screen): sell, customer, discount, manager override, cash, MoMo, QR and card, done, sales, returns, shift, lock, and a customer-facing display.
- **Smart Terminal** (the handheld): setup by code, sign-in, sell, keypad, scan, cart, discount, the four ways to pay, done, sales, shift, device.

## Decisions

**1. One engine, two layouts, chosen by screen width.**
*Recommended:* take the selling logic out of the page into one engine (cart, totals, building the sale, the outbox, the shift), and give it two layouts: the Counter at 1024px and wider, the Terminal below that. Choose by width, not by device kind, because a device set up as a "terminal" may be a handheld or a counter screen, and an owner's phone at the counter should get the Terminal.

**2. Ways to pay.**
*Recommended:*
- **Cash**, as now.
- **MoMo** with the network and the transaction ID the customer's phone shows, recorded as not yet confirmed, which is how Sales already shows it.
- **Card**, with the slip reference from the bank's own machine, also not yet confirmed.
- **On credit**, which needs a customer on the sale.

The design's **QR** and live **MoMo prompt** wait for Paystack, because without a payment provider they would only pretend to confirm a payment.

One way to pay per sale in D4. Splitting a sale (part cash, part MoMo) comes later; the server already takes it.

**3. A customer on a sale.**
The till has to find customers with no network, which means keeping the business's customer list on the device.
- *Recommended:* keep only names and phone numbers, to search by either. Erase the list when the till is stopped from Devices.
- Adding a new customer at the till works offline and is sent by the outbox like a sale.
- *The alternative* is searching online only: nothing personal is kept on the device, but no customer can be added to a sale when the network is down.

This is your call, because it puts customer phone numbers on a shared device (Data Protection Act 2012).

**4. Discounts and the manager override.**
*Recommended:*
- An owner or manager signed in at the till can discount a line or the whole sale, by amount or percent.
- A cashier can ask, and a manager or owner types their PIN on the same till to allow it. That works offline, because PINs and roles are already on the device.
- The sale records who allowed it. That needs one small migration, a column for who approved the discount, because today a sale has nowhere to store it.

*The alternative* is a cashier limit (say up to 5% without asking). That is a setting nobody can change yet, so I would not start there.

**5. Returns.**
*Recommended:*
- From the till's list of recent sales, pick one, say why, and "Ask the owner to refund". It reaches the owner's Work page as a decision, as the route already intends.
- The request goes through the outbox, so it can be made offline. That is one new outbox kind and no migration.
- The till never hands money back on its own say.

**6. Lock.**
*Recommended:* "Lock the till" returns to the staff PIN screen without closing the shift. It exists today in part; the design gives it a button.

**7. The customer display.**
*Recommended:* later, as its own small step after the rest. It needs a second screen on a real counter to test. It can be built offline-safe (a second window kept in step on the same device).

**8. Order of work.** Each step is a commit.
- **D4a:** take the engine out of the page, with no change in behaviour. Check offline before and after.
- **D4b:** the Terminal layout.
- **D4c:** the Counter layout.
- **D4d:** MoMo, card and credit; a customer on a sale; discounts with the override, and the migration for who approved them.
- **D4e:** returns through the outbox, and lock.
- **D4f:** the customer display.

## How it is checked

- **In the browser:** at 375px and 1440px with a throwaway ZZ business, for each step.
- **Offline, here:** stop the dev server so every send fails. Ring up sales, open and close a shift, ask for a refund, add a customer. Start the server again and confirm that each arrives exactly once.
- **What I cannot check here, and need you for:** a full sale, return and shift close on a real handheld and a real counter, with the network really off. The plan's done line for D4 says "on a real device", and that stays yours.

## What does not change

- Setting a till up by code.
- The staff PINs and the lockout.
- The outbox's guarantees: saved first, sent once, kept after an error.
- The catalogue cache and images.
- Printing.
- The second-tab guard.
- How a stopped till is refused.

## Build status

**Approved 18 November 2026** as recommended, including keeping customer names and phone numbers on the till (decision 3).

**D4a, the engine, 18 November 2026.** `/pos` is now the gates (setup, who is at the till, the shift, a stopped till) and nothing else. The engine is `lib/pos/useTill.ts`; building a sale, its outbox entry and its receipt is one function with no storage or screen in it, `lib/pos/sale.ts`; the selling screen moved unchanged to `components/pos/SellScreen.tsx`. Checked on a throwaway business at localhost: pairing by code, PIN, opening a shift, cash sales online and with every request failing, park, bring back and throw away, and closing a shift. Each sale arrived exactly once, stock fell on the till as it sold.

Found and fixed on the way:
- **Till sales were never linked to their shift.** The till sends its shift's own reference; `complete_pos_sale` knows how to turn that into the shift, but `lib/domains/pos.ts` never passed it on. So every shift closed on the server expecting only its opening cash: a cashier who counted correctly showed as over by the day's cash takings. On live: 15 till sales, none linked; 9 closed shifts with the wrong expected cash. Fixed in code, no migration. Checked: a shift opened with GHS 50 and a GHS 12 sale now closes at GHS 62 on the till and on the server. The 15 old sales and 9 old shifts are not repaired; that waits on Collins.
- **A till that had just paired asked whether to pair again**, because the code stayed in the address. It is cleared once pairing succeeds.
- **Two sends of one sale at the same moment** both missed each other and the second failed on the receipt number, leaving the till showing a refused sale the server already had. `0120_one_send_of_a_sale_at_a_time.sql` makes the database take one send of a sale at a time. 6/6 locally; waiting to be run.

Noted, not changed: the outbox treats any 4xx as permanent, so a 404 from a deploy or CDN hiccup parks a sale or a shift close until someone taps "Try sending them again".

**0121, 19 November 2026.** Approved by Collins. Till sales linked to the shift on the same till whose time covers them, and closed shifts' expected cash worked out again by close_pos_shift's rule. 10/10 locally. On live: CLASmart's shift of 23 August, 16:40, now expects GHS 870 against GHS 870 counted (was -20, showing GHS 890 over), with one audit entry saying what it was; six sales linked to shifts still open; six sales made with no shift open left alone.

**0120, 19 November 2026.** On live, the same sale sent eight times at once, three times over on a throwaway business: before 0120 was applied, 14 of 24 sends failed on the receipt number; after, 3 created, 21 answered duplicate, no errors, three sales on the books.
