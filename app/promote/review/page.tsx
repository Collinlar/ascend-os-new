import { supabaseServer } from "@/lib/supabase";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import ListingReview, { type ReviewListing, type ReportOutcome } from "@/components/discover/ListingReview";
import { MODULES, promotionsTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { REASON_FOR_DESK } from "@/lib/risk/reports";

export const dynamic = "force-dynamic";

// Review and reports (round 3, P3), from the design: each Discover listing
// and where its review stands, what needs a change and what was removed,
// with the appeal; and reports about the business as closed outcomes only
// (decision 5): never who reported, never anything still being looked at.

export default async function ReviewPage() {
  await checkPageAccess("/promote");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.promotions}>
        <EmptyState title="Sign in to see this." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const db = supabaseServer();
  const full = await db
    .from("discover_listing")
    .select("id, status, suspended_reason, change_reason, flagged_text, flagged_field, resubmitted_at, appealed_at, appeal_note, appeal_evidence, reviewed_at, item:item_id(name, description)")
    .eq("business_id", workspace.businessId)
    .in("status", ["eligible", "pending_review", "suspended"]);
  // Before 0148 there are no review columns: show what there is.
  const rows = (full.error
    ? (await db.from("discover_listing").select("id, status, suspended_reason, appeal_note, reviewed_at, item:item_id(name, description)").eq("business_id", workspace.businessId).in("status", ["eligible", "pending_review", "suspended"])).data
    : full.data) as Array<Record<string, unknown>> | null;

  const listings: ReviewListing[] = (rows ?? []).map((l) => {
    const item = l.item as { name: string; description: string | null } | null;
    return {
      id: l.id as string,
      name: item?.name ?? "Your whole shop",
      description: item?.description ?? null,
      status: l.status as string,
      reason: (l.suspended_reason as string) ?? null,
      needsChange: Boolean(l.change_reason),
      flagged: (l.flagged_text as string) ?? null,
      flaggedField: (l.flagged_field as string) ?? null,
      resubmitted: Boolean(l.resubmitted_at),
      appealed: Boolean(l.appealed_at) || (l.status === "pending_review" && Boolean(l.appeal_note)),
      evidence: ((l.appeal_evidence ?? []) as Array<{ name: string; size: number }>).map((f) => ({ name: f.name, size: f.size })),
      reviewedAt: (l.reviewed_at as string) ?? null,
    };
  });

  // Closed outcomes only: sorted by the shop, closed by Ascend, or a case
  // Ascend has finished.
  const { data: reports } = await db
    .from("customer_report")
    .select("id, reason, status, created_at, reviewed_at, shop_resolved_at, shop_reply, case:case_id(status)")
    .eq("business_id", workspace.businessId)
    .in("status", ["dismissed", "sorted_by_shop", "case_opened", "added_to_case"])
    .order("created_at", { ascending: false })
    .limit(20);
  const outcomes: ReportOutcome[] = ((reports ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r.status === "dismissed" || r.status === "sorted_by_shop" || (r.case as { status: string } | null)?.status === "resolved")
    .map((r) => ({
      id: r.id as string,
      what: REASON_FOR_DESK[r.reason as string] ?? "A report",
      when: ((r.shop_resolved_at ?? r.reviewed_at ?? r.created_at) as string) ?? null,
      outcome:
        r.status === "sorted_by_shop"
          ? `You replied${r.shop_reply ? `: "${r.shop_reply}"` : ""}. Closed.`
          : r.status === "dismissed"
            ? "Ascend looked into it and closed it."
            : "Ascend reviewed it and closed the case.",
    }));

  return (
    <ModulePage identity={MODULES.promotions} tabs={promotionsTabs("/promote/review")}>
      <ListingReview listings={listings} outcomes={outcomes} />
    </ModulePage>
  );
}
