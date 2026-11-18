# Moving AscendSME onto the v3 design

18 November 2026. For Collins to approve before anything is built.

Source: the Claude Design project exported to `Downloads\AscendSME_design_v3` (the design system `_ds/ascendsme-design-system-7aa26871…`, and the screens below). Inventory Core (`INVENTORY_CORE_PLAN.md`) is on hold while this is decided.

The short version: the codebase has already been through one redesign without rewriting its screens, because every screen asks for colours by name (`teal`, `ink`, `canvas`) and the names stayed put while their values changed. The v3 design can arrive the same way for colour, type and shape. Its **structure** (the sidebar, the page layouts, the till flows, the "turn on" flows) is real work, screen by screen, and is where the time goes.

---

## 1. What the design is

| Design file | What it shows | Size |
|---|---|---|
| `Ascend Business Web` (+ `Business Web Canvas`) | The business's web app at 1440px: left sidebar, Home, Sales, Products, Inventory, Customers, Money, Documents, Team, Reports, Devices, Plan and billing, a "turn on" flow for each product, onboarding. Four kinds of business (starter on a phone, Smart POS, multi-shop, services) and two roles (owner, accountant) | 138 KB |
| `Ascend Business Phone` | The same business on the owner's phone: Home, notifications, insights (sales, money, stock, customers), approvals, alerts, work, grow. Owner and manager | 84 KB |
| `Ascend Counter Register` (+ `Counter POS` canvas) | The big-screen till: sell, customer, discount, manager override, cash, MoMo, QR and card, done, sales, returns, shift, lock, and the customer-facing display. Online and offline | 118 KB |
| `Ascend Smart Terminal` (+ `Smart POS` canvas) | The handheld till: setup by code, sign-in, sell, keypad, scan, cart, discount, the four ways to pay, done, sales, shift, device | 90 KB |
| `Ascend Discover App` / `Discover Web` (+ `Discover` canvas) | Customer discovery on phone and desktop: home, search, a business, its reviews, a product, labels, "why am I seeing this", report, order, saved | 51 + 54 KB |
| `Promote with Ascend` | A business promoting itself on Discover: overview, a four-step campaign, submitted, the campaign, listings, appeal | 60 KB |
| `Ascend Control Center` | BVM's own desk: overview, merchant lifecycle, revenue, merchant success, field and commercial, support and audit, and identity and risk checks | 92 KB |
| `AscendSME Website Home v3` | The public website | 64 KB |
| `AscendSME Mobile App`, `Website Signed In` | Onboarding on the phone by kind of business, and the signed-in website | |

`Ascend Business Web App` is an empty file, and `Ascend Business App` is a small canvas; neither adds anything.

**The look** (design system tokens): teal `#00A99D` as the brand, deepening to `#006b62` and `#005f57` for labels and active states; soft teal tints (`#eefcf9`) for cards and chips; gold `#E8A020` for upgrades and warnings; blue `#185FA5` for information; deep navy `#0A0E1A` for dark grounds; neutral greys from `#F3F4F6` to `#111827`; app ground `#f4f5f7`. Headings in **Outfit** (600 to 800), body in **Inter** (400 to 600). Cards 16px round with a hairline teal-tinted border and a teal-tinted shadow; chips and badges as pills; icons in soft rounded tiles, Lucide style.

**The copy** in the screens already keeps BVM's rules: no em dashes anywhere, plain verbs ("Activate payments", "Open products", "Add photos with Smart Setup"). Two "Done" buttons in Discover are the only generic labels.

## 2. Where the codebase is

- **Tokens.** `tailwind.config.ts` holds the previous identity ("Ascend POS design direction"): navy `#0B1D2E`, teal `#0D8377`, ink `#102A43`, ground `#EFF4F8`, Hanken Grotesk and IBM Plex Mono, self-hosted through `next/font`. Every colour was checked to 4.5:1.
- **Screens.** 113 `.tsx` files across 39 pages. 33 files still carry 119 hard-coded colours (`[#EEF3F7]` and the like) that will not follow a token change; 9 use inline styles.
- **Shell.** `components/shell/` (`NavBar`, `WorkspaceNav`, `Page`) and `lib/nav/workspace.ts`: navigation is driven by what the business has switched on (capabilities), which is exactly how the design decides its sidebar per kind of business. The labels differ: today "What you sell", "Who buys from you", "Tills and team"; the design says Products, Customers, Devices.
- **Pages that map one to one:** `/dashboard` (Home), `/products`, `/customers`, `/documents`, `/team` and `/work`, `/devices`, `/billing` (Plan and billing), `/grow` (the "turn on" flows), `/pos` (both tills, one 971-line page), `/discover`, `/s/[slug]` (shop), `/b/[slug]` (booking), `/d/[token]` (invoice and receipt), `/promote`, `/admin/*` (Control Center), `/` (website), `/onboarding` and `/signin`.
- **Pages the design has and the codebase does not:** Sales (history and shifts as their own page), Money, Reports, Inventory.

## 3. What does not fit as drawn

1. **The brand teal fails contrast.** White text on `#00A99D` is **2.93:1**. BVM's rule is 4.5:1, and it even misses the 3:1 allowed for large text. The website's muted grey `#7A8594` is 3.74:1. The previous redesign hit the same problem and darkened the action colour slightly; the same fix works here (decision 1).
2. **It conflicts with CLAUDE.md section 4** in four places: Google fonts instead of the system stack; teal `#00A99D` instead of `#1D9E75`; pills, glows and frosted bars; floating and pulsing motion. Collins asked for the design's colours and fonts, so CLAUDE.md should change to match, or every future change will fight it (decision 3).
3. **The screens show things Ascend does not do yet.** Settlements and reconciliation (need Paystack, Phase 3), an accountant role (Ascend has owner, manager and cashier; accountants get read access through sharing), a location switcher (no business has two), a Reports page, an Inventory page (on hold), notifications, Control Center revenue and field analytics. And every screen is drawn with sample figures ("GHS 3,920.00", "Kwame's Minimart").
4. **The phone designs are app-shaped.** `Business Phone` and `Mobile App` are drawn as a native app. Ascend is one responsive web app; the phone designs become its phone-width layout.

## 4. The approach

Seven steps, each shippable on its own, each checked at 375px and 1440px before it moves on.

| Step | What | Exit gate |
|---|---|---|
| **D1 Foundations** | New values into the existing token names, plus the design's names alongside (`teal-500`, `neutral-200`, `gold-100`…) so screens can be written straight from the design. Outfit and Inter self-hosted through `next/font` in place of Hanken. Radius, teal-tinted shadows, the eyebrow style. The 119 hard-coded colours replaced with tokens. No layout changes | Every screen wears the new look with nothing moved; an automated contrast check over the token pairs passes 4.5:1; first-load weight within budget |
| **D2 Shell** | The design's sidebar on desktop (business card, nav, "More", the sync footer) and the bottom tabs on the phone; nav labels in the design's words; the attention list and toasts as shared components | Every signed-in page sits in the new shell; nav still follows capabilities |
| **D3 Business Web** | Page by page, in the order an owner opens them: Home, Products, Sales (new: history and shifts from the commerce core), Customers, Money (new: from the Financial Foundation, cash position and what is owed; settlements wait for Phase 3), Documents, Team and Work, Devices, Plan and billing, and the "turn on" flows on `/grow`, each showing the business's own figures as the design does | Each page matches its design at both widths with real data, and shows nothing it cannot back with data |
| **D4 Tills** | `/pos` split into the Counter (big screen) and Terminal (handheld) layouts from the two designs, sharing one engine: sell, customer, discount, override, the four ways to pay, done, returns, shift, lock, the customer display. Offline behaviour unchanged | A full sale, return and shift close on each layout, online and offline, on a real device |
| **D5 Customer-facing** | Discover (app and web), the shop, booking, invoice and receipt pages, Promote | Each page matches at both widths; the R4 report link and the shop's flows keep working |
| **D6 Website** | `/` rebuilt from Website Home v3, and the signed-in variant | Lighthouse mobile 90 or above; no stock layout patterns |
| **D7 Control Center** | The admin desks (Discover, Messaging, Risk) moved into the Control Center shell; overview and lifecycle figures from what Ascend records today; revenue, field and success modules when their data exists | Every existing desk works inside the new shell at phone width |

Rules that hold throughout:
- **No sample figures ship.** A section of the design with nothing real behind it is left out until the data exists, never filled with a placeholder number.
- **Behaviour does not change while the look does.** Every route, permission, offline path and error message stays as it is; a screen's flow changes only where the design asks for it, and then on its own, tested.
- **BVM's copy rules stay.** The two "Done" buttons become specific labels.
- **Deploys are batched.** D1 and D2 go together (the whole app changes look at once, so it should not ship half-dressed); D3 onward ship a few pages at a time.

## 5. Decisions for Collins

1. **The action teal.** *Recommended:* `#00A99D` stays the brand colour for the logo, the score ring, icons, tints and large figures. Buttons, links and teal text use **`#007A6F`**, the same hue a little deeper, which carries white at 5.2:1 and reads on the app ground at 4.8:1. Muted text uses `#646E7C` (5.2:1) instead of `#7A8594`. Side by side the difference is slight; on a phone in sunlight it is the difference between readable and not.
2. **Fonts.** *Recommended:* Outfit for headings and Inter for everything else, self-hosted through `next/font` (no request to Google from the customer's phone), limited to the weights the design uses: Outfit 600, 700 and 800, Inter 400, 500 and 600. Both are variable fonts, so that is roughly 70 to 100 KB in all, measured in D1, loaded once and cached. IBM Plex Mono stays for receipt numbers.
3. **CLAUDE.md section 4.** *Recommended:* update it to the v3 design: the new palette, Outfit and Inter self-hosted, 16px cards with pill chips, teal-tinted shadows. Keep its restraint where the design is restrained too: no floating or pulsing decoration in working screens (the website may keep its entrance animations), blur only on the phone's bottom bar, no gradients except the score and the website hero. The copy rules stay as they are. It is your file, so I will only change it with your yes.
4. **Navigation words.** *Recommended:* the design's plain nouns (Home, Sales, Products, Inventory, Customers, Money, Documents, Team, Reports, Devices, Plan and billing). They are shorter, they match the design, and a business owner looks for "Products", not "What you sell".
5. **Things the design shows that Ascend does not have.** *Recommended:* left out until built, never shown with sample data. Reports and Money are worth building during D3, from data Ascend already holds. Settlements wait for Phase 3; Inventory for its plan; the accountant view for a decision on whether accountants get a role or keep using sharing.
6. **Order.** *Recommended:* D1 and D2 first and together, then D3 (the business's own screens, where owners spend their day), D4 (the tills, the riskiest because of offline), then D5, D6 and D7. The website (D6) can move earlier if a launch or campaign needs it.
7. **The phone designs.** *Recommended:* built as the phone-width layout of the one web app, installable from the browser as it is today, not as a separate native app.

## 6. Build status

Decisions 1 to 7 approved by Collins, 18 November 2026. CLAUDE.md section 4 updated to the v3 colour system and type the same day.

**D1 built, 18 November 2026 (not deployed; ships with D2).**
- Every existing token name carries a v3 value (`tailwind.config.ts`), and the design's own scale sits alongside (`teal-500`, `neutral-200`, `gold-100`, `success`, `tier`…), mirrored as CSS variables in `app/globals.css`.
- Action teal `#007A6F`, brand teal `#00A99D` for marks only, muted text `#646E7C`. Ink on the brand teal is `#002B26` (5.2:1), darker than the design's teal-900, which read at 3.63.
- Outfit (headings and display sizes) and Inter (everything else) self-hosted through `next/font`; Hanken Grotesk removed. The preloaded Latin files are about 80 KB together.
- 16px cards, 12px controls, teal-tinted shadows; eyebrows in Inter at 0.18em instead of monospace.
- Hard-coded colours gone except WhatsApp's own green and merchant-chosen document colours. The repeated tile palettes now live in `lib/brand/tints.ts`; the till's category tints are redrawn from the design.
- `npm run check:contrast` reads the numeric tokens too: 113 files, 92 tokens, 0 failures. Production build passes.
- Checked in the browser at 375px and desktop on a throwaway business (dashboard, products) and on the website, a live shop and Discover. One bug found and fixed: a global heading colour turned the website's white headline on navy dark.

**D2 built, 18 November 2026 (not deployed; ships with D1).**
- The shell wraps every page now (`components/shell/NavBar.tsx`, from `WorkspaceNav` in the root layout) instead of sitting above it. From 1024px: the design's 248px sidebar, with the logo, the business card (initials, name, location), the destinations with icons, a "More" section, and the person and their role at the foot, which opens the switch-business and sign-out menu. Below 1024px: a slim top bar with the business, and a frosted row of four tabs plus More, with icons; More opens a sheet with the rest and the way out.
- The navigation speaks the design's words: Home, Sell, Orders, Bookings, Documents, Customers, Products, Shop, Team, Work, Promote, Investment readiness; under More, Service catalogue, Availability, Devices, Sharing, Add to your business, Plan and billing. Investment readiness stays in the main list, because the Sustainability Score is the point of Ascend, although the design leaves it out. Page headings now use the same words.
- The design's orange badge (white on `#FF7A00`, 2.61:1) is drawn in `#C2410C` (5.18:1).
- The logo is the design's wordmark, cropped and converted to WebP (9.5 KB, `public/brand/ascendsme-logo.webp`).
- Left out, as decision 5 says: the top bar's search, the location switcher, notifications and the sidebar's "synced with your phone" card, none of which Ascend has yet. The phone design's Insights and Action tabs wait for those pages.
- The attention list and toasts moved to D3: Home is the only user of the first, and nothing in the app uses the second yet.
- Checked at 1440px, 820px and 375px on a throwaway business; the till and public pages stay bare. Types, contrast (0 failures), authority and the production build pass.

**D3, Home built, 18 November 2026 (not deployed).** Migration 0116 (`commerce_home_figures`, read only) run on live by Collins; 9/9 locally and 8/8 on live, where today's bar equalled "Sales today" exactly with a sale from the day before reversed today.
- Greeting with the date and location and whether a till is open; "Open the till" beside it for till businesses.
- Today's figures: sales, money received, owed, and low stock for a business that counts stock (customers otherwise).
- The setup steps until the first sale. Left: sales over 14 days (every channel, after refunds) with top products and how customers paid (before refunds: money handed back is recorded as an adjustment, not against a method); the tills and phones selling now; the latest five sales, older ones with their date. Right: the shared attention list (`components/shell/AttentionList.tsx`, now also out-of-stock products), quick actions by capability, Ascend Balance with money on its way, the Sustainability Score card.
- The navy gradient hero is gone. Without 0116 or devices, the right column takes the full width.
- Checked at 1440px and 375px with real sales on a throwaway business.
- Found, not changed: "Money received today" counts cash handed back by a till reversal as still received (the reversal is not a refund adjustment). Left for Collins to decide, because it changes a figure owners already read.

**0117, 18 November 2026.** "Money received today" now takes off cash handed back by till reversals, by the Financial Foundation's refund_paid rule; `commerce_dashboard_figures` is locked to the server (it had never been revoked from the public key). 6/6 locally, 4/4 on live. Found, not fixed: the Financial Foundation records the credit part of a till sale as money received (affects cash position, exports and the partner report), waiting on Collins.

**D3, Products built, 18 November 2026.** The shared page frame takes the v3 shape for every page; Products shows the design's table from 1024px.

**D3, Sales built, 18 November 2026.** New page `/sales` (`sales.view`: owners and managers), in the nav after Sell for any business that sells. Today, the last 7 days and the average sale (by the dashboard's rules, 0116); every sale from the till, shop, bookings and invoices, newest first, latest 100, filtered by channel, with receipt, till, cashier, items and how it was paid (MoMo confirmed or not, on credit, not paid yet, reversed). A Shifts tab for till businesses: expected cash, counted, and the difference, red when short or over with no explanation, gold when explained. On the phone, Sales takes the third tab and Products moves under More for a till business. No migration.

**D3, Money built, 18 November 2026.** New page `/money` (`payments.view`: owners, managers, accountants), in the nav after Customers. The first screen to read the Financial Foundation: cash recorded by the business (cash in, handed back, paid out; MoMo or card it entered is said beside it, not added in), money a provider confirmed, money waiting to be paid out (only once the business takes payments online), and money owed; kept apart, with the Foundation's own notes and no profit figure. This month or either of the two before. Tabs: every movement of money in the month (cash basis, latest 100), and who owes what by aging bucket. Office expenses shown on their own when there are any. No migration (0118 fixes the credit figure underneath).

**D3, Customers built, 18 November 2026.** The design's table from 1024px (customer with initials, phone as people say it, visits, spent, owes you, last seen) and a card each on the phone with what they owe under their name; search with an icon; filters Everyone, Owe you, Agreed to offers, Not seen in 90 days. New: "Add a customer" for owners and managers (`POST /api/customers`, customers.manage), through `find_or_create_customer`, so a number or email already on the list is the same person, and the owner is told so. History and the consent switch unchanged. Fixed on the way: "last seen" for someone with no activity read as 1 January 1970 (business_customers answers "never" with the epoch); Home's "Add a customer" quick action now lands somewhere that can do it.

**D3, Documents built, 18 November 2026.** Figures at the top: owed on invoices and overdue, from the Financial Foundation (after payments and credits; the old banner added invoices up at face value, so a part-paid or credited invoice counted in full), and drafts. Search with "New quotation" and "New invoice" beside it. The design's table from 1024px: number, who, issued, due, a status chip ("12 days overdue" in gold, over 30 in red, "Part paid, GHS X to go", Sent, Seen by them, Paid, Draft), amount; each row's actions (send it out, the PDF, conversions, give money back) underneath, unchanged. The creator keeps every behaviour in the design's inputs. Filters with counts through the shared pills. No migration.

**D3, Team and Work, 18 November 2026.** Team shows the design's table from 1024px (person with initials, role and what it lets them do, phone as people say it, status, actions) with role changes and removal underneath each row. Work, Shop, Sharing and Add to your business now sit in the shared page frame instead of their own white header bars. One mapping from the old business-side class patterns to v3 (buttons, inputs, cards, messages, section labels) applied across the Business Web components (107 lines in 20 files), leaving the tills, public pages and admin to D4, D5 and D7. Busy labels in Work say what they are doing ("Checking you in...", "Marking it done...").
- Fixed: Team's "Add someone" offered Staff (the default) and Accountant, which `add_team_member` (0077) refuses, so adding someone without changing the role failed. It now offers Cashier and Manager, Cashier first. Open question for Collins: staff and accountants cannot be added from any screen today.
