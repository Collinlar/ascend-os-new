import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import CampaignReview, { type ReviewRow } from "@/components/admin/CampaignReview";
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
  const db = supabaseServer();
  const full = await db
    .from("discover_listing")
    .select(
      "id, business_id, status, city, category, suspended_reason, appeal_note, change_reason, flagged_text, resubmitted_at, appealed_at, appeal_evidence, business:business_id(name, shop_slug), item:item_id(name, description)"
    )
    .in("status", ["eligible", "pending_review", "suspended"])
    .order("status");
  // Before 0148 the review columns are not there: read what there is.
  const data = (full.error
    ? (
        await db
          .from("discover_listing")
          .select("id, business_id, status, city, category, suspended_reason, appeal_note, business:business_id(name, shop_slug), item:item_id(name, description)")
          .in("status", ["eligible", "pending_review", "suspended"])
          .order("status")
      ).data
    : full.data) as Array<Record<string, unknown>> | null;

  return Promise.all(
    (data ?? []).map(async (l) => {
      const business = l.business as { name: string; shop_slug: string | null } | null;
      const item = l.item as { name: string; description: string | null } | null;
      const files = ((l.appeal_evidence ?? []) as Array<{ path: string; name: string }>).slice(0, 3);
      // Evidence sits in a private bucket: links last ten minutes.
      const signed = files.length ? (await db.storage.from("reports").createSignedUrls(files.map((f) => f.path), 600)).data ?? [] : [];
      return {
        listingId: l.id as string,
        businessId: l.business_id as string,
        businessName: business?.name ?? "A business",
        itemName: item?.name ?? null,
        description: item?.description ?? null,
        city: (l.city as string | null) ?? null,
        category: (l.category as string | null) ?? null,
        status: l.status as string,
        suspendedReason: (l.suspended_reason as string | null) ?? null,
        changeReason: (l.change_reason as string | null) ?? null,
        flaggedText: (l.flagged_text as string | null) ?? null,
        appealNote: (l.appeal_note as string | null) ?? null,
        appealed: Boolean(l.appealed_at),
        resubmitted: Boolean(l.resubmitted_at),
        evidence: files.map((f, k) => ({ name: f.name, url: signed[k]?.signedUrl ?? "" })).filter((f) => f.url),
        shopSlug: business?.shop_slug ?? null,
      };
    })
  );
}

// Campaigns waiting for review (round 3, P2), oldest first. Before 0147
// there are none to read.
async function loadReviews(): Promise<ReviewRow[]> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("discover_campaign")
    .select("id, kind, daily_budget, days, place_ids, interests, submitted_at, business:business_id(name, shop_slug), listing:listing_id(item:item_id(name))")
    .eq("review_status", "pending")
    .order("submitted_at");
  if (error || !data) return [];
  const placeIds = Array.from(new Set(data.flatMap((c) => (c.place_ids as string[] | null) ?? [])));
  const { data: places } = placeIds.length ? await db.from("location").select("id, name, city").in("id", placeIds) : { data: [] };
  const placeName = new Map((places ?? []).map((p) => [p.id as string, `${p.name}${p.city ? `, ${p.city}` : ""}`]));
  return data.map((c) => {
    const b = c.business as unknown as { name: string; shop_slug: string | null } | null;
    const item = (c.listing as unknown as { item: { name: string } | null } | null)?.item;
    return {
      campaignId: c.id as string,
      businessName: b?.name ?? "A business",
      what: item?.name ?? "The whole shop",
      kind: (c.kind as string) ?? "product",
      dailyBudget: Number(c.daily_budget ?? 0),
      days: Number(c.days ?? 0),
      places: ((c.place_ids as string[] | null) ?? []).map((id) => placeName.get(id) ?? "A place").join(", "),
      interests: (c.interests as string[] | null) ?? [],
      submittedAt: c.submitted_at as string,
      shopSlug: b?.shop_slug ?? null,
    };
  });
}

export default async function AdminDiscover() {
  const admin = await currentAdmin();
  // Not a redirect and not a 403. Somebody who is not staff should not
  // learn that this address means anything.
  if (!admin) notFound();

  const rows = await load().catch((): ModerationRow[] => []);
  const reviews = await loadReviews().catch((): ReviewRow[] => []);
  // Resubmissions and appeals wait in pending_review (0148).
  const appeals = rows.filter((r) => r.status === "pending_review").length;

  return (
    <PageShell>
      <PageHeader
        title="Discover moderation"
        intro={
          appeals > 0
            ? `${appeals} ${appeals === 1 ? "listing is" : "listings are"} waiting for a decision.`
            : reviews.length > 0
              ? `${reviews.length} ${reviews.length === 1 ? "campaign is" : "campaigns are"} waiting for review.`
              : "What is listed, what is off Discover, and anything a business has asked us to reconsider."
        }
      />
      <section aria-labelledby="campaign-reviews" className="mb-8">
        <h2 id="campaign-reviews" className="mb-3 text-base font-bold text-ink">
          Campaigns waiting for review{reviews.length ? ` (${reviews.length})` : ""}
        </h2>
        <CampaignReview rows={reviews} />
      </section>
      <ModerationQueue rows={rows} />
    </PageShell>
  );
}
