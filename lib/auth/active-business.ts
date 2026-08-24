import { supabaseServer } from "@/lib/supabase";
import { currentBusinessChoice } from "./current-business";

// Which business this person is currently working in.
//
// Seventeen surfaces used to answer this question for themselves, each with
// the same query: take a membership, limit one, no ordering. With one
// business per person that is invisible. With two it means the nav can name
// one business while the figures below it come from the other, and which
// one you get can change between requests.
//
// One rule, in one place: the business you chose if you are still a member
// of it, otherwise the one you have had longest.
export async function activeMembership<T = { business_id: string }>(
  personId: string,
  select = "business_id"
): Promise<T | null> {
  const { data } = await supabaseServer()
    .from("business_membership")
    .select(select)
    .eq("person_id", personId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as Array<T & { business_id: string }>;
  if (rows.length === 0) return null;

  const chosen = currentBusinessChoice();
  return (rows.find((r) => r.business_id === chosen) ?? rows[0]) as T;
}

// The id alone, for callers that only need to scope a query.
export async function activeBusinessId(personId: string): Promise<string | null> {
  const membership = await activeMembership(personId);
  return membership?.business_id ?? null;
}
