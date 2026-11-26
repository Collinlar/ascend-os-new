import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import ShopSettingsForm from "@/components/shop/ShopSettingsForm";
import { MODULES, shopTabs } from "@/lib/nav/modules";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { supabaseServer } from "@/lib/supabase";
import { SETTINGS_COLUMNS, settingsFromRow } from "@/lib/shop/settings";

export const dynamic = "force-dynamic";

// Shop settings for the customer side (round 2, R3): what the storefront
// promises about pickup, delivery, returns and contact, the delivery fee
// checkout adds, and the one promotion.

export default async function ShopSettingsPage() {
  await checkPageAccess("/shop");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.shop}>
        <EmptyState title="Sign in to set up your shop." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  const db = supabaseServer();
  const [settings, places, items, biz] = await Promise.all([
    db.from("shop_settings").select(SETTINGS_COLUMNS).eq("business_id", workspace.businessId).maybeSingle(),
    db.from("location").select("name, city").eq("business_id", workspace.businessId).eq("active", true).order("created_at"),
    db.from("catalogue_item").select("id, name, kind").eq("business_id", workspace.businessId).eq("active", true).order("name").limit(300),
    db.from("business").select("shop_slug").eq("id", workspace.businessId).maybeSingle(),
  ]);

  return (
    <ModulePage identity={MODULES.shop} tabs={shopTabs(workspace.capabilities, "/shop/settings")}>
      <ShopSettingsForm
        businessId={workspace.businessId}
        // Before 0143 the table is not there yet; the form says so.
        ready={!settings.error}
        initial={settingsFromRow((settings.data ?? null) as Record<string, unknown> | null)}
        places={(places.data ?? []).map((p) => p.name as string)}
        items={(items.data ?? []).map((i) => ({ id: i.id as string, name: i.name as string, kind: (i.kind as string) ?? "product" }))}
        shopUrl={biz.data?.shop_slug ? `/s/${biz.data.shop_slug}` : null}
      />
    </ModulePage>
  );
}
