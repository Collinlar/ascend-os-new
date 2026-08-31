import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import PromoteManager, {
  type CampaignRow,
  type ListingRow,
} from "@/components/discover/PromoteManager";

export const dynamic = "force-dynamic";

// Merchant view of Discover: whether they are listed, what they are
// spending, what it reached, and how to answer back if they were suspended.

async function load(): Promise<{
  balance: number;
  listings: ListingRow[];
  campaigns: CampaignRow[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const businessId = membership.business_id as string;

    const [listings, performance, balanceRows] = await Promise.all([
      db
        .from("discover_listing")
        .select("id, status, category, city, suspended_reason, item:item_id(name)")
        .eq("business_id", businessId),
      db.rpc("campaign_performance", { p_business: businessId }),
      db.from("balance_entry").select("amount").eq("business_id", businessId),
    ]);

    return {
      balance: (balanceRows.data ?? []).reduce((n, b) => n + Number(b.amount), 0),
      listings: (listings.data ?? []).map((l) => ({
        id: l.id,
        status: l.status,
        name:
          (l.item as unknown as { name: string } | null)?.name ?? "Your business",
        city: l.city,
        suspendedReason: l.suspended_reason,
      })),
      campaigns: ((performance.data ?? []) as CampaignRow[]),
    };
  } catch {
    return null;
  }
}

export default async function Promote() {
  const data = await load();

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Getting found</h1>
          <p className="text-sm text-ink-muted">
            Being listed is free. Paying puts you higher up, and is labelled
            to customers as paid.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-ink-muted">
            Verify your WhatsApp number to manage this.
          </p>
        ) : (
          <PromoteManager
            balance={data.balance}
            listings={data.listings}
            campaigns={data.campaigns}
          />
        )}
      </div>
    </main>
  );
}
