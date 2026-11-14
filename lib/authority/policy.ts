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

export const ROUTE_POLICY: Record<string, Partial<Record<Method, Policy>>> = {
  // ----- signing in, and choosing a business -----
  "auth/request-otp": { POST: { kind: "public", why: "Asking for a sign-in code" } },
  "auth/verify-otp": { POST: { kind: "public", why: "Signing in with a code" } },
  "auth/signout": { POST: { kind: "public", why: "Signing out; harmless without a session" } },
  // Choosing which business to open: you must be a member of it.
  "auth/current-business": { POST: member("body") },
  "business/create": { POST: { kind: "session", why: "Creating a business makes you its owner" } },

  // ----- customer-facing, no account -----
  discover: {
    GET: { kind: "public", why: "Customers searching Discover" },
    POST: { kind: "public", why: "Recording an anonymous Discover click" },
  },
  "services/book": { POST: { kind: "public", why: "A customer booking" } },
  "services/slots": { GET: { kind: "public", why: "A customer choosing a time" } },
  "shop/orders": { POST: { kind: "public", why: "A customer placing an order" } },
  "pos/pair": { POST: { kind: "public", why: "A till pairing with a one-time code" } },

  // ----- machines -----
  "messaging/inbound": {
    GET: { kind: "webhook", why: "WhatsApp verification handshake" },
    POST: { kind: "webhook", why: "Inbound WhatsApp messages, shared-token checked" },
  },
  "payments/webhook": { POST: { kind: "webhook", why: "Provider confirmation, signature checked" } },
  "internal/relay": {
    GET: { kind: "cron", why: "Outbox relay" },
    POST: { kind: "cron", why: "Outbox relay" },
  },
  "pos/catalogue": { GET: { kind: "device", why: "Paired till, device token" } },
  "pos/refund-request": { POST: { kind: "device", why: "Paired till, device token" } },
  "pos/staff": { GET: { kind: "device", why: "Paired till, device token" } },
  "pos/sync": { POST: { kind: "device", why: "Paired till, device token" } },
  "admin/discover": { POST: { kind: "admin", why: "Platform moderation" } },

  // ----- business setup -----
  "business/product-sets": { POST: member("body", { permission: ["business.settings"] }) },
  "documents/branding": { POST: member("body", { permission: ["business.settings"] }) },
  "devices/pairing-code": {
    POST: member("body", { permission: ["staff.manage"], capability: ["pos.tills"] }),
    DELETE: member({ table: "device_registration", bodyField: "deviceId" }, { permission: ["staff.manage"], capability: ["pos.tills"] }),
  },

  // ----- catalogue and stock -----
  "catalogue/items": {
    // Owners and managers only, as the route allows today.
    GET: member("query", { permission: ["catalogue.manage"], capability: ["catalogue.core"] }),
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
  "catalogue/stock": { POST: member("body", { permission: ["inventory.manage"], capability: ["inventory.basic", "inventory.connection"] }) },
  "shop/catalogue": {
    POST: member("body", { permission: ["catalogue.manage"], capability: ["shop.storefront"] }),
  },
  "shop/catalogue-suggest": {
    POST: member("active", { permission: ["catalogue.manage"], capability: ["shop.storefront"] }),
  },

  // ----- customers -----
  "customers/[id]/consent": {
    POST: member(
      { table: "customer", param: "id" },
      { gap: "No customer permission in the catalogue yet (customers.manage)" }
    ),
  },
  "customers/[id]/history": {
    GET: member(
      { table: "customer", param: "id" },
      { gap: "No customer permission in the catalogue yet (customers.view)" }
    ),
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
  "payments/refund": { POST: member({ table: "payment", bodyField: "paymentId" }, { permission: ["refunds.approve"] }) },

  // ----- shop orders -----
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
  "staff/team": {
    POST: member("body", { permission: ["staff.manage"] }),
    DELETE: member("body", { permission: ["staff.manage"] }),
  },
  "staff/pin": {
    POST: member("body", { permission: ["staff.manage"] }),
    DELETE: member("body", { permission: ["staff.manage"] }),
  },

  // ----- office -----
  "office/actions": {
    POST: member("active", {
      byAction: {
        attendance: { permission: ["attendance.own"], capability: officeCap("attendance") },
        complete_task: { permission: ["tasks.own"], capability: officeCap("complete_task") },
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
    POST: member("active", { permission: ["external_access.authorize"], capability: ["readiness.score"] }),
    DELETE: member("active", { permission: ["external_access.authorize"], capability: ["readiness.score"] }),
  },
};

/** What each signed-in page requires. Pages not listed need only a session.
 *  /pos is not here: the till is a device, authenticated by its device token
 *  and a cashier PIN through the pos/* routes, not by a browser session. */
export const PAGE_POLICY: Record<string, MemberRule> = {
  "/orders": { permission: ["orders.manage", "orders.manage_assigned"], capability: ["shop.orders"] },
  "/bookings": { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.bookings"] },
  "/services": { permission: ["catalogue.manage"], capability: ["services.bookings"] },
  "/documents": { permission: ["documents.view"], capability: ["documents.issue"] },
  "/customers": { capability: ["customers.core", "customers.basic"], gap: "No customer permission yet (customers.view)" },
  "/products": { permission: ["catalogue.manage"], capability: ["catalogue.core"] },
  "/products/add": { permission: ["catalogue.manage"], capability: ["catalogue.core"] },
  "/shop": { permission: ["catalogue.manage"], capability: ["shop.storefront"] },
  "/devices": { permission: ["staff.manage"], capability: ["pos.tills"] },
  "/availability": { permission: ["bookings.manage", "bookings.manage_assigned"], capability: ["services.basic_availability"] },
  "/team": { permission: ["staff.manage"], capability: ["people.cashiers", "people.core"] },
  "/work": { capability: ["office.work", "office.basic_attendance", "office.basic_shifts", "office.basic_order_assignment", "people.provider_assignment"] },
  "/promote": { permission: ["campaigns.send"], capability: ["discover.listing"] },
  "/readiness": { permission: ["reports.view"], capability: ["readiness.score"] },
  "/sharing": { permission: ["external_access.authorize"], capability: ["readiness.score"] },
  "/billing": { permission: ["business.settings"] },
};
