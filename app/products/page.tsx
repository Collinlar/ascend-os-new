import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { currentWorkspace } from "@/lib/nav/workspace";
import ProductManager from "@/components/catalogue/ProductManager";
import type { StockRow } from "@/app/api/catalogue/items/route";

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
    const { data: membership } = await db
      .from("business_membership")
      .select("business_id")
      .eq("person_id", personId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
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
        })
      ),
    };
  } catch {
    return { kind: "failed" };
  }
}

export default async function Products() {
  const data = await load();

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">What you sell</h1>
          <p className="text-sm text-mid-grey">
            Set your prices, add barcodes so the till can scan, and keep your
            counts honest.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data.kind === "no_session" && (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to manage your products.
          </p>
        )}
        {data.kind === "no_business" && (
          <p className="py-16 text-center text-mid-grey">
            Set up your business first, then your products live here.
          </p>
        )}
        {data.kind === "failed" && (
          <p className="rounded-panel bg-gold-light px-4 py-6 text-center text-sm text-gold-dark">
            We could not load your products just now. Refresh in a moment.
          </p>
        )}
        {data.kind === "ok" && (
          <ProductManager
            businessId={data.businessId}
            locationId={data.locationId}
            items={data.items}
            sellsOnline={data.sellsOnline}
          />
        )}
      </div>
    </main>
  );
}
