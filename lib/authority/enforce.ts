// Which route groups the authority check enforces (Phase 1, step 1c).
//
// Enforcement is switched on one group at a time, and only after the shadow
// log and the route-by-role test agree for that group
// (docs/planning/2026-11-foundation-alignment/PHASE_1_PLAN.md section 4).
// Everything not in an enforced group stays in shadow mode: the decision is
// recorded and the request runs as before.
//
// The switch is the AUTHORITY_ENFORCE setting, a comma-separated list of
// group names, for example "office". Unset means nothing is enforced. It is a
// setting rather than code so a group can be switched on, or back off, without
// a code change. On Netlify a changed setting takes effect on the next deploy,
// so switching a group means changing the setting and redeploying.

import { NextResponse } from "next/server";

/** API routes in each group. */
const ROUTE_GROUP: Record<string, string> = {
  "office/actions": "office",
};

/** Pages in each group. */
const PAGE_GROUP: Record<string, string> = {
  "/work": "office",
};

function enforcedGroups(): Set<string> {
  return new Set(
    (process.env.AUTHORITY_ENFORCE ?? "")
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function routeEnforced(route: string): boolean {
  const group = ROUTE_GROUP[route];
  return Boolean(group && enforcedGroups().has(group));
}

export function pageEnforced(path: string): boolean {
  const group = PAGE_GROUP[path];
  return Boolean(group && enforcedGroups().has(group));
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
