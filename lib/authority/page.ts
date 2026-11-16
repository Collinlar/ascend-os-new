import "server-only";

// The authority check for signed-in pages (Phase 1).
//
// Shadow (the default): records what it would decide and changes nothing.
// Enforced (the page's group is in AUTHORITY_ENFORCE, see enforce.ts): a
// person whose business lacks the product is sent to /grow, where it can be
// added; a person whose role does not allow the page, or whose access has
// ended, is sent to the dashboard. If the check itself cannot run on an
// enforced page, the person is sent to the dashboard rather than shown it.

import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { PAGE_POLICY } from "./policy";
import { resolveAuthority } from "./context";
import { decideMember } from "./decide";
import { recordDecision } from "./log";
import { pageEnforced } from "./enforce";

export async function checkPageAccess(path: string): Promise<void> {
  const enforced = await pageEnforced(path);
  let refuse = false;
  let reason: string | null = null;
  try {
    const rule = PAGE_POLICY[path];
    if (!rule) return;
    const personId = await currentPersonId();
    if (!personId) return; // the page itself asks a signed-out visitor to sign in
    const membership = await activeMembership<{ business_id: string }>(personId);
    const ctx = await resolveAuthority(personId, membership?.business_id ?? null);
    const outcome = decideMember(ctx, rule, enforced ? "deny" : "would_deny");
    await recordDecision({
      surface: "page",
      route: path,
      mode: enforced ? "enforce" : "shadow",
      personId,
      businessId: ctx.businessId,
      membershipId: ctx.membershipId,
      role: ctx.role,
      outcome,
    });
    refuse = enforced && outcome.decision === "deny";
    reason = outcome.reason;
  } catch (e) {
    await recordDecision({
      surface: "page",
      route: path,
      mode: enforced ? "enforce" : "shadow",
      outcome: {
        decision: "error",
        reason: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        required: {},
      },
    });
    refuse = enforced;
  }
  // Outside the try: redirect() works by throwing, and must not be caught.
  // Missing a product: /grow, where it can be added. Anything else (the role
  // does not allow it, access has ended): back to the dashboard.
  if (refuse) redirect(reason === "business_lacks_capability" ? "/grow" : "/dashboard");
}
