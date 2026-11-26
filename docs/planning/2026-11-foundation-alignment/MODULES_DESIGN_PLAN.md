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
