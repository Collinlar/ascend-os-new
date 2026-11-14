import "server-only";

import { supabaseServer } from "@/lib/supabase";
import type { Outcome } from "./decide";


export interface DecisionRecord {
  surface: "api" | "page";
  /** shadow: recorded only. enforce: the route or page acted on it. */
  mode?: "shadow" | "enforce";
  route: string;
  method?: string;
  action?: string | null;
  personId?: string | null;
  businessId?: string | null;
  membershipId?: string | null;
  role?: string | null;
  outcome: Outcome;
}

// Writing the record must never be the reason a request fails.
export async function recordDecision(r: DecisionRecord): Promise<void> {
  try {
    await supabaseServer()
      .from("authority_decision")
      .insert({
        mode: r.mode ?? "shadow",
        surface: r.surface,
        route: r.route,
        method: r.method ?? null,
        action: r.action ?? null,
        person_id: r.personId ?? null,
        business_id: r.businessId ?? null,
        membership_id: r.membershipId ?? null,
        role: r.role ?? null,
        required: r.outcome.required ?? {},
        decision: r.outcome.decision,
        reason: r.outcome.reason,
      });
  } catch {
    // Swallowed on purpose; see above.
  }
}
