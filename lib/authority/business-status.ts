import "server-only";

// A business's status (Phase 1 step 1f, migration 0081): active, suspended
// or closed. A business that is not active can read and export its history
// but cannot change anything, and customers cannot order from or book it.
//
// Read defensively: until 0081 has run there is no status column, and every
// business is treated as active rather than as unknown.

import { supabaseServer } from "@/lib/supabase";

export type BusinessStatus = "active" | "suspended" | "closed";

export async function businessStatus(businessId: string): Promise<BusinessStatus> {
  const { data, error } = await supabaseServer()
    .from("business")
    .select("status")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !data) return "active";
  const s = (data as { status?: string }).status;
  return s === "suspended" || s === "closed" ? s : "active";
}
