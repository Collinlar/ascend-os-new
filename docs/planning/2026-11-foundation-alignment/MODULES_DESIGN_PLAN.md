# Business modules: one look across Documents, Office, CRM and Services

26 November 2026. For Collins to approve before anything is built. Paystack waits until this is done.

Source: `Ascend Business Modules.dc.html` (v1, "PRDs v3.0 and CRM v2.0, 8 Nov 2026") and the four module files attached: `Ascend Documents Web`, `Ascend Office Web`, `Ascend CRM Web`, `Ascend Services Web`. The index also draws **Shop** (screens 15 to 18) from `Ascend Shop Web`, and the customer's phone screens (4 to 6, 18, 22, 23) from `Ascend Customer Phone`; neither file was attached, so Shop and the phone screens are not in this plan yet.

The short version: the four modules share one frame, and most of it is look and feel Ascend can adopt now, on every module page at once, from data it already has. Inside each module the designs also draw things Ascend does not do yet (a sales pipeline, campaigns to customers, leave, pay links, recurring invoices). As in the v3 move (DESIGN_V3_PLAN, D3 exit gate), a screen shows only what Ascend can back with real data; those features are listed below as separate decisions, not drawn empty.

---

## 1. The frame the four modules share

This is what makes them feel like one product, and it is the part to build first.

1. **Sidebar in groups.** Home; **Sell**: Sales, Shop, Bookings; **Customers and money**: Customers, Documents, Money; **Run the business**: Office, Inventory, Reports. Small uppercase group labels, orange count badges, the business card at the top and the person at the bottom (which Ascend already has).
2. **A top bar on desktop.** Search ("Search documents, customers, amounts", worded per module), the place switcher ("All locations"), help, notifications with a count, and the module's one primary action ("New document", "New booking").
3. **A module header band.** White, under the top bar: a 44px teal tile with the module's icon, the kicker ("Ascend Documents") over the title, one line on the right saying what the module is for ("Create the document. Move the transaction forward. Keep the evidence."), and the module's tabs underlined beneath.
4. **Figures, then work, then a right rail.** Four figure cards in a row; the main list or board on the left; a 300px rail on the right of action cards: "Needs you today" first, with the one button that clears it ("Send 4 reminders on WhatsApp"), then shortcuts.
5. **Shared pieces.** Status pills in six tones (ok, warn, bad, info, mute, teal); filter chips with counts; small grey tags for "came from" ("Services booking", "Shop order"); initials avatars in a colour per person; a vertical timeline (an invoice's evidence trail, a booking's progress, a customer's history); a dark toast after an action.
6. **A gold card for the paid step up** ("Documents Plus", "Office Team Pass"), only where the business does not have it.

Ascend already has most of the parts (v3 tokens, `PageShell`, `Panel`, `FigureRow`, `Pills`, `AttentionList`), so this is mostly assembly.

## 2. Module by module

### Documents (`/documents`)
| Design | Ascend today | |
|---|---|---|
| All documents with "came from", amount, balance, status; filters by type with counts | Built in D3 (numbers, who, due, status, amount; filters) | Add "came from" and balance columns |
| Figures: outstanding, overdue, collected this month, average days to payment | Outstanding and overdue built | Collected and days to pay can be worked out from payments |
| Needs you today: overdue invoices, accepted quotations | Data exists | Build |
| Create a document: quotation, invoice, receipt, purchase order, delivery note, credit note | Quotation and invoice from the page; the rest exist as types or conversions | Build the grid for those Ascend can issue |
| Invoice page: document, payments received, balance, evidence trail | Invoices, payments and evidence exist; no invoice detail page | New page |
| Pay link, "Send reminder", automatic reminders | Not built (pay links need Paystack) | Decision 4 |
| Accepted quotation to agreement, invoice or order | Quotation to invoice exists; agreements do not | Invoice now; agreement later |
| Documents Plus (recurring invoices, signatures) | Not built, not priced | Leave out (decision 5) |

### Office (`/work`, `/team`)
| Design | Ascend today | |
|---|---|---|
| Today: due today, awaiting approval, at risk, team active; priority actions; work in progress; team today; schedule; business pulse | Work page has approvals, tasks, who is in; Home has the figures | Build as Office's first tab |
| Approvals: list by kind, detail with the rule, context and audit trail, approve or reject with a note | Approvals exist (refunds, purchases, expenses, discounts) | Restyle into list and detail |
| Work board: To do, In progress, Waiting, Done, by project | Projects and tasks exist | Board view of what exists |
| People: directory, today's status, attendance this week | Team page and attendance exist | Merge Team into Office as People |
| Leave, staff documents, a time-bound external accountant | Not built (accountants get access through Sharing) | Decision 4 |
| Office Team Pass card | Priced (team_ops_5/15/30), switched on by Ascend | Show for owners without it |

### CRM (`/customers`)
| Design | Ascend today | |
|---|---|---|
| Customers with segments, "came from", last visit, visits, lifetime, can message | Built in D3 (filters, spent, owes, last seen, consent) | Add came from and segment chips |
| Figures: customers, repeat share, inactive 90 days and what they spent, open opportunities | First three computable | Opportunities: decision 4 |
| Customer profile: contact, tags, consent, lifetime, visits, average gap, owes, one history across sales, payments, bookings, documents and messages | History exists as a drawer; no profile page | New page |
| Next action, opportunity, notes, tags | Not built | Decision 4 |
| Pipeline (seven stages) and campaigns to a group | Not built (only Discover promotion campaigns exist) | Decision 4 |

### Services (`/bookings`, `/services`, `/availability`)
| Design | Ascend today | |
|---|---|---|
| Day schedule by staff, coloured by deposit state, no-shows, blocked time | Bookings, deposits, staff assignment and no-shows exist; shown as a list | New day view |
| Requests to review, waiting on deposits | Data exists | Rail cards |
| Booking page: who, when, where, price, how it is going, payments, change it, policy, the customer in CRM | Partly in the bookings list | New page |
| Service setup with price method, deposit, cancellation policy and a live preview | Service catalogue exists | Restyle with preview |
| Classes (6 of 8), "Send pay links", rebooking reminders | Capacity and reminders not built; pay links need Paystack | Decision 4 |

## 3. How to build it

| Step | What | Exit gate |
|---|---|---|
| **M1 Frame** | Sidebar groups and labels; desktop top bar (place switcher, module search, primary action; notifications from the attention list); the module header band; pills, chips, tags, avatars, timeline and toast as shared components | Every module page in the new frame at 1440px and 375px; nav still follows capabilities |
| **M2 Office** | Today, Approvals, Work board, People (Team moves in) | Each tab with the business's own data |
| **M3 Documents** | List with came from and balance, figures, Needs you today, Create a document, invoice page with payments and evidence | Invoice page shows a real part-paid invoice correctly |
| **M4 Services** | Day schedule by staff, booking page, service setup with preview | A real day with deposits and a no-show |
| **M5 CRM** | Segments, figures, customer profile with one history | A real customer's history across till, shop and bookings |

Each step tested on live with throwaway ZZ data, like the inventory work, and no migration unless a figure needs one.

## 4. Decisions for Collins

1. **Order.** *Recommended:* M1 first, then Office, Documents, Services, CRM. Office's Today screen is where an owner starts the day, and approvals already flow there.
2. **Sidebar.** *Recommended:* the design's groups and labels. Three items today have no place in the design: **Products** (into Inventory, as its own tab), **Team** and **Work** (into Office, as People and Work), **Orders** (into Shop once the Shop design arrives; until then it stays under Sell). **Reports** is left out until there is a Reports page.
3. **Top bar.** *Recommended:* the place switcher (CLASmart has two places now), search within the module you are in, the primary action, and notifications from what Home's attention list already knows. A search across everything waits.
4. **Features the designs draw that Ascend does not do.** *Recommended:* left off the screens for now, each its own build later when you ask: sales pipeline and opportunities; campaigns to customers; customer tags, notes and next actions; leave and staff documents; recurring invoices, automatic reminders and signatures (Documents Plus); service agreements; class capacity. Pay links and "Send reminder with pay link" wait for Paystack.
5. **The gold upgrade cards.** *Recommended:* only for something with a price and a way to switch it on: the Office Team Pass yes, Documents Plus no until it exists.
6. **Shop and the customer's phone.** Attach `Ascend Shop Web` and `Ascend Customer Phone` and I will add them as M6.

---

## 5. Approved, and what was built

Collins approved decisions 1 to 6 as recommended on 26 November 2026.

### M1 Frame (done, 26 November 2026)

- **Sidebar groups.** Home; Sell (Sell, Sales, Orders, Shop, Bookings); Customers and money (Customers, Documents, Money); Run the business (Office, Inventory, Promote, Investment readiness); More as before. Work is now **Office**. Team folds into Office as its People tab, and Products into Inventory as its Products tab, whenever the module is there; each still stands alone for a business without the module (`FOLDED_INTO` and `earns()` in `lib/nav/workspace.ts`). The phone's four tabs are picked by how often a screen is needed (`rank`), not by sidebar order, so they are unchanged.
- **Desktop top bar** (`components/shell/TopBar.tsx`): the page's search and primary action (filled by the band through portals), the place switcher, and the bell. No help button: Ascend has no help page yet, and a button to nowhere is worse than none.
- **Place switcher.** Shown only with two or more places. Cookie `ascend_place`, set by `POST /api/business/place`, which accepts only an active place of the open business that the membership reaches (`location_scope`). The workspace resolver checks again on every read, so a forged cookie is ignored. Today it moves the shell's place name and every screen that reads `workspace.locationId`; the module lists follow it as each module is rebuilt.
- **Bell.** `GET /api/attention`, fetched after the page draws and again whenever it is opened. Built from the same rows as Home's "Needs attention" (`lib/reporting/attention.ts`, which Home now uses too).
- **Module header band** (`components/shell/Module.tsx`, identities and tabs in `lib/nav/modules.ts`) on Documents, Customers, Bookings, Services, Availability, Office (Work, People), Inventory (tabs moved up from the page, Products added), Products, Sales, Orders, Money and Shop. Loading skeletons match it.
- **Search and primary action in the bar** where the page could already back them: Customers (search, "Add customer") and Documents (search, "New quotation", "New invoice"). Both open their form through `?add=1` / `?new=`, then clean the address. Inventory's several stock actions stay at the head of the page rather than crowding the bar.
- **Shared pieces** for M2 to M5: `StatusPill` (six tones), `Tag`, `Avatar`, `Timeline` (`components/shell/Parts.tsx`) and `Toast` (`components/shell/Toast.tsx`). The existing `Pills` are already the design's chips with counts.
- `currentWorkspace` is cached per request, since the shell, the page and the band all ask.

Tested on live with a throwaway ZZ business (two places, a cashier limited to one, a sold-out product): 18 of 18 passed, covering the bell, the switcher's refusals, a forged place cookie, the folded sidebar, every band and tab set, and the bar's actions. Checked in the browser at 1440px and 375px with no horizontal scroll. ZZ data removed.

### M2 Office (done, 26 November 2026; 0139 run on live)

Office already had more than section 2 assumed: time off (0061, decided through `approval_request`), jobs with steps (0062), a schedule and a command centre. M2 reorganises them into the design's four tabs, and adds the one thing the board needed.

- **Today** (`/work`). For an owner or manager: the date and place, "N things need you" (requests waiting, tasks overdue, tasks due today), four figures (Due today, Awaiting approval with the GHS waiting, At risk = overdue plus waiting on someone, Team in today), Needs you first with one button each, Jobs in progress with progress bars and who is on them, and a rail: your check in, Team today, On today, the last 7 days, Start something, and the gold Office Team Pass card for an owner without `office.work` (links to Plan and billing, where the passes are priced). For anyone else: their hours, their work, and what they asked for with the answer and the decider's note.
- **Approvals** (`/work/approvals`). List with chips (Waiting, each kind waiting, Decided in the last 30 days) and a detail: who asked and their role, when, the amount or the days off, why it needs a decision (the business's own GHS limit for spending; the till rule for refunds and discounts), what it is tied to (receipt, what came back, the limit, the days), and a timeline. Turning something down needs a note. Staff see only their own requests.
- **Work** (`/work/board`). To do, In progress, Waiting and Done this week, filtered by job and by person, with the job and "came from" tags, due pills (Overdue N days, Due today, Due 27 Nov, Done 23 Nov), the person's initials, and Start, Waiting, Back on it, Done and Reopen on each card. One column at a time on a phone. Staff see their own work and work nobody has; the route refuses moving anyone else's.
- **People** (`/team`). Figures (on the team, checked in now, on time off, time off asked for), the team table with where each person works (only with more than one place), today (in since, off until, not in), the last 7 days (days, finished hours), Roles and Hours in the rail, and "Add someone" in the top bar.
- **Migration 0139** (`0139_task_moves.sql`): `set_task_status` moves a task between the four columns with its event in the same transaction (`office.task.moved`, or `office.task.completed` exactly as `complete_task` writes it), refuses a cancelled task and another business's task. It also adds `approval_request.decision_note`: `decide_approval` wrote the decider's note over the requester's reason, and for a purchase the approval trigger reads that same note to write the purchase order. The route now sends `decide_approval` no note and keeps the decider's words in the new column. Tested locally, 13 of 13.
- The old `WorkBoard`, `CommandCentre` and `Schedule` components are gone; their forms live in `components/office/OfficeForms.tsx`, shared by Today and the board.

Tested on live before 0139 with a throwaway ZZ business (an owner, a staff member, a cashier, a GHS 50 spending rule, a job, three tasks, a spend and a time off request): 31 of 31. After 0139 ran: 38 of 38, adding the moves (Start, Waiting, Done, a staff member refused on someone else's task, a cancelled column refused, one event per move) and the decision note (the reason kept, the note saved and shown to the person who asked). Checked in the browser at 1440px and 375px with no horizontal scroll.

Not built, as decided (decision 4): leave balances ("Leave left"), staff documents, and a time-bound external accountant (Sharing covers an outside accountant). The design's "Business pulse" of sales, bookings and cash is Home's job; Today shows the team's last 7 days instead.

### M3 Documents (done, 26 November 2026; 0140 run on live)

Two things the invoice page needed had no function behind them, and one existing button did not do what it said.

- **"Mark paid, make a receipt" recorded no payment.** It turned an invoice into a draft receipt, but an invoice's balance is worked out from payments (`document_amounts`, 0086), so the invoice stayed owed and kept being chased. Only a pay link could pay an invoice. That button is gone from the screens.
- **Migration 0140** (`0140_invoice_payments.sql`):
  - `record_document_payment` records money taken outside a pay link (cash, MoMo to the merchant's number, bank transfer, card) as a confirmed, `merchant_declared` payment against the invoice. Everything a pay link sets off follows: the receipt (0052), the commerce core's allocation (0083), the financial event (0100), and the invoice's status. Refuses more than is left, a future date, a pay link method, a quotation, a draft, another business's invoice, and a repeated tap (one `client_ref`, one payment). Needs `documents.create`.
  - `send_invoice_reminder` sends one reminder now, counted with the weekly ones (`queue_payment_reminders`, at most six, the same `reminder:<id>:<n>` key so the two never send the same one), not twice within 20 hours, and only counted when it is really on its way.
  - Tested locally: 28 of 28.
- **WhatsApp reminders on live are held.** The `invoice.reminder` WhatsApp template is "submitted" (waiting for Meta), and the email one is "draft". So reminders, including the weekly automatic ones, cannot go by WhatsApp yet. When Ascend cannot send one, the screen says why and offers "Send it from your WhatsApp" with the same words and the invoice link.
- **The list** (`/documents`, now `app/documents/(list)/` so its loading screen does not swallow a document page's 404): four figures (Outstanding, Overdue with the oldest, Collected this month with the pay link share when there is one, Average days to payment over the last 90 days), the table with "came from" (a booking, a shop order, a till sale, a job, "From QUO-0012", "A payment") and the balance, rows that open the document, search that also finds "where it came from", and a rail: Needs you today (overdue invoices with "Send N reminders", accepted quotations with no invoice yet, unsent drafts), Make a document, and How your documents look.
- **The document page** (`/documents/[id]`): the document as the customer sees it (lines, subtotal, paid, credited, balance due), Payment (total, received, balance, the progress fill, each payment with how, when, who recorded it or that the provider confirmed it, its reference and its receipt), Remind and Record a payment, Reminders, linked documents (made from, became, credited by) with the next step (Make the invoice, Make a proforma, Give money back, Send this out), and the Evidence trail built from the records (drafted, made from, issued, sent or not sent on WhatsApp or email, opened by the customer, reminders, payments, credit notes, paid in full). A receipt points back at the invoice it paid.
- Pay links, the QR on the invoice, Documents Plus (recurring invoices) and agreements are left off, as decided.

Tested on live before 0140 with a throwaway ZZ business (a quotation made into an invoice, an invoice 12 days overdue, an accepted quotation, a draft): 27 of 27, and in the browser at 1440px and 375px with no horizontal scroll. After 0140 ran: 40 of 40, adding a part payment by MoMo with its reference and receipt, the same tap twice, more than is left refused with the amount left, the rest in cash to paid in full, the receipt pointing back, a paid invoice not chased, a quotation refused, and a reminder that cannot go by WhatsApp held back with the merchant's own WhatsApp offered and not counted.

**Found while testing:** every `document.issued` WhatsApp message on live fails too ("WhatsApp will not deliver this outside a customer conversation until the template is approved"), so invoices are not reaching customers by WhatsApp; nothing is charged. The document page now has "Send it from your WhatsApp" (route action `share`: a customer link and the words, opened in the merchant's own WhatsApp). `NEXT_PUBLIC_APP_URL` is not set locally; the reminder and share links fall back to the request's own address, but the messages Ascend sends itself use only that setting, so it must be set on Netlify.

### M4 Services (done, 26 November 2026; no migration)

- **Bookings opens on the day** (`/bookings`, now `app/bookings/(list)/` for the same 404 reason as Documents): a column per person with each booking placed at its hour and coloured by where it stands (deposit paid, awaiting deposit, booked, request, no-show, done), agreed time off shown as Away, and a column for bookings nobody has been given. Day before and after, and back to today. On a phone the day is one list in time order. "All bookings" keeps the old list and week view. The rail: bookings this day, deposits in, booked value, no-shows; Requests to answer; Waiting on deposits.
- **Each booking has a page** (`/bookings/[id]`): the customer and their visit number, when and until, with whom, where (place or their address), price; how it has gone (booked, confirmed, started, done, did not come, cancelled with the reason, payments), from its own events; notes for whoever does it; money (deposit, payments, still to pay); who does it, and Accept, Start, Mark done, They did not come, Cancel with a reason; "Ask for the deposit on WhatsApp" from the merchant's own WhatsApp while a deposit is owed; and the customer's spend, bookings and what they owe.
- **Service setup** keeps its editor and adds "What customers see" beside it, updating as the form is filled in. Times are not invented in the preview: customers pick from availability.
- **Fixed:** the booking list's Accept, Start and Mark done buttons called the booking route with PATCH, which it has never accepted, so they did nothing.
- **Not built, as decided:** pay links for deposits ("Send pay links"), class capacity, rebooking reminders, cancellation policies (no such setting exists), and "Complete and take the balance at the till".

Tested on live with a throwaway ZZ salon (two stylists, the owner away from 17:00, a paid deposit, a deposit owed, a done booking, a no-show, a request for tomorrow with nobody assigned): 28 of 28, including Start and Mark done working again, accepting with nobody assigned refused until someone is given it, and cancelling with a reason. Checked in the browser at 1440px and 375px with no horizontal scroll.

### M5 Customers (done, 26 November 2026; no migration)

- **The list** (`/customers`, now `app/customers/(list)/` for the same 404 reason): four figures from the whole customer base whatever the search keeps (Customers; Came back, the share of customers who came more than once; Not seen in 90 days, with what they spent before; Owe you, with how many). Segments: Everyone, Came back, Owe you, Agreed to offers, Not seen in 90 days. The table: customer and number, came from, last visit, visits (till sales, shop orders and bookings; documents are paperwork about those), lifetime, owes you, and how they can be messaged. Rows open the profile. The search now narrows on this side, so the figures stay whole.
- **The profile** (`/customers/[id]`): who they are (number, email, how they first came, customer since, last seen), WhatsApp them from your own phone, New invoice; Offers and messages (their own orders always; offers only when agreed, with when and how it was recorded, from `consent_record`, and the switch for whoever holds `customers.manage`); four figures (spent with you, visits, how often they usually come back, owes you); and one history across till sales, shop orders, bookings, documents, payments and the messages Ascend sent, with filters, each entry opening its booking or document. Receipts made automatically for a sale or a payment are left out, since the sale or payment is already there.
- `customer_history` (0064) returns no ids, so the profile reads the source tables itself, each scoped to the business and the customer.
- **A data quirk to know:** "last seen" (`business_customers`, 0090) takes the latest of sales, orders, bookings and documents by their `created_at`. A till sale's receipt document is created as the sale syncs, so a sale that synced late counts as seen when it synced, not when it happened. Worth fixing in the function one day (use the document's `issued_at`, or leave receipts out).
- **Owe you** comes from the commerce core, so a completed booking nobody has paid for counts as owed, as it does on Money and Home.
- **Not built, as decided:** tags, notes, next actions, the pipeline and opportunities, and campaigns ("Message this group").

Tested on live with a throwaway ZZ business (a customer with a till sale, a finished booking, a part-paid invoice and an agreement to offers; one who came once 100 days ago; one who never came): 23 of 23, including the figures, segments, search, the profile's figures and history with its links, agreeing and opting out, and a customer of another business not found. Checked in the browser at 1440px and 375px with no horizontal scroll.

---

## 6. M6 Shop and the customer's phone (plan, 26 November 2026, for Collins to approve)

Source: `Ascend Shop Web` (Overview, Smart Setup, Orders) and `Ascend Customer Phone` (pay an invoice, waiting for MoMo, paid; the storefront; book a service, booked). Both arrived as bundled pages; the markup was unpacked and read as text.

### What Ascend has, and what it does not

| Design | Ascend today | |
|---|---|---|
| Overview: "Your Shop is live", link, Copy and Preview | Shop page with the link and share | Restyle |
| Figures: revenue 30 days, orders (paid, waiting), checkout to paid, repeat buyers | Revenue and orders from fulfilled orders; repeat buyers can be worked out | "Checkout to paid" needs online payment (Paystack) |
| From visit to paid (visits, viewed a product, started checkout, paid) | Not tracked: no storefront visits or product views are recorded, only Discover's own events | Decision 3 |
| Selling now, with low stock | Shop order lines and stock levels | Build |
| Discover: share of visits from Discover, promote | `discover_event` visits; Promote exists | Build, from Discover's visits only |
| Waiting for you: to pack, payment not confirmed, return requested, ready | Order statuses exist; returns go through refunds (0128) | Build from real statuses |
| Smart Setup: products drafted from photos, prices from POS, publish locked until priced | Not built: no photo-to-product drafting, no photo storage flow | Decision 4 |
| Orders: list by state, order detail with progress, honest payment state | Order list and statuses exist (`advance_shop_order`); payment is "pay on the day" | Restyle, plus decision 2 |
| Customer: pay an invoice with MoMo, approve on phone, paid | The invoice link page exists (`/d/[token]`); no online payment | Restyle; paying waits for Paystack |
| Customer: storefront with Verified label, search, categories, cart, returns line, Report | Storefront, basket and checkout exist (`/s/[slug]`); Report exists; a business has `identity_verification`; no return policy setting | Restyle; Verified only when verified |
| Customer: book a service with a deposit, booked | Booking flow exists (`/b/[slug]`); deposits need online payment | Restyle; paying waits for Paystack |

### Found while reading

**A shop order paid on the day is never recorded as paid.** Checkout says "you pay nothing now", and money changes hands at pickup or delivery. But nothing records that money, and the commerce core counts a confirmed or fulfilled order as owed until a payment says otherwise. So every pay-on-the-day order stays in "Owe you" (Customers, Money, Home) after the customer has paid. This is the same gap Documents had before 0140, and bookings have it too.

### Steps

| Step | What | Exit gate |
|---|---|---|
| **M6a Shop for the business** | Shop tabs: Overview, Orders (moves in from Sell), Products. Overview with real figures, Selling now, Discover, Waiting for you. Orders as list and order page with progress and honest payment state. **Migration 0141**: record a payment against a shop order or a booking at handover (cash, MoMo to the merchant, transfer), as 0140 does for invoices | A real order taken to fulfilled and paid, leaving "Owe you" |
| **M6b The customer's phone** | Restyle the storefront, the invoice page and the booking flow to the phone design: Verified label only for a verified business, search and categories, the cart bar, Report kept. Payment screens show what is true today (pay on the day, or how to pay the business) until Paystack | Each page at 375px against the design, with a real business |

### Decisions for Collins

1. **Order.** *Recommended:* M6a, then M6b.
2. **Recording payment at handover (migration 0141).** *Recommended:* yes, for shop orders and bookings, so pay-on-the-day money stops showing as owed, with a receipt each time.
3. **The visit-to-paid funnel.** *Recommended:* leave it off for now, and show the honest parts (orders placed, confirmed, paid). Counting storefront visits and product views needs a small new table and a tracker on the customer pages; it can be its own step if you want it.
4. **Smart Setup from photos.** *Recommended:* not in M6. It needs photo upload and an AI step that drafts products for the owner to check (Claude API), which is a product of its own. M6 keeps the rule the design shows that Ascend already follows: nothing goes on the Shop without a price. "Use prices from POS" applies already, since Shop and the till share one catalogue.
5. **Customer payment screens.** *Recommended:* restyle them now, but show only what works today. "Pay GHS 2,400" with MoMo and the approve-on-your-phone screen come with Paystack.

Collins approved decisions 1 to 5 as recommended on 26 November 2026.

### M6a Shop for the business (done, 26 November 2026; 0141 run on live)

- **Shop has tabs:** Overview (`/shop`), Orders (`/orders`, now folded into Shop in the sidebar, with Shop taking its place among the phone's tabs and its waiting badge), and Products.
- **Overview:** live or not, "Pay on the day" (true until online payments), "Verified business" only for a business whose identity Ascend has verified; the shop address, products on it, places; four figures from orders and payments (Shop sales over 30 days against the 30 before, orders accepted and waiting, paid in 30 days and what is still to collect, repeat buyers); Selling now with low and out of stock where stock is counted; Waiting for you (to confirm, to pack, ready for pickup, out for delivery, handed over but not recorded as paid); Discover (people who came from Discover in 30 days, and Promote).
- **Orders:** each order shows where its money stands ("Pay on the day", "Part paid", "Paid", "Handed over, not paid"), a filter for handed over but not paid, and a link to its page. The order page: lines, delivery, total, the honest payment line, how it is going (from its own events and payments), the money with "Record what they paid", the next step, and the customer.
- **Migration 0141** (`0141_payment_on_the_day.sql`): `record_order_payment` records money taken on the day against a shop order or a booking, as 0140 does for invoices: a confirmed, `merchant_declared` payment that makes its receipt and stops counting as owed. Needs `orders.manage` or `bookings.manage`. Refuses more than is left, an order not yet confirmed or cancelled, a booking not yet accepted, a pay link method, a future date, another business's record and a repeated tap. Route `payments/record`. Tested locally: 21 of 21, including the commerce core showing nothing outstanding once an order is paid. The booking page offers it too.

Tested on live before 0141 with a throwaway ZZ shop (three orders placed through the storefront's own route: one collected and unpaid, one confirmed, one waiting, one for delivery): 17 of 17, and in the browser at 1440px and 375px with no horizontal scroll. After 0141 ran: 24 of 24, adding GHS 100 by MoMo with its receipt on a collected order, more than is left refused with the amount left, an unconfirmed order refused, the rest in cash to paid, the order page and the overview following, and the customer's "Owe you" dropping to the one order still unpaid. A booking's GHS 455 balance after a GHS 195 deposit was also recorded through the same route, with its receipt.

### M6b The customer's phone (done, 26 November 2026; no migration)

The three customer pages already followed the v3 design closely (the booking flow, the storefront with its cart bar, search, categories and Report, and the invoice link page), so M6b closes the gaps with the phone design rather than rebuilding them.

- **Storefront** (`/s/[slug]`): "Verified business" beside the name, and "Checked by Ascend" in Who you are buying from, only when `business.identity_verification` is `verified`; where they trade (each place by name when there is more than one); a "Book a service" chip to the booking page when the business offers services with a price; "Best seller" on the product that sold most in 30 days, once it has sold at least 3.
- **Invoice page** (`/d/[token]`): the phone design's order. Who it is from (Verified only when verified), the invoice number and Part paid or Paid in full, the balance to pay large with the due date and who it is for, the lines with "Already paid" and "Credited", "See the full invoice" for every line, Paid so far (each payment with its method, date and receipt), and How to pay. **The online Pay button shows only when a Paystack key is configured** (`PAYSTACK_SECRET_KEY`); until then the page says to pay the business directly, with "Ask … how to pay" on WhatsApp when the business has a phone on its document branding. It never shows a button that cannot work.
- **Booking flow** (`/b/[slug]`): unchanged. It already shows price, time, deposit and what is left to pay after, and says plainly that the deposit holds the slot and is settled with the business. The design's "Pay GHS 195 and book" and the MoMo approval screens come with Paystack.

Checked with a throwaway ZZ business at 375px (storefront, invoice part-paid, booking), no horizontal scroll; the Verified label appeared only after the business was marked verified, and went when it was set back. ZZ data removed.

**Still on the list from M6:** the visit-to-paid funnel (decision 3), Smart Setup from photos (decision 4), and online payment screens (Paystack).


---

## 7. Round 2: the improved designs (plan, 26 November 2026, for Collins to approve)

Source: the Claude Design project, now on claude.ai (`AscendSME Mobile App Design`, 32 pages). Compared page by page with what M1 to M6 were built from: **Office, CRM and Services are unchanged.** What is new:

- **Documents** gains two screens: **New document** (index 04) and **How documents look** (index 05).
- **Shop, customer side** (index 19 to 32) is new: storefront, search and filters, product page, cart, guest checkout, waiting for payment, confirmed, order tracking, report a problem, and the same on a laptop.

Paystack stays on hold, so every screen that takes money online (pay link, deposit at checkout, "Approve on your phone", "Paid. Order confirmed.") is shown as it can work today: order now and pay on the day, or pay the business directly.

### Documents: New document

| Design | Ascend today | |
|---|---|---|
| Pick the type: quotation, invoice, proforma, receipt, purchase order, delivery note, credit note | Creates quotation, proforma, invoice, receipt and purchase order; credit notes come from an invoice; delivery notes cannot be created yet | Build the five; credit note from its invoice; delivery note is decision 3 |
| Start from blank, a till sale, a booking, a Shop order, or a copy of a past document | Only blank, and quotation to invoice | Build: the customer and items fill in from what is picked |
| The customer from CRM, with Change | A name and phone typed in | Build a picker over the customer list, with add new |
| Items from the catalogue with quantity steps, often added, prices editable for this document | Catalogue search and lines exist | Restyle as the design |
| Dates and terms, a note on the document | Due date exists; valid until for quotations exists | Build |
| Getting paid: pay link and QR, a 30% deposit, automatic reminders | Reminders exist (weekly while overdue); pay links and deposits need Paystack | Show reminders; the other two wait |
| A live preview of what the customer receives, in the chosen look | No preview | Build, from the same look the PDF uses |
| Send by WhatsApp, email, SMS link or PDF only | Ascend's WhatsApp waits for Meta; email exists; "Send it from your WhatsApp" exists | Build with what works |

### Documents: How documents look

| Design | Ascend today | |
|---|---|---|
| Templates: Classic, Modern, Compact | One look | Build the three, on screen and in the PDF |
| Logo and brand colour | Accent colour exists; no logo | Logo needs an upload (the product photo upload is the pattern) |
| Business details: name and address, phone and email, TIN, pay link and QR | Name, address and phone exist; no TIN field | Add TIN; pay link waits |
| Numbering: prefix per type, next number, add the year | Fixed prefixes with the year (INV-2026-0001), never repeating | Decision 4 |
| Default terms, signature areas on POs, delivery notes and agreements | A footer note exists | Build |
| Free and Documents Plus side by side, with Plus features locked | Documents Plus is not priced or switched on anywhere | Decision 2 |
| Samples: invoice, quotation, receipt (A4 and 80mm), PO, delivery note | PDFs exist for issued documents | Build the samples from the same renderer |

### Shop, customer side

| Design | Ascend today | |
|---|---|---|
| Storefront: verified, where they are, pickup and delivery up front, a promotion, bestsellers, bookable services, trust lines, Report | Storefront with verified (M6b), best seller, Book a service, search, categories, Report | Add pickup and delivery facts, a services row, trust lines; the promotion is decision 5 |
| Pickup "ready in 2 hours", delivery "same day, GHS 30", order before 3pm, returns within 7 days | None of these is a setting today, and checkout never adds a delivery fee | Decision 1 |
| Search and filters: sort, price range, in stock, pickup or delivery today | Search and categories | Build sort, price and in stock; "today" follows decision 1 |
| Product page: sizes, quantity, stock left, fulfilment and returns, who sells it, Report | Product page with stock left | Add the rest; sizes are decision 6 |
| Cart: quantities, "goes well with", checkout as a guest | Basket exists | Add suggestions from what is bought together |
| Guest checkout: pickup place or delivery with GhanaPost GPS, name and phone, an unticked offers opt-in, pay | Pickup or delivery address, name and phone | Add the place to pick up from, GPS or landmark, the opt-in; paying waits |
| Waiting for payment, confirmed | Order placed, confirmed on WhatsApp | Keep "pay on the day" until Paystack |
| Order tracking: paid, packed, ready or out for delivery, the rider, the receipt, report a problem | Not built: a customer cannot see their order after placing it | Build a private order link |
| Report a problem with photos; the shop sees it first, Ascend after 48 hours | Report exists, without photos or the 48-hour rule | Decision 7 |
| Desktop storefront, product page, checkout and confirmation | The storefront is responsive | Adjust to the desktop design |

### Steps

| Step | What | Needs a migration |
|---|---|---|
| **R1 New document** | The full page: type, start from, customer picker, catalogue items, dates and note, live preview, send | No (delivery notes: decision 3) |
| **R2 How documents look** | Templates, logo, colour, details with TIN, numbering, terms, signature areas, samples, and the PDF following the look | Yes: the look's settings, TIN, maybe numbering |
| **R3 Shop settings for the customer side** | Pickup ready time, delivery areas and fee, order cut-off, returns policy, contact line; checkout adds the delivery fee | Yes |
| **R4 The customer's shop** | Storefront facts, search filters, product page, cart suggestions, checkout with pickup place, GPS and opt-in, desktop layouts | No, after R3 |
| **R5 Order tracking and reporting** | A private link to the order (steps, what was paid, the receipt), report with photos and the 48-hour rule | Yes |

### Decisions for Collins

1. **Shop delivery and pickup settings (R3).** *Recommended:* yes. The design's "Free pickup, ready in 2 hours" and "Accra delivery, same day, GHS 30" need the shop to set them, and today a delivery order is charged no delivery fee at all. Set per shop: pickup ready time, delivery areas with a fee each, the cut-off time, and a returns policy line.
2. **Documents Plus.** It is drawn as a paid step (templates, logo, colour, numbering, terms, signatures) but has no price and no way to switch it on. *Recommended:* build the look settings for everyone now, with the Classic template and business details free, and mark the rest "Documents Plus" only once you give it a price. Or tell me the price and I gate it now.
3. **Delivery notes.** *Recommended:* yes, made from an invoice or a Shop order, with ordered and delivered quantities and signature areas, no prices (as drawn).
4. **Numbering.** *Recommended:* let a business choose the prefix (INV-, QUO-, RCT-) and whether the year is shown, keeping the never repeat, never skip rule. Changing the next number by hand stays off: a gap is a red flag in the evidence.
5. **The storefront promotion banner** ("December bridal: free wash with any bridal booking"). There is no shop promotion today. *Recommended:* a simple banner the owner writes (headline, one line, a link to a service or product), built in R3.
6. **Sizes on the product page.** The catalogue has variants underneath, but the storefront does not sell them. *Recommended:* add choosing a variant (size) to the product page, cart and order, since a shop with sizes cannot sell properly without it.
7. **Report with photos and the 48-hour rule.** *Recommended:* yes. Photos through the same upload as product photos; the shop is told first, and the report reaches Ascend's risk desk if it is still open after 48 hours.
8. **Order.** *Recommended:* R1, R2, R3, R4, R5.

Approved by Collins on 26 November 2026, all eight as recommended.

### R1 New document (done, 26 November 2026; no migration)

- `/documents/new` (`components/documents/NewDocument.tsx`, `lib/documents/new.ts`): the seven kinds; start from a till sale, a booking, a Shop order or a copy of a past document, which fills in the customer and lines; a customer picker over the customer list with add new (suppliers for a purchase order); catalogue lines with quantity steps, editable prices and "Often added"; dates and a note; "Getting paid" with reminders on and the pay link and deposit marked as coming with online payments; a live preview in the Classic look; send by WhatsApp, email or PDF only.
- What a start links: an invoice, proforma or receipt started from a sale, order or booking joins that transaction (no second debt); a quotation or purchase order does not; a copy carries no link. Every id is checked against the business.
- Delivery notes (decision 3): made from a sent invoice or a Shop order only; quantities, no prices; PDF prints "Deliver to", ordered and delivered, and "Delivered by" and "Received by customer" lines. Purchase orders print "Deliver by" and "Authorised by" and "Received by supplier".
- Credit notes still start from their invoice ("Give money back"); the page lists sent invoices to open.
- "PDF only" issues without sending anything (`issueDocument` takes the channels).
- Old `/documents?new=` links redirect in `next.config.mjs` (a redirect inside the streamed list page would arrive as a 200). The inline create form on the documents list is gone.
- Tested on live with throwaway ZZ businesses (25 checks), at 1440 and 375, then removed.

### R2 How documents look (done, 26 November 2026; 0142 run on live)

- `/documents/look` (`components/documents/LookEditor.tsx`, `lib/documents/look.ts`): Classic, Modern and Compact; a logo (turned into a JPEG on white in the browser, so the PDF carries it as it is); five colours that each carry white text, or none; name, address, phone, email and TIN on the letterhead; a prefix per kind and whether the year shows, with the next number beside each; default terms; signature areas on or off. A live preview of six kinds of document in the business's own look and catalogue, and a sample PDF (`/api/documents/sample`).
- The PDF draws all three templates (`lib/documents/pdf.ts`), and the New document preview uses the same component (`components/documents/DocumentPreview.tsx`).
- Decision 2: built for everyone, nothing locked. Documents Plus is marked once it has a price.
- **0142**: the settings on `document_branding`; `next_document_number` takes the business's prefix (2 to 6 capitals only) and year choice, never repeating (without the year the count runs on in a series of its own) and never asking for a number by hand; the stamp at issue now keeps the note written on the document. Before 0142 the stamp replaced it, which dropped R1's note on businesses with a saved look (seen on live).
- Until 0142 runs, the page says so and saves only name, address, phone, email, colour and terms.
- The small "How your documents look" panel on the documents list is replaced by a card that opens the page.
- Tested: PGlite 16/16 (0142 applied twice); the three templates rendered and checked by eye; live before 0142, 13 checks; after 0142, 8 more on live (logo upload, Modern PDF with TIN, prefix on a real invoice, the no-year series, signatures off, the note kept), then removed with the test logo.

### R3 Shop settings for the customer side (done, 26 November 2026; 0143 run on live)

- Shop gets a Settings tab (`/shop/settings`, `components/shop/ShopSettingsForm.tsx`), with a live "What customers see" beside it:
  - Pickup: on or off, and the ready time.
  - Delivery: on or off, areas with a fee each, the same-day cut-off, who delivers.
  - Returns (days and a line), and how customers reach the shop.
  - The promotion (decision 5): a headline, one line, an optional link to a product or a service (booking), and an end date.
- **0143**: `shop_settings`, one row per business, and `place_shop_order` checks how the order is fulfilled and adds the area's fee. The server sets the fee, never the browser. A shop with no settings keeps what it had: both offered, no fee. The fee reaches the commerce core (`charges_total`) and the receipt as a Delivery line, as 0083 and 0052 already handled.
- Storefront: the pickup and delivery promises under the intro, the promotion, and the side column's returns and contact (`lib/shop/settings.ts` holds the wording). Checkout asks which area, shows its fee and adds it to the total; with no areas listed the cost is still agreed on WhatsApp. The order page already showed a delivery fee.
- Tested: PGlite 17/17 (0143 applied twice; the fee in the commerce core, the payment settling it, the receipt line); live before 0143, 5 checks that nothing changed; after 0143, 20 on live (saving and refusals, what the storefront says, GHS 45.50 to Tema on a real order, an unlisted area refused, the fee taken from the shop, pickup off refused), then removed.

### R4 The customer's shop (done, 26 November 2026; 0144 run on live)

The plan said R4 needed no migration. It needs a small one: an order could not carry a size, a pickup place or the offers opt-in.

- **Sizes (decision 6)**: the owner adds sizes to a product in the product editor, each with an extra price (`set_item_variants`, 0144). The storefront shows "from" prices, the product page asks for a size, the basket keeps each size as its own line, and the order names it ("Shea butter hair mask, 500ml"). Sizes share the product's stock; counting each size separately is an Inventory change of its own, not built.
- **Product page**: size, quantity, stock left, how it reaches you and returns (R3 settings), who sells it, Report, and "Goes well with".
- **Search filters**: sort (popular, price both ways, newest), price ceilings that split the shop's own list, in stock. "Get it today" is said by the R3 promises rather than filtered.
- **Basket**: sizes, "Goes well with" from what the shop's customers bought together over 90 days, and the delivery line from the settings.
- **Checkout**: where to collect when the shop has more than one place (the order and its stock belong to that place, 0144); GhanaPost GPS, checked and tidied to GA-123-4567; "Send me offers on WhatsApp", unticked, recorded through `record_consent` with the order as evidence when ticked.
- **Storefront**: a "Book with us" row of services with duration and deposit, and trust lines from facts Ascend holds.
- **Laptop layouts**: product page, basket and checkout in two columns.
- Tested: PGlite 20/20 (0144 applied twice); live before 0144, 7 checks; the flow clicked through at 375 and 1440; after 0144, 18 on live (sizes saved and refused twice, two sizes on one order at GHS 365, the size on the order page, pickup at the second place, consent only when ticked), and picking a size clicked through, then removed.
