# Phase 1 Plan: Identity and Authority, enforced

**Prepared:** 14 Nov 2026, against `main` at `db06263` (migrations through 0073 applied)
**Source:** `Platform Foundation Specification/01_Identity_Tenancy_Authority_Specification_v1.0.md`, and the Phase 1 section of `FOUNDATION_ALIGNMENT.md`
**Status:** Approved by Collins on 14 Nov 2026, with every recommendation in section 8 accepted: the role matrix in 3.4 as proposed, one week of shadow mode (or until the log and the matrix test agree, whichever is longer), step-up for the four actions in 3.9 with a fresh OTP within 10 minutes, enforcement in the application and high-risk database functions rather than RLS, and business status limited to active, suspended and closed.

---

## Build status (15 Nov 2026)

All six steps are built and tested. What remains is deploying and switching on.

| Step | Status | Where |
|---|---|---|
| 1a Permission catalogue and role matrix | Live | 0074, 0076 (accountants gain tasks.own and attendance.own) |
| 1b One check on every route and page, shadow mode | Built | lib/authority, 0075; shadow week starts at deploy |
| 1c Enforcement per route group | Built and tested, all 7 groups off | AUTHORITY_ENFORCE (office, services, shop, documents, catalogue, team, growth) |
| 1d High-risk actions checked in the database, automatic audit | Live except 0079 | 0077, 0078 live; **0079 runs after the deploy** |
| 1e Expiry, location scope, delegation | Live | 0080 and app changes |
| 1f Business status, step-up | Live | 0081 and app changes; step-up applies to sharing now, and to payouts, ownership transfer and export when they are built |

Additions decided along the way: a manager cannot add, remove or reset the PIN of another manager (target-role rule); staff act only on bookings and orders assigned to them; a manager can set their own PIN.

## 1. What Phase 1 is for

The spec's rule is short: *authority is explicit, contextual, revocable and auditable; authentication does not equal authorization.* Today the platform authenticates well (WhatsApp OTP, server-side sessions, device tokens) and then mostly stops. Who may do what is decided route by route, by hand.

Phase 1 makes one answer to "may this person do this, here, now?" and makes every route and every high-risk database function ask it. Everything after it relies on it. The commerce core, payments, CRM, Finance and Control Center all need a trustworthy actor and permission check, and none of them should each invent their own.

**Exit gate for the whole phase:** a route or high-risk function that does not go through the authority check fails a test, and a test matrix of every route against every role passes.

---

## 2. Where things stand (measured 14 Nov 2026)

| Area | Today |
|---|---|
| API routes | 43 route files. 13 check session plus membership only. 11 check a role by name. 2 check a capability. The rest are public by design (sign-in, storefront orders, bookings, slots, Discover clicks), webhooks with a shared token, device-token routes (`pos/*`), cron, or platform admin. |
| Role checks | Hand-written role names: `roleKey !== "owner"` (10 places), `roleKey !== "manager"` (9), and two more. No route reads a permission. |
| Stored permissions | `role.permissions` is a small jsonb list per role template: owner `["*"]`, manager 7 keys, cashier 5, accountant 4, staff 3. Nothing reads it, and the keys do not match the spec's permission list. |
| Membership | Has `expires_at` and `location_scope`. **Neither is enforced anywhere**: an expired membership still works, and a location-limited member sees every location. |
| Business id | 14 of 43 routes take the business id from the request body, then check the caller is a member of it. That is correct today, but it is 14 separate implementations of the same check. |
| Pages | 20 use the shared resolver (`currentWorkspace` / `activeMembership`). Capability gates on the server exist for Services, Shop and Office only (alignment item 11). |
| Delegation | `delegated_authority` table exists with 0 rows and 0 readers. Its shape (one `authority_key`, a money limit) is narrower than the spec's (grantor, grantee, scope, purpose, start, expiry, revocation). |
| Audit | `audit_log` has actor, action, entity, detail. No reason, before, after or authorization source. Append-only since 0072. |
| Business lifecycle | `business` has no status. A business cannot be suspended or closed. |
| Tenant isolation | RLS is enabled on 32 tables but keyed on `auth.uid()`, which the custom sessions never set, and the app uses the service role, which bypasses RLS. Isolation depends on every route scoping by business. |
| Platform admin | One `platform_admin` table and `lib/auth/admin.ts`; 0 rows live. |
| Live data | 31 owners, 2 cashiers, 0 delegations, 0 admins. Retrofit cost is the lowest it will ever be. |

---

## 3. The design

### 3.1 One authority context per request

A single server-side function resolves, once per request:

- **who**: person, and how they authenticated (session, device and PIN, or public)
- **where**: business and membership, with membership status, expiry and location scope applied
- **what they may do**: their effective permissions (role permissions, plus any live delegation)
- **what the business has**: its capabilities (the 0069 entitlement rule)
- **the business's state**: active, suspended or closed

Routes stop finding the business and membership themselves. The 14 body-supplied business ids go through it, so the membership check exists once.

### 3.2 One check, two places

- **Routes:** `withAuthority(handler, { permission, capability })` wraps every API route. A route that is public says so explicitly (`public: true`) so that "forgot to check" and "meant to be open" can be told apart. A test fails if a route file exports a handler that is not wrapped.
- **Pages:** `requireAccess({ capability, permission })` replaces the per-page redirects, and covers the 11 nav-only screens from alignment item 11 in the same change.
- **Database, for high-risk actions only:** refund approval, settlement and payout changes, role and ownership changes, price changes, data export and external access grants. Those functions take the actor's membership and call `has_permission(membership, key)` themselves, so they hold even if a route is wrong. Everything else is enforced at the route, because the service role means the database cannot otherwise know who is asking.

### 3.3 Permissions as a catalogue, not loose strings

- A `permission` table: key, description, risk level (low, medium, high), and the owning domain.
- `role.permissions` stays a list of keys, so the current schema and the per-business role copies keep working, but every key must exist in the catalogue (enforced by a check), and the existing keys are migrated to catalogue keys.
- `membership_permissions(membership)` in SQL returns the effective set. It is the one definition, used by both the TypeScript wrapper and the high-risk SQL functions. It applies membership status and expiry, and adds live delegations.

### 3.4 Starting permission set and role matrix (proposal)

Taken from the spec's list (section 6) and what the product does today. **This is the main thing to check in section 8.**

| Permission | Risk | Owner | Manager | Cashier | Accountant | Staff |
|---|---|:-:|:-:|:-:|:-:|:-:|
| sales.create | low | ✓ | ✓ | ✓ | | |
| sales.view | low | ✓ | ✓ | own shift | ✓ | |
| refunds.request | medium | ✓ | ✓ | ✓ | | |
| refunds.approve | high | ✓ | ✓ | | | |
| shifts.open_close | low | ✓ | ✓ | ✓ | | |
| shifts.review | medium | ✓ | ✓ | | ✓ | |
| catalogue.manage | medium | ✓ | ✓ | | | |
| prices.change | high | ✓ | ✓ | | | |
| inventory.manage | medium | ✓ | ✓ | | | |
| orders.manage | low | ✓ | ✓ | | | assigned |
| bookings.manage | low | ✓ | ✓ | | | assigned |
| documents.create | low | ✓ | ✓ | | ✓ | |
| documents.view | low | ✓ | ✓ | | ✓ | |
| payments.view | medium | ✓ | ✓ | | ✓ | |
| settlement.view | medium | ✓ | | | ✓ | |
| settlement.change_destination | high | ✓ | | | | |
| staff.manage | high | ✓ | ✓ (not managers or owner) | | | |
| roles.change | high | ✓ | | | | |
| approvals.decide | medium | ✓ | ✓ | | | |
| tasks.own | low | ✓ | ✓ | ✓ | ✓ | ✓ |
| attendance.own | low | ✓ | ✓ | ✓ | ✓ | ✓ |
| reports.view | medium | ✓ | ✓ (their locations) | | ✓ | |
| data.export | high | ✓ | | | ✓ | |
| campaigns.send | medium | ✓ | ✓ | | | |
| external_access.authorize | high | ✓ | | | | |
| business.settings | high | ✓ | | | | |

Amended 14 Nov 2026 (migration 0076): accountants also hold tasks.own and attendance.own, decided by Collins after the step 1b run showed accountants check in today.

"Own shift", "assigned" and "their locations" are contextual policies on top of the permission (spec section 6: RBAC with contextual checks). They are applied in the resolver using membership location scope and the record's assignment.

The spec's other roles (Admin, Sales Staff, Service Staff, Inventory Manager, Viewer, Setup Operator, External Accountant) become new role templates built from the same catalogue when a product needs them. Setup Operator arrives with delegation (3.6).

### 3.5 Membership rules made real

- `expires_at` in the past means no access.
- `location_scope`, when set, limits location-scoped data and actions to those locations.
- Both applied in the resolver and in `membership_permissions`, so neither TypeScript nor SQL can skip them.

### 3.6 Delegation in the spec's shape

`delegated_authority` is reshaped (it has no rows, so this costs nothing) to record grantor, grantee (person, membership or external actor), scope (a list of permission keys), purpose, starts_at, expires_at, revoked_at, and how it was approved (OTP, QR, in-app). Live delegations feed `membership_permissions`. The Setup Operator flow (spec section 10) is built on it, but the full flow can follow in Phase 1b if needed.

### 3.7 Audit to the spec's standard

`audit_log` gains reason, before, after and authorization_source (role, delegation, platform override). One `record_audit()` function writes it. The route wrapper writes an audit row automatically for every **high-risk** permission it allows, so high-risk actions are audited without each route remembering to.

### 3.8 Business lifecycle, minimum

`business.status` with `active` (default), `suspended`, `closed`. A suspended or closed business can read and export its history (PRI-004) but cannot write. The full spec list (draft, dormant, merged, transferred, archived) waits until a product needs it.

### 3.9 Step-up for the highest-risk actions

For `settlement.change_destination`, `roles.change` to owner, `data.export` and `external_access.authorize`: require an OTP verified in the last N minutes. The resolver exposes how recently the person verified, so the check is one line per action.

---

## 4. Sequence, with exit gates

Each step leaves the product working. **Shadow mode first:** the new check runs and logs what it *would* refuse, but does not refuse, until the matrix test and a week of logs show it agrees with today's behaviour. That is how we avoid locking out the 31 owners and 2 cashiers by accident.

| Step | What | Exit gate |
|---|---|---|
| 1a | Permission catalogue, migrate role keys, `membership_permissions()` with expiry and scope | Local Postgres and live: every existing membership resolves to the expected set |
| 1b | Authority context and `withAuthority` / `requireAccess`, in **shadow mode** across all routes and pages | Every route wrapped (test enforces it); shadow log shows no would-refuse for legitimate traffic |
| 1c | Switch enforcement on, route group by group (Office, Services, Shop, POS, Documents, Customers, Catalogue, Team, Readiness and Sharing) | Route by role matrix passes for each group; the 21 hand-written role checks removed |
| 1d | High-risk SQL functions call `has_permission`; audit columns and automatic high-risk audit | A high-risk function called with a cashier's membership is refused in the database |
| 1e | Delegation reshaped and wired; membership expiry and location scope enforced | An expired or out-of-scope membership is refused; a delegation grants exactly its scope until it expires |
| 1f | Business status; step-up for the four highest-risk actions | A suspended business can read and export but not write; a stale session cannot change settlement |

---

## 5. How it will be tested

- **Local Postgres** (replaying every migration) for every SQL change, before Collins runs anything, as for 0070 to 0073.
- **Route by role matrix:** throwaway businesses with one member of each role, signed in with real session cookies, calling every route, compared with an expected table. Run in shadow mode first to compare with today, then with enforcement on.
- **A check that every route is wrapped**, so a new route cannot quietly skip authority.
- **Live verification** after each migration, with id-keyed cleanup and `erase_history` for the history tables.

---

## 6. Risks

- **Locking people out.** Mitigated by shadow mode, the matrix test, and switching on one route group at a time.
- **The role matrix is a business decision dressed as a technical one.** Getting "what may a manager do" wrong is a product problem, so it is section 8's first decision, not mine to settle.
- **Scope creep into the commerce core.** Phase 1 checks who may act. It does not reshape sales, payments or settlement; those are Phases 2 and 3.
- **Performance.** One authority lookup per request (memberships, permissions, capabilities). Resolved once and cached for the request, it replaces several queries routes make today.

---

## 7. Out of scope for Phase 1

- Legal entity, business groups and ownership transfer (spec 3, 4): need the commerce and billing cores first.
- Verification attestations beyond what exists (spec 9).
- AI agent authority tiers (spec 11): the permission risk levels are designed so agents can be added on top later.
- Internal Ascend roles beyond today's platform admin (spec 12): part of Control Center.
- Moving to Supabase Auth so RLS becomes real: see decision 8.4.

---

## 8. Decisions needed from Collins

1. **The role matrix in 3.4.** Is that what an owner, manager, cashier, accountant and staff member should be able to do? In particular: may a manager approve refunds and change prices? May an accountant export data and see settlement?
2. **Shadow mode length.** Recommended: one week of real traffic, or until the matrix test and the log agree, whichever is longer.
3. **Step-up authentication.** Recommended for the four actions in 3.9, with a fresh OTP within 10 minutes. Too much friction, or right?
4. **RLS posture.** Recommended: enforce in the application and the high-risk database functions (this plan), and say plainly that RLS is not the boundary. The alternative, moving sessions to Supabase Auth so `auth.uid()` is real and RLS works, is a bigger change to sign-in and would come later if at all.
5. **Business status now.** Recommended: just active, suspended and closed in Phase 1, the rest of the spec's lifecycle when a product needs it.

---

## 9. Switching on without real traffic (15 Nov 2026)

Decision 2 assumed a week of real traffic. The review report (`scripts/review-switches.mjs`) showed there was none: the last real sign-in was 5 Nov and nothing was logged after the deploy, so a week of shadow mode would have proved nothing.

**Decided by Collins on 15 Nov 2026:** switch on the strength of the deliberate tests instead, one group at a time, and run the review report after each switch. With no active merchants, the risk of locking someone out is close to nil, and the report will show any refusal of a signed-in member as soon as one happens.

**Office first.** The Office test (every Office action and `/work`, for owner, manager, cashier, accountant, staff, a member of another business and a signed-out visitor) was rerun on 15 Nov on the current code with `AUTHORITY_ENFORCE=office` and `COMMERCE_READERS=core`: 98 of 98 matched the approved matrix, and a route outside Office stayed in shadow mode. To switch: set `AUTHORITY_ENFORCE=office` in Netlify and redeploy. To undo: remove it and redeploy.

**Services and Shop next (15 Nov 2026).** Rerun on the current code with `AUTHORITY_ENFORCE=office,services,shop` and `COMMERCE_READERS=core`: Services 90 of 90, Shop 47 of 47 (Documents left out, as it stays in shadow mode). Staff may set their own hours and act on bookings and orders assigned to them, not on others'; cashiers and accountants are kept out of both; a member whose membership has expired, and anyone from another business, are refused. To switch: set `AUTHORITY_ENFORCE=office,services,shop` in Netlify and redeploy.

**Live, 15 Nov 2026.** `AUTHORITY_ENFORCE=office,services,shop` confirmed from real visits after a cleared-cache redeploy (the first redeploy did not pick up the new setting; visits were still logged as shadow). Owner visits to `/work`, Office actions, `/bookings`, `/orders` and `/services` are logged as enforced; `/documents` and `/customers` stay in shadow mode. Still in shadow: documents, catalogue, team, growth. **Lesson:** after changing a Netlify setting, use "Clear cache and deploy site", then confirm from one real visit that the log shows the new mode.
