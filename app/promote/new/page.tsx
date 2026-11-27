import { supabaseServer } from "@/lib/supabase";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import NewCampaign, { type CampaignListing } from "@/components/discover/NewCampaign";
import { MODULES, promotionsTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { loadBalance } from "@/lib/promote/load";

export const dynamic = "force-dynamic";

// New campaign (round 3, P2), from the design's screen of the same name.

export default async function NewCampaignPage({ searchParams }: { searchParams: { listing?: string } }) {
  await checkPageAccess("/promote");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.promotions}>
        <EmptyState title="Sign in to promote." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const db = supabaseServer();
  const [listings, places, biz, balance] = await Promise.all([
    db
      .from("discover_listing")
      .select("id, status, category, item:item_id(id, name, kind, base_price, photo_url, category), cat:discover_category(label)")
      .eq("business_id", workspace.businessId)
      .eq("status", "eligible"),
    db.from("location").select("id, name, city").eq("business_id", workspace.businessId).eq("active", true).order("created_at"),
    db.from("business").select("name, identity_verification").eq("id", workspace.businessId).maybeSingle(),
    loadBalance(workspace.businessId),
  ]);

  const options: CampaignListing[] = ((listings.data ?? []) as Array<Record<string, unknown>>).map((l) => {
    const item = l.item as { id: string; name: string; kind: string; base_price: number | null; photo_url: string | null; category: string | null } | null;
    return {
      id: l.id as string,
      name: item?.name ?? "Your whole shop",
      kind: item ? (item.kind === "service" ? "service" : "product") : "shop",
      price: item?.base_price === null || item?.base_price === undefined ? null : Number(item.base_price),
      photo: item?.photo_url ?? null,
      category: (l.category as string) ?? null,
      categoryLabel: (l.cat as { label: string } | null)?.label ?? item?.category ?? null,
    };
  });

  return (
    <ModulePage identity={MODULES.promotions} tabs={promotionsTabs("/promote/new")}>
      <NewCampaign
        businessName={(biz.data?.name as string) ?? workspace.businessName}
        verified={biz.data?.identity_verification === "verified"}
        listings={options}
        places={((places.data ?? []) as Array<Record<string, unknown>>).map((p) => ({ id: p.id as string, name: p.name as string, city: (p.city as string) ?? null }))}
        balance={balance.total}
        initialListing={options.some((o) => o.id === searchParams.listing) ? (searchParams.listing as string) : null}
      />
    </ModulePage>
  );
}
