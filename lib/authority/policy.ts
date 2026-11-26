// What every API route requires, in one place (Phase 1, step 1b).
//
// Each route and method names what kind of caller it serves and, for members
// of a business, which permissions earn it (any one of the list is enough)
// and which capabilities the business must hold. Permissions come from the
// catalogue in migration 0074 and the role matrix Collins approved on
// 14 Nov 2026 (docs/planning/2026-11-foundation-alignment/PHASE_1_PLAN.md).
//
// While Phase 1 is in shadow mode this table does not refuse anything: the
// authority check logs what it WOULD decide and the route runs as before.
// Where the table and a route's own hand-written check disagree, the shadow
// log shows it, and that is the point of running it before enforcing.
//
// `gap` marks a route the catalogue has no fitting permission for yet. It is
// checked for membership only, and listed so the missing permission is
// decided rather than guessed.

import { OFFICE_ACTIONS } from "@/lib/office/access";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** The high-risk permissions (risk = 'high' in the 0074 catalogue). A route
 *  action that uses one of these and succeeds is written to audit_log. */
export const HIGH_RISK: ReadonlySet<string> = new Set([
  "refunds.approve",
  "prices.change",
  "settlement.change_destination",
  "staff.manage",
  "roles.change",
  "data.export",
  "external_access.authorize",
  "business.settings",
]);

/** Where the business a request acts on comes from. */
export type BusinessFrom =
  | "active" // the business the person is currently working in
  | "body" // body.businessId
  | "query" // ?businessId=
  | { table: string; param: string } // the business that owns /[param]
  | { table: string; bodyField: string }; // the business that owns the record named in the body

export interface MemberRule {
  /** Any one of these permissions is enough. Empty means membership only. */
  permission?: string[];
  /** The business must hold at least one of these capabilities. */
  capability?: string[];
  /** When the person holds only this "assigned" permission (and none of the
   *  others in the list), the record the route acts on must be assigned to
   *  them: its `column` must be their membership. */
  assigned?: { permission: string; column: string };
  /** When the membership the request changes (named by `bodyField`) has one
   *  of the `elevated` roles, the person must also hold `requires`. A
   *  manager can manage staff, but not another manager or the owner. */
  target?: { bodyField: string; elevated: string[]; requires: string };
  /** Where the route names the location it acts on (locationId in the body
   *  or the query). A member limited to certain locations is refused
   *  outside them (Identity spec 3, Phase 1 step 1e). */
  location?: "body" | "query";
  /** The person must have confirmed a fresh WhatsApp code in the last 10
   *  minutes (signing in counts). For the most sensitive actions
   *  (Identity spec 5, PHASE_1_PLAN.md 3.9). */
  stepUp?: boolean;
  gap?: string;
}

export type Policy =
  | { kind: "public"; why: string }
  | { kind: "session"; why: string }
  | { kind: "webhook"; why: string }
  | { kind: "cron"; why: string }
  | { kind: "device"; why: string }
  | { kind: "admin"; why: string }
  | ({
      kind: "member";
      business: BusinessFrom;
      /** For routes that do several things, the rule per body.action. */
      byAction?: Record<string, MemberRule>;
      /** For a rule that depends on the request body. */
      when?: (body: Record<string, unknown>) => MemberRule | "public" | null;
    } & MemberRule);

const member = (
  business: BusinessFrom,
  rule: MemberRule & Pick<Extract<Policy, { kind: "member" }>, "byAction" | "when"> = {}
): Policy => ({ kind: "member", business, ...rule });

// Office actions: the capability side comes from lib/office/access.ts so the
// two tables cannot drift; the permission side is added here.
const officeCap = (action: string) => {
  const caps = OFFICE_ACTIONS[action];
  return caps ? [...caps] : undefined;
};

// Changing a manager or the owner needs roles.change, which only owners hold.
const MANAGED = { bodyField: "membershipId", elevated: ["owner", "manager"], requires: "roles.change" };

export const ROUTE_POLICY: Record<string, Partial<Record<Method, Policy>>> = {
  // ----- signing in, and choosing a business -----
  "auth/request-otp": { POST: { kind: "public", why: "Asking for a sign-in code" } },
  "auth/verify-otp": { POST: { kind: "public", why: "Signing in with a code" } },
  "auth/signout": { POST: { kind: "public", why: "Signing out; harmless without a session" } },
  // Choosing which business to open: you must be a member of it.
  "auth/current-business": { POST: member("body") },
  // The top bar (Modules M1). Membership only: what is waiting, and which
  // of your own places you are looking at.
  attention: { GET: member("active") },
  "business/place": { POST: member("active", { location: "body" }) },
  "auth/step-up": { POST: { kind: "session", why: "Confirming a fresh code for a sensitive action" } },
  "business/create": { POST: { kind: "session", why: "Creating a business makes you its owner" } },
  // Session, not member: a suspended business is refused every change at the
  // member layer, and its appeal must still get through. The database checks
  // that the person owns the business.
  "business/risk-appeal": { POST: { kind: "session", why: "The owner appealing a risk decision; owner checked in the database" } },

  // ----- customer-facing, no account -----
  discover: {
    GET: { kind: "public", why: "Customers searching Discover" },
    POST: { kind: "public", why: "Recording an anonymous Discover click" },
  },
  "services/book": { POST: { kind: "public", why: "A customer booking" } },
  "services/slots": { GET: { kind: "public", why: "A customer choosing a time" } },
  "shop/orders": { POST: { kind: "public", why: "A customer placing an order" } },
  report: { POST: { kind: "public", why: "A customer reporting a problem with a business, 3 a day" } },
  "order-link/report": { POST: { kind: "public", why: "A customer reporting a problem with their order, from its private link, 3 a day" } },
  "order-link/escalate": { POST: { kind: "public", why: "A customer sending their order report on to Ascend, from its private link" } },
  "order-link/receipt": { GET: { kind: "public", why: "A customer opening the receipt for their order, from its private link" } },
  "pos/pair": { POST: { kind: "public", why: "A till pairing with a one-time code" } },

  // ----- machines -----
  "messaging/inbound": {
    GET: { kind: "webhook", why: "WhatsApp verification handshake" },
    POST: { kind: "webhook", why: "Inbound WhatsApp replies (STOP, DELETE) and delivery statuses, shared-token checked" },
  },
  "messaging/email-events": { POST: { kind: "webhook", why: "Email delivery events, Svix signature checked" } },
  "payments/webhook": { POST: { kind: "webhook", why: "Provider confirmation, signature checked" } },
  "internal/relay": {
    GET: { kind: "cron", why: "Outbox relay" },
    POST: { kind: "cron", why: "Outbox relay" },
  },
  "pos/catalogue": { GET: { kind: "device", why: "Paired till, device token" } },
  "pos/customers": { GET: { kind: "device", why: "Paired till, device token: names and phones only" } },
  "pos/refund-request": { POST: { kind: "device", why: "Paired till, device token" } },
  "pos/refunds": { GET: { kind: "device", why: "Paired till, device token: decisions on its own sales' refunds" } },
  "pos/staff": { GET: { kind: "device", why: "Paired till, device token" } },
  "pos/sync": { POST: { kind: "device", why: "Paired till, device token" } },
  "admin/discover": { POST: { kind: "admin", why: "Platform moderation" } },
  "admin/messaging": { POST: { kind: "admin", why: "Completing deletion requests and changing messaging limits" } },
  "admin/risk": { POST: { kind: "admin", why: "The Risk desk: cases, states, restrictions, reports, appeals; each re-checked in the database" } },

  // ----- business setup -----
  "business/product-sets": { POST: member("body", { permission: ["business.settings"] }) },
  "documents/branding": { POST: member("body", { permission: ["business.settings"] }) },
  "documents/sample": { GET: member("query", { permission: ["documents.view"], location: "query" }) },
  "devices/pairing-code": {
    POST: member("body", { permission: ["staff.manage"], capability: ["pos.tills"], location: "body" }),
    DELETE: member({ table: "device_registration", bodyField: "deviceId" }, { permission: ["staff.manage"], capability: ["pos.tills"] }),
  },

  // ----- catalogue and stock -----
  "catalogue/items": {
    // Owners and managers only, as the route allows today.
    GET: member("query", { permission: ["catalogue.manage"], capability: ["catalogue.core"], location: "query" }),
    PATCH: member("body", {
      permission: ["catalogue.manage"],
      capability: ["catalogue.core"],
      when: (b) =>
        b.price !== undefined || b.basePrice !== undefined || b.base_price !== undefined
          ? { permission: ["prices.change"] }
          : null,
    }),
  },
  "catalogue/photo": { POST: member("body", { permission: ["catalogue.manage"], capability: ["catalogue.core"] }) },
  // Stock is kept by POS (inventory.basic) or read by Shop (inventory.connection).
  "catalogue/stock": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"], location: "body" }) },
  "inventory/rule": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"] }) },
  "inventory/count": { POST: member("body", { capability: ["inventory.basic", "inventory.connection"], location: "body" }) },
  "inventory/count/decide": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"] }) },
  "inventory/receive": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"], location: "body" }) },
  // Advanced Inventory purchasing (0132): owners and managers only.
  "inventory/supplier": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.purchasing"] }) },
  "inventory/order": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.purchasing"], location: "body" }) },
  "inventory/order/close": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.purchasing"] }) },
  // Paying for a delivery needs stock rights only (0134), like receiving one paid.
  "inventory/receipt/pay": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"] }) },
  "inventory/reorder-rule": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.purchasing"] }) },
  "inventory/place-marks": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.purchasing"] }) },
  "inventory/expiry": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.expiry"] }) },
  // Advanced Inventory (0131). Sending and calling back need stock rights;
  // anyone at the receiving place may say what arrived.
  "inventory/transfer": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.transfers"], location: "body" }) },
  "inventory/transfer/arrived": { POST: member("body", { capability: ["inventory.transfers"], location: "body" }) },
  "inventory/transfer/cancel": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.transfers"] }) },
  "shop/catalogue": {
    POST: member("body", { permission: ["catalogue.manage"], capability: ["shop.storefront"] }),
  },
  "shop/settings": {
    POST: member("body", { permission: ["business.settings"], capability: ["shop.storefront"] }),
  },
  "shop/catalogue-suggest": {
    POST: member("active", { permission: ["catalogue.manage"], capability: ["shop.storefront"] }),
  },

  // ----- customers -----
  // Customer permissions since 0088. Consent is evidence under the Data
  // Protection Act, so recording it is the owner's and managers' (customers.manage).
  // Adding someone by hand; the same record the till and the shop would make.
  customers: { POST: member("active", { permission: ["customers.manage"] }) },
  "customers/[id]/consent": {
    POST: member({ table: "customer", param: "id" }, { permission: ["customers.manage"] }),
  },
  "customers/[id]/history": {
    GET: member({ table: "customer", param: "id" }, { permission: ["customers.view"] }),
  },

  // ----- documents and payments -----
  documents: { POST: member("body", { permission: ["documents.create"], capability: ["documents.issue", "documents.core", "documents.receipts"] }) },
  "documents/[id]": { POST: member({ table: "document", param: "id" }, { permission: ["documents.create"] }) },
  "documents/[id]/pdf": { GET: member({ table: "document", param: "id" }, { permission: ["documents.view"] }) },
  "payments/initiate": {
    // A signed-in member only ever tops up Ascend Balance here, which is
    // billing. Paying a document, booking or order is done by the customer
    // from a link, with no session.
    POST: member("body", {
      permission: ["business.settings"],
      when: (b) => (b.purpose === "balance_topup" ? null : "public"),
    }),
  },
  // Money taken on the day against an order or a booking (0141). The
  // database asks for orders.manage or bookings.manage, whichever it is for.
  "payments/record": { POST: member("active", { permission: ["orders.manage", "bookings.manage"] }) },
  "payments/refund": { POST: member({ table: "payment", bodyField: "paymentId" }, { permission: ["refunds.approve"] }) },

  // ----- shop orders -----
  // The customer's tracking link and replies to their reports (R5); the
  // database asks for orders.manage again on a reply.
  "shop/orders/[id]/customer": {
    POST: member({ table: "shop_order", param: "id" }, {
      permission: ["orders.manage", "orders.manage_assigned"],
      capability: ["shop.orders"],
      assigned: { permission: "orders.manage_assigned", column: "assigned_membership_id" },
    }),
  },
  "shop/orders/[id]": {
    POST: member({ table: "shop_order", param: "id" }, {
      permission: ["orders.manage", "orders.manage_assigned"],
      capability: ["shop.orders"],
      assigned: { permission: "orders.manage_assigned", column: "assigned_membership_id" },
    }),
  },

  // ----- services -----
  "services/offerings": {
    GET: member("active", { capability: ["services.bookings"], gap: "Reading what is offered; every member can today" }),
    POST: member("body", { permission: ["catalogue.manage"], capability: ["services.bookings"] }),
    PATCH: member("body", { permission: ["catalogue.manage"], capability: ["services.bookings"] }),
  },
  "services/availability": {
    // A provider manages their own hours; anyone's needs bookings.manage. The
    // "own" half is contextual and stays with the route until step 1c.
    POST: member("body", { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.basic_availability"] }),
    DELETE: member({ table: "staff_time_off", bodyField: "timeOffId" }, { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.basic_availability"] }),
  },
  "services/bookings/[id]": {
    POST: member({ table: "service_booking", param: "id" }, {
      permission: ["bookings.manage", "bookings.manage_assigned"],
      capability: ["services.bookings"],
      assigned: { permission: "bookings.manage_assigned", column: "assigned_membership_id" },
    }),
  },

  // ----- team -----
  // A manager manages staff, not another manager or the owner (matrix 3.4).
  "staff/team": {
    POST: member("body", {
      permission: ["staff.manage"],
      when: (b) => (b.roleKey === "manager" ? { permission: ["roles.change"] } : null),
    }),
    DELETE: member("body", { permission: ["staff.manage"], target: MANAGED }),
  },
  "staff/pin": {
    POST: member("body", { permission: ["staff.manage"], target: MANAGED }),
    DELETE: member("body", { permission: ["staff.manage"], target: MANAGED }),
  },

  // ----- office -----
  "office/actions": {
    POST: member("active", {
      byAction: {
        attendance: { permission: ["attendance.own"], capability: officeCap("attendance") },
        complete_task: { permission: ["tasks.own"], capability: officeCap("complete_task") },
        move_task: { permission: ["tasks.own"], capability: officeCap("move_task") },
        create_task: { capability: officeCap("create_task"), gap: "No work-management permission yet (work.manage)" },
        create_project: { capability: officeCap("create_project"), gap: "No work-management permission yet (work.manage)" },
        decide_approval: { permission: ["approvals.decide", "refunds.approve"], capability: officeCap("decide_approval") },
        request_leave: { permission: ["attendance.own"], capability: officeCap("request_leave") },
        request_purchase: { permission: ["tasks.own"], capability: officeCap("request_purchase") },
        submit_expense: { permission: ["tasks.own"], capability: officeCap("submit_expense") },
        assign_booking: { permission: ["bookings.manage"], capability: officeCap("assign_booking") },
        change_role: { permission: ["staff.manage", "roles.change"], capability: officeCap("change_role") },
        save_location: { permission: ["business.settings"] },
      },
    }),
  },

  // ----- growth and readiness -----
  "discover/promote": { POST: member("active", { permission: ["campaigns.send"], capability: ["discover.listing"] }) },
  "readiness/mot": { POST: member("active", { permission: ["reports.view"], capability: ["readiness.score"] }) },
  sharing: {
    // Sharing the business record outside it needs a fresh code (step-up).
    POST: member("active", { permission: ["external_access.authorize"], capability: ["readiness.score"], stepUp: true }),
    DELETE: member("active", { permission: ["external_access.authorize"], capability: ["readiness.score"] }),
  },
};

/** What each signed-in page requires. Pages not listed need only a session.
 *  /pos is not here: the till is a device, authenticated by its device token
 *  and a cashier PIN through the pos/* routes, not by a browser session. */
export const PAGE_POLICY: Record<string, MemberRule> = {
  "/orders": { permission: ["orders.manage", "orders.manage_assigned"], capability: ["shop.orders"] },
  "/sales": { permission: ["sales.view"] },
  "/money": { permission: ["payments.view"] },
  "/bookings": { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.bookings"] },
  "/services": { permission: ["catalogue.manage"], capability: ["services.bookings"] },
  "/documents": { permission: ["documents.view"], capability: ["documents.issue"] },
  "/customers": { permission: ["customers.view"], capability: ["customers.core", "customers.basic"] },
  "/products": { permission: ["catalogue.manage"], capability: ["catalogue.core"] },
  "/products/add": { permission: ["catalogue.manage"], capability: ["catalogue.core"] },
  "/inventory/count": { capability: ["inventory.basic", "inventory.connection"] },
  "/inventory/arrivals": { capability: ["inventory.transfers"] },
  "/inventory": { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"] },
  "/shop": { permission: ["catalogue.manage"], capability: ["shop.storefront"] },
  "/devices": { permission: ["staff.manage"], capability: ["pos.tills"] },
  "/availability": { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.basic_availability"] },
  "/team": { permission: ["staff.manage"], capability: ["people.cashiers", "people.core"] },
  "/work/approvals": { capability: ["office.work", "work.approvals", "pos.refunds"] },
  "/work/board": { capability: ["office.work", "work.core", "office.basic_order_assignment", "people.provider_assignment"] },
  "/work": { capability: ["office.work", "office.basic_attendance", "office.basic_shifts", "office.basic_order_assignment", "people.provider_assignment"] },
  "/promote": { permission: ["campaigns.send"], capability: ["discover.listing"] },
  "/readiness": { permission: ["reports.view"], capability: ["readiness.score"] },
  "/sharing": { permission: ["external_access.authorize"], capability: ["readiness.score"] },
  "/billing": { permission: ["business.settings"] },
};
