import "server-only";

// The authority check for signed-in pages (Phase 1, step 1b), in shadow mode:
// it records what it would decide and changes nothing about the page. In
// step 1c it becomes requireAccess and redirects when the answer is no.

import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { PAGE_POLICY } from "./policy";
import { resolveAuthority } from "./context";
import { decideMember } from "./decide";
import { recordDecision, AUTHORITY_MODE } from "./log";

export async function shadowPageAccess(path: string): Promise<void> {
  try {
    const rule = PAGE_POLICY[path];
    if (!rule) return;
    const personId = await currentPersonId();
    if (!personId) return; // the page itself asks a signed-out visitor to sign in
    const membership = await activeMembership<{ business_id: string }>(personId);
    const ctx = await resolveAuthority(personId, membership?.business_id ?? null);
    const outcome = decideMember(ctx, rule, AUTHORITY_MODE === "shadow" ? "would_deny" : "deny");
    await recordDecision({
      surface: "page",
      route: path,
      personId,
      businessId: ctx.businessId,
      membershipId: ctx.membershipId,
      role: ctx.role,
      outcome,
    });
  } catch (e) {
    await recordDecision({
      surface: "page",
      route: path,
      outcome: {
        decision: "error",
        reason: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        required: {},
      },
    });
  }
}
