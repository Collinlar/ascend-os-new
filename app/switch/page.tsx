import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPersonId } from "@/lib/auth/session";
import { currentBusinessChoice } from "@/lib/auth/current-business";
import { supabaseServer } from "@/lib/supabase";
import BusinessChooser from "@/components/auth/BusinessChooser";

export const dynamic = "force-dynamic";

// Putting one set of books down and opening another.
//
// One person, several businesses, one login (IDN-001). Roles never merge
// across them (CHN-006), so this is a switch between separate workspaces
// rather than a view that combines them.
export default async function SwitchBusiness() {
  const personId = await currentPersonId();
  if (!personId) redirect("/signin");

  const { data: memberships } = await supabaseServer()
    .from("business_membership")
    .select("business_id, created_at, business:business_id(name)")
    .eq("person_id", personId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const rows = memberships ?? [];
  // Nothing to choose between. Sending somebody to a list of one is a dead
  // end dressed as a decision.
  if (rows.length <= 1) redirect("/dashboard");

  const chosen = currentBusinessChoice();
  const businesses = rows.map((m, i) => ({
    id: m.business_id as string,
    name:
      (m.business as unknown as { name: string } | null)?.name ?? "Your business",
    current: chosen ? m.business_id === chosen : i === 0,
  }));

  return (
    <main className="min-h-screen bg-light-grey">
      <div className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
          Your businesses
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          They keep separate records, separate customers and separate money.
          Opening one does not touch the other.
        </p>

        <div className="mt-8">
          <BusinessChooser businesses={businesses} />
        </div>

        <Link
          href="/dashboard"
          className="tap mt-6 inline-flex items-center text-sm font-bold text-ink-muted"
        >
          Stay where I am
        </Link>
      </div>
    </main>
  );
}
