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

**D4b, the Terminal layout, 19 November 2026.** Below 1024px the till is now the design's light handheld (`components/pos/TerminalLayout.tsx`): an app bar with the till, the shift and who is selling (their menu hands the till over or closes the shift); search, Scan and category chips over a two-column product grid with a count on what is in the sale; "View this sale"; the sale with steppers, "Park it" and "Charge GHS 171.00"; pay in cash with likely notes (Exact, 175, 180, 200 for GHS 171), a keypad, and "Change" or "Still to pay"; and "Sale complete" with the change to give on navy, the printer's answer, "Print again", and whether the sale has reached the office. A gold strip says when sales are waiting and sends them when tapped. Above 1024px the earlier screen stays until D4c. The PIN screen stays navy, as the design has it; setup and the shift screens move to the light design in D4c, since both layouts share them.

Checked at 375px on a throwaway business: pairing, PIN, a shift, a GHS 171 sale paid with GHS 200 (change GHS 29), two sales with every request failing (one survived a page reload mid-sale), park and bring back, the person menu, and closing the shift. Each sale arrived once, linked to the shift, and the shift closed at GHS 333 on the till and on the server.

Fixed on the way: a till that had just been set up said "Nobody can open this till yet" until it was reloaded, because the PIN screen read the staff list before it had arrived. It now fetches the list itself when it finds none.

Noted, not changed: stock the till takes off as it sells offline is kept only on screen, so a reload before the sales are sent shows the old counts until they are; a sale that failed to send once waits out its retry delay unless someone taps the strip.

**D4c, the Counter layout, 19 November 2026.** From 1024px the till is the design's counter (`components/pos/CounterLayout.tsx`): a navy bar with the till, the shift, whether sales have reached the office (gold when something waits, a tap sends it), who is selling and the time; a rail with Sell, Shift and Lock; a large box a counter scanner types into (Enter adds an exact barcode, or a search that leaves one product; an unknown code says so); category chips over a three or four column grid; the sale always in view on the right with steppers, "Park it" and "Charge". Paying opens over it (the sale on the left, likely notes and change in the middle, a keypad), and so does the finished sale, with the receipt as printed beside "Give change". The earlier navy selling screen is gone. Setting a till up, opening a shift and closing it now sit in one light frame (`TillFrame`) shared by both layouts; the PIN pad stays navy. The two layouts share the cash keypad rules and the notices (`lib/pos/cash.ts`, `TillNotices`).

Checked at 1440px on a throwaway business: pairing straight to the PIN, a scanner Enter, an unknown code, a GHS 133 sale paid with GHS 150 (change GHS 17), park and bring back, Lock, and the shift closed at GHS 233 on the till and on the server.

Fixed on the way:
- A till that had just been set up said "This till is not set up yet" in its status while it sold. The status is worked out again at the end of every start.
- A sale answered with 404 or 429 was parked as refused until somebody tapped "Try sending them again". Only 400, 413 and 422 now count as refused; everything else waits and tries again on its own. (The 404s seen while testing came from the dev server losing the sync route after a recompile; a deploy in progress can do the same on live.)
- The "nothing to sell yet" panel was written for navy and would have been white on white in the light layouts; it has a light version, and points to Devices rather than Tills.

Left for D4e: Lock empties the sale, as handing over always has; Sales and Returns on the rail.

**D4d, ways to pay, a customer and a discount, 19 November 2026.** Both tills now take:
- **Cash, MoMo, card, or on credit.** MoMo is the network (MTN MoMo, Telecel Cash, AT Money) and the transaction ID from the customer's message; card is the reference on the bank's slip. Both are recorded as confirmed and "recorded by you" (merchant declared), the same as cash, because a payment marked pending would never be confirmed by anything and would vanish from Sales and money received. QR and a MoMo prompt wait for Paystack. Credit needs a customer and shows as owed, not received (0118).
- **A customer on the sale.** The till keeps the business's customers, names and phone numbers only, from a new device route (`/api/pos/customers`), and searches by name or by the number as people say it. A customer added at the till needs a phone number and travels with their sale; the sync route finds or creates them by phone (`find_or_create_customer`, created via "pos"), so nobody is created twice and the till never invents an id. The list is erased when the till is stopped (a 401) or set up as another till.
- **A discount** of 5, 10, 15 or 20 percent, or an amount, never more than the sale. An owner or manager at the till gives it; a cashier asks, and an owner or manager types their PIN on the till to allow it. That PIN counts against the same tries and lockout as signing in, including a cashier's PIN typed there. The sale records who allowed it: `0122_who_allowed_a_discount.sql` (8/8 locally, waiting to be run; the till works before it is, the approver is simply not stored).
- The shift close's "Cash sales (N)" counts only sales paid in cash.

Checked at 1440px and 375px on a throwaway business: a GHS 76 sale with 10% off for an existing customer paid by MTN MoMo; a new customer added from the credit panel and GHS 95 put on their account; a cash sale; a cashier signed in (the till fetched the new staff list when it met an unknown PIN), their own PIN refused for a discount and the owner's accepted; a card sale; the shift closed at GHS 112 (100 opening plus the one cash sale) on the till and on the server. On the server every sale had the right subtotal, discount, total, customer and payment, and the new customer was created once, via pos.

Noted, not changed: the Devices page shows a browser till's model as its whole user-agent string.

**0122, 19 November 2026.** On live, on a throwaway business: a GHS 10 discount stores the owner who allowed it; an approver from another business is dropped; a GHS 150 discount on a GHS 100 sale is refused (invalid_discount).
