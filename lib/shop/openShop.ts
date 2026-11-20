import { cache } from "react";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";

export interface OpenShop {
  id: string;
  name: string;
  shop_slug: string;
  created_at: string | null;
}

/**
 * The business behind a storefront link, or null when there is none or its
 * owner has not turned the shop on. Cached per request, so the layout's
 * check and the page's load share one lookup.
 */
export const openShop = cache(async (slug: string): Promise<OpenShop | null> => {
  try {
    const { data: business } = await supabaseServer()
      .from("business")
      .select("id, name, shop_slug, created_at")
      .eq("shop_slug", slug)
      .maybeSingle();
    if (!business) return null;
    const access = await effectiveAccess(business.id).catch(() => null);
    if (!access?.capabilities.has("shop.storefront")) return null;
    return business as OpenShop;
  } catch {
    return null;
  }
});
