import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { PageHeader, PageShell } from "@/components/shell/Page";
import ModerationQueue, {
  type ModerationRow,
} from "@/components/admin/ModerationQueue";

export const dynamic = "force-dynamic";

// Discover moderation (DSC-013).
//
// Appeals first, because a suspended business is losing reach every day it
// waits, and it has already done the one thing we asked of it.

async function load(): Promise<ModerationRow[]> {
  const { data } = await supabaseServer()
    .from("discover_listing")
    .select(
      "id, business_id, status, city, category, suspended_reason, appeal_note, business:business_id(name, shop_slug), item:item_id(name)"
    )
    .in("status", ["eligible", "pending_review", "suspended"])
    .order("status");

  return (data ?? []).map((l) => {
    const business = l.business as unknown as {
      name: string;
      shop_slug: string | null;
    } | null;
    return {
      listingId: l.id as string,
      businessId: l.business_id as string,
      businessName: business?.name ?? "A business",
      itemName: (l.item as unknown as { name: string } | null)?.name ?? null,
      city: (l.city as string | null) ?? null,
      category: (l.category as string | null) ?? null,
      status: l.status as string,
      suspendedReason: (l.suspended_reason as string | null) ?? null,
      appealNote: (l.appeal_note as string | null) ?? null,
      shopSlug: business?.shop_slug ?? null,
    };
  });
}

export default async function AdminDiscover() {
  const admin = await currentAdmin();
  // Not a redirect and not a 403. Somebody who is not staff should not
  // learn that this address means anything.
  if (!admin) notFound();

  const rows = await load().catch((): ModerationRow[] => []);
  const appeals = rows.filter((r) => r.status === "suspended" && r.appealNote).length;

  return (
    <PageShell>
      <PageHeader
        title="Discover moderation"
        intro={
          appeals > 0
            ? `${appeals} ${appeals === 1 ? "business has" : "businesses have"} answered a suspension and ${
                appeals === 1 ? "is" : "are"
              } waiting on you.`
            : "What is listed, what is suspended, and anything a business has asked us to reconsider."
        }
      />
      <ModerationQueue rows={rows} />
    </PageShell>
  );
}
