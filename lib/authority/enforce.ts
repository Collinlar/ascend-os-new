// Which route groups the authority check enforces (Phase 1, step 1c).
//
// Enforcement is switched on one group at a time, and only after the shadow
// log and the route-by-role test agree for that group
// (docs/planning/2026-11-foundation-alignment/PHASE_1_PLAN.md section 4).
// Everything not in an enforced group stays in shadow mode: the decision is
// recorded and the request runs as before.
//
// The switch is the authority_enforce row of platform_setting (0089): a list
// of group names, changed with set_platform_setting() and audited. It used to
// be the AUTHORITY_ENFORCE deploy setting, which an ordinary Netlify deploy
// twice ran without; that setting is now only the fallback if the table
// cannot be read.

import { NextResponse } from "next/server";
import { platformSettings } from "@/lib/settings/platform";

/** API routes in each group. */
const ROUTE_GROUP: Record<string, string> = {
  "office/actions": "office",
  "services/offerings": "services",
  "services/availability": "services",
  "services/bookings/[id]": "services",
  "shop/catalogue": "shop",
  "shop/catalogue-suggest": "shop",
  "shop/orders/[id]": "shop",
  documents: "documents",
  "documents/[id]": "documents",
  "documents/[id]/pdf": "documents",
  "documents/branding": "documents",
  "catalogue/items": "catalogue",
  "catalogue/photo": "catalogue",
  "catalogue/stock": "catalogue",
  "inventory/receive": "catalogue",
  "staff/team": "team",
  "staff/pin": "team",
  "devices/pairing-code": "team",
  "business/product-sets": "team",
  "discover/promote": "growth",
  "readiness/mot": "growth",
  sharing: "growth",
  "payments/initiate": "growth",
  "customers/[id]/consent": "customers",
  "customers/[id]/history": "customers",
};

/** Pages in each group. */
const PAGE_GROUP: Record<string, string> = {
  "/work": "office",
  "/services": "services",
  "/bookings": "services",
  "/availability": "services",
  "/orders": "shop",
  "/shop": "shop",
  "/documents": "documents",
  "/products": "catalogue",
  "/products/add": "catalogue",
  "/inventory": "catalogue",
  "/team": "team",
  "/devices": "team",
  "/billing": "team",
  "/promote": "growth",
  "/readiness": "growth",
  "/sharing": "growth",
  "/customers": "customers",
};

// Which groups are enforced comes from the database since 0089
// (lib/settings/platform.ts), falling back to AUTHORITY_ENFORCE only if the
// table cannot be read.
async function enforcedGroups(): Promise<Set<string>> {
  return (await platformSettings()).authorityEnforce;
}

export async function routeEnforced(route: string): Promise<boolean> {
  const group = ROUTE_GROUP[route];
  return Boolean(group && (await enforcedGroups()).has(group));
}

export async function pageEnforced(path: string): Promise<boolean> {
  const group = PAGE_GROUP[path];
  return Boolean(group && (await enforcedGroups()).has(group));
}

/** What the person sees when an enforced route refuses them. */
export function refusal(reason: string | null): NextResponse {
  switch (reason) {
    case "not_signed_in":
      return NextResponse.json(
        { error: "Your session timed out. Verify your WhatsApp number to continue." },
        { status: 401 }
      );
    case "membership_expired":
      return NextResponse.json(
        { error: "Your access to this business has ended. Ask the owner to renew it." },
        { status: 403 }
      );
    case "membership_suspended":
    case "membership_removed":
    case "membership_invited":
      return NextResponse.json(
        { error: "Your access to this business is paused. Ask the owner." },
        { status: 403 }
      );
    case "business_lacks_capability":
      return NextResponse.json(
        { error: "That is part of a product your business has not added yet." },
        { status: 403 }
      );
    case "business_suspended":
      return NextResponse.json(
        { error: "This business is paused on Ascend. You can still see and export its records. Contact Ascend support." },
        { status: 403 }
      );
    case "business_closed":
      return NextResponse.json(
        { error: "This business is closed on Ascend. You can still see and export its records." },
        { status: 403 }
      );
    case "step_up_required":
      return NextResponse.json(
        { error: "Confirm it is you first. We will send a code to your WhatsApp.", stepUp: true },
        { status: 401 }
      );
    case "outside_your_locations":
      return NextResponse.json(
        { error: "That location is not one of yours. Ask the owner." },
        { status: 403 }
      );
    case "cannot_manage_that_role":
      return NextResponse.json(
        { error: "Only the owner can change a manager or the owner." },
        { status: 403 }
      );
    case "not_assigned_to_you":
      return NextResponse.json(
        { error: "This one is not assigned to you. Ask the owner or a manager." },
        { status: 403 }
      );
    case "missing_permission":
      return NextResponse.json(
        { error: "Your role does not allow this. Ask the owner or a manager." },
        { status: 403 }
      );
    default:
      return NextResponse.json(
        { error: "You do not have access to this business." },
        { status: 403 }
      );
  }
}

/** When the check itself could not run on an enforced route: refuse. */
export function checkUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "We could not check your access just now. Tap again in a moment." },
    { status: 503 }
  );
}
