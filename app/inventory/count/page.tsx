import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { checkPageAccess } from "@/lib/authority/page";
import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import CountForm from "@/components/inventory/CountForm";

export const dynamic = "force-dynamic";

// Count the shelf (Inventory Core I4). Open to anyone on the team, so a
// cashier can count on their own phone; the database decides whether the
// count posts at once or waits for the owner (0129).

export default async function CountStock() {
  await checkPageAccess("/inventory/count");
  const personId = await currentPersonId();
  const membership = personId
    ? await activeMembership<{ business_id: string; role: { key: string } | null }>(personId, "business_id, role:role_id(key)")
    : null;
  if (!membership) {
    return (
      <PageShell>
        <PageHeader title="Count the shelf" />
        <EmptyState title="Sign in to count stock." detail="We send a code to the WhatsApp number your business is set up with." />
      </PageShell>
    );
  }
  const db = supabaseServer();
  const [locs, items] = await Promise.all([
    db.from("location").select("id, name").eq("business_id", membership.business_id).eq("active", true).order("created_at"),
    db.from("catalogue_item").select("id, name, category, track_stock").eq("business_id", membership.business_id).eq("active", true).order("name"),
  ]);
  const places = (locs.data ?? []).map((l) => ({ id: l.id as string, name: l.name as string }));
  const all = (items.data ?? []).map((i) => ({ id: i.id as string, name: i.name as string, category: (i.category as string | null) ?? null, tracked: Boolean(i.track_stock) }));
  const canPost = ["owner", "manager"].includes(membership.role?.key ?? "");

  return (
    <PageShell>
      {canPost && (
        <Link href="/inventory?tab=counts" className="tap -mt-2 mb-2 inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-teal-800">
          Back to Inventory
        </Link>
      )}
      <PageHeader title="Count the shelf" intro="Type what you can see for each product. Leave a box empty to skip it." />
      {all.length === 0 || places.length === 0 ? (
        <EmptyState title="There is nothing to count yet." detail="Products appear here once they are added." />
      ) : (
        <CountForm
          businessId={membership.business_id}
          places={places}
          counted={all.filter((i) => i.tracked)}
          uncounted={all.filter((i) => !i.tracked)}
          canPost={canPost}
        />
      )}
    </PageShell>
  );
}
