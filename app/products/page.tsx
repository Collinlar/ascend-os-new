import { ModulePage } from "@/components/shell/Module";
import { MODULES, inventoryTabs } from "@/lib/nav/modules";
import { currentWorkspace, earns } from "@/lib/nav/workspace";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import ProductManager from "@/components/catalogue/ProductManager";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import type { StockRow } from "@/app/api/catalogue/items/route";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Everything the merchant sells, and what is left of it. The same catalogue
// the till reads, so a price changed here reaches the counter on the next
// sync rather than being entered twice.

// A failed query and a missing session are different problems with
// different fixes, and telling a merchant to sign in when the database is
// unreachable sends them somewhere that cannot help.
type LoadResult =
  | {
      kind: "ok";
      businessId: string;
      locationId: string;
      items: StockRow[];
      sellsOnline: boolean;
    }
  | { kind: "no_session" }
  | { kind: "no_business" }
  | { kind: "failed" };

async function load(): Promise<LoadResult> {
  try {
    const personId = await currentPersonId();
    if (!personId) return { kind: "no_session" };

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return { kind: "no_business" };

    const { data: location } = await db
      .from("location")
      .select("id")
      .eq("business_id", membership.business_id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!location) return { kind: "no_business" };

    const { data, error } = await db.rpc("business_stock_levels", {
      p_business: membership.business_id,
      p_location: location.id,
    });
    if (error) return { kind: "failed" };

    // The editor shows Shop fields only to a business that has Shop, the
    // same way the navigation does. Minimal without hiding anything owned.
    const workspace = await currentWorkspace().catch(() => null);

    // Sizes for each product (round 2, R4).
    const ids = (data ?? []).map((r: { item_id: string }) => r.item_id);
    const sizesBy = new Map<string, Array<{ id: string; name: string; priceDelta: number }>>();
    if (ids.length) {
      const { data: variants } = await db
        .from("item_variant")
        .select("id, item_id, name, price_delta")
        .in("item_id", ids)
        .eq("active", true)
        .order("name");
      for (const v of variants ?? []) {
        const list = sizesBy.get(v.item_id as string) ?? [];
        list.push({ id: v.id as string, name: v.name as string, priceDelta: Number(v.price_delta) });
        sizesBy.set(v.item_id as string, list);
      }
    }

    // The product's own sections (round 4, S1). Before 0150 there are none.
    const detailsBy = new Map<string, { use: string; inside: string; goodFor: string }>();
    if (ids.length) {
      const { data: rows, error: detailsError } = await db.from("catalogue_item").select("id, how_to_use, what_is_inside, good_for").in("id", ids);
      if (!detailsError) {
        for (const r of (rows ?? []) as Array<Record<string, string | null>>) {
          detailsBy.set(r.id as string, { use: r.how_to_use ?? "", inside: r.what_is_inside ?? "", goodFor: r.good_for ?? "" });
        }
      }
    }

    return {
      kind: "ok" as const,
      businessId: membership.business_id,
      locationId: location.id,
      sellsOnline: workspace?.capabilities.has("shop.storefront") ?? false,
      items: (data ?? []).map(
        (row: {
          item_id: string;
          name: string;
          category: string | null;
          base_price: string | number | null;
          description?: string | null;
          photo_url?: string | null;
          shop_visible?: boolean | null;
          shop_price_override?: string | number | null;
          barcode: string | null;
          track_stock: boolean;
          active: boolean;
          low_stock_threshold: string | number | null;
          quantity_on_hand: string | number;
          last_movement_at: string | null;
        }) => ({
          itemId: row.item_id,
          name: row.name,
          description: row.description ?? null,
          photoUrl: row.photo_url ?? null,
          category: row.category,
          price: row.base_price === null ? null : Number(row.base_price),
          barcode: row.barcode,
          trackStock: row.track_stock,
          active: row.active,
          lowStockThreshold:
            row.low_stock_threshold === null ? null : Number(row.low_stock_threshold),
          quantityOnHand: Number(row.quantity_on_hand),
          lastMovementAt: row.last_movement_at,
          shopVisible: row.shop_visible ?? null,
          shopPriceOverride:
            row.shop_price_override === null || row.shop_price_override === undefined
              ? null
              : Number(row.shop_price_override),
          sizes: sizesBy.get(row.item_id) ?? [],
          details: detailsBy.get(row.item_id),
        })
      ),
    };
  } catch {
    return { kind: "failed" };
  }
}

export default async function Products() {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/products");

  const data = await load();
  // Inside Inventory as its Products tab when the business counts stock;
  // its own screen when it only sells.
  const caps = (await currentWorkspace().catch(() => null))?.capabilities ?? new Set<string>();
  const inInventory = earns(caps, "/inventory");

  return (
    <ModulePage
      identity={inInventory ? MODULES.inventory : MODULES.products}
      title="Products"
      tabs={inInventory ? inventoryTabs(caps, "products") : []}
      action={data.kind === "ok" && data.items.length > 0 ? (
            <>
              {data.items.some((i) => i.trackStock) && (
                <Link href="/inventory" className={secondaryAction}>
                  <Icon name="box" size={16} />
                  See my stock
                </Link>
              )}
              <Link href="/products/add" className={primaryAction}>
                <Icon name="plus" size={16} />
                Add a product
              </Link>
            </>
          ) : null}
    >

      {data.kind === "no_session" && (
        <EmptyState
          title="Sign in to manage your products."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      )}
      {data.kind === "no_business" && (
        <EmptyState
          title="Set up your business first."
          detail="Your products live here once it exists."
        />
      )}
      {data.kind === "failed" && (
        <EmptyState
          title="We could not load your products just now."
          detail="Refresh in a moment."
        />
      )}
      {data.kind === "ok" && (
        <ProductManager
          businessId={data.businessId}
          locationId={data.locationId}
          items={data.items}
          sellsOnline={data.sellsOnline}
        />
      )}
    </ModulePage>
  );
}
