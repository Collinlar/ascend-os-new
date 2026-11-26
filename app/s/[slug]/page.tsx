import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { openShop } from "@/lib/shop/openShop";
import Storefront, { StorefrontProduct } from "@/components/shop/Storefront";

export const dynamic = "force-dynamic";

// Customer Web storefront: opened from a WhatsApp link, QR code or Discover.
// Mobile-first, no download, no account (CHN-004, SHP-013). Only public
// business identity and visible listings are exposed here (SEC-016).

// The root layout locks zoom, which is right for a till being held in a
// queue and wrong for a stranger reading a price on their own phone.
// Pinch to zoom is how a lot of people read anything (WCAG 1.4.4), and
// this page is the one surface where the reader is not our user.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

interface ShopData {
  businessId: string;
  businessName: string;
  city: string | null;
  slug: string;
  memberSince: string | null;
  places: { name: string; city: string | null }[];
  products: StorefrontProduct[];
  /** Ascend has verified who runs it (business.identity_verification). */
  verified: boolean;
  /** It takes bookings on its booking page too. */
  bookable: boolean;
}

async function loadShop(slug: string): Promise<ShopData | null> {
  try {
    // Exists and its owner turned the shop on (shared with the layout).
    // A shop is public because its owner turned it on: every business once
    // had a storefront, including till-only ones that never asked for it.
    const business = await openShop(slug);
    if (!business) return null;
    const db = supabaseServer();

    const { data: locations } = await db
      .from("location")
      .select("name, city")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(10);
    const location = locations?.[0] ?? null;

    const { data: items } = await db
      .from("catalogue_item")
      .select(
        "id, name, description, category, base_price, currency_code, track_stock, channel_listing!inner(price_override, media, visible, channel)"
      )
      .eq("business_id", business.id)
      .eq("active", true)
      .eq("channel_listing.channel", "shop")
      .eq("channel_listing.visible", true);

    // What can still be ordered: every movement at the shop's place summed,
    // holds included, the same figure place_shop_order checks (0127). The
    // shop takes orders at the business's first place.
    const left = new Map<string, number>();
    if ((items ?? []).some((i) => i.track_stock)) {
      const { data: firstPlace } = await db
        .from("location")
        .select("id")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstPlace) {
        const [bal, held] = await Promise.all([
          db.from("stock_balance").select("item_id, quantity_on_hand").eq("location_id", firstPlace.id).is("variant_id", null),
          db.from("stock_reserved").select("item_id, quantity_reserved").eq("location_id", firstPlace.id).is("variant_id", null),
        ]);
        for (const b of bal.data ?? []) left.set(b.item_id as string, Number(b.quantity_on_hand));
        for (const r of held.data ?? []) left.set(r.item_id as string, (left.get(r.item_id as string) ?? 0) + Number(r.quantity_reserved));
      }
    }

    // The customer-facing trust facts and the best seller (Modules M6b).
    // Verified only when Ascend verified it; never a decoration.
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const [trust, services, recent] = await Promise.all([
      db.from("business").select("identity_verification").eq("id", business.id).maybeSingle(),
      db.from("catalogue_item").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("kind", "service").eq("active", true).not("base_price", "is", null),
      db
        .from("shop_order")
        .select("status, shop_order_line(item_id, quantity)")
        .eq("business_id", business.id)
        .gte("placed_at", since30)
        .in("status", ["confirmed", "preparing", "ready", "out_for_delivery", "fulfilled"])
        .limit(500),
    ]);
    const soldBy = new Map<string, number>();
    for (const o of recent.data ?? []) {
      for (const l of (o.shop_order_line ?? []) as unknown as Array<{ item_id: string; quantity: number }>) {
        soldBy.set(l.item_id, (soldBy.get(l.item_id) ?? 0) + Number(l.quantity));
      }
    }
    const best = Array.from(soldBy.entries()).sort((a, b) => b[1] - a[1])[0];
    // A best seller has to have sold more than a handful, or it is noise.
    const bestId = best && best[1] >= 3 ? best[0] : null;

    const products: StorefrontProduct[] = (items ?? []).flatMap((item) => {
      const listing = (item.channel_listing as unknown as Array<{
        price_override: number | null;
        media: string[];
      }>)[0];
      const price = listing?.price_override ?? item.base_price;
      if (price === null || price === undefined) return [];
      return [
        {
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          price: Number(price),
          image: listing?.media?.[0] ?? null,
          ...(item.track_stock ? { left: Math.max(0, Math.floor(left.get(item.id) ?? 0)) } : {}),
          ...(item.id === bestId ? { bestseller: true } : {}),
        },
      ];
    });

    return {
      businessId: business.id,
      businessName: business.name,
      city: location?.city ?? null,
      slug: business.shop_slug,
      memberSince: (business.created_at as string | null) ?? null,
      places: (locations ?? []).map((l) => ({ name: l.name as string, city: (l.city as string | null) ?? null })),
      products,
      verified: trust.data?.identity_verification === "verified",
      bookable: (services.count ?? 0) > 0,
    };
  } catch {
    return null;
  }
}

// Almost every visit to this page starts as a link pasted into WhatsApp,
// where the preview card is the shop's first impression. Without these the
// card shows the platform's own title, so every merchant's link looks the
// same and none of them look like a shop.
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const shop = await loadShop(params.slug);
  if (!shop) return { title: "Shop not found" };

  const where = shop.city ? ` in ${shop.city}` : "";
  const description =
    shop.products.length > 0
      ? `Order ${shop.products.length} ${
          shop.products.length === 1 ? "item" : "items"
        } from ${shop.businessName}${where}. Collection or delivery, confirmed on WhatsApp.`
      : `${shop.businessName}${where} takes orders online.`;

  return {
    title: `${shop.businessName} · Order online`,
    description,
    openGraph: {
      title: shop.businessName,
      description,
      type: "website",
    },
    // A shop page belongs to the merchant, not to search engines indexing
    // the platform. Left indexable so Discover and Google can find it.
    robots: { index: true, follow: true },
  };
}

export default async function ShopPage({
  params,
}: {
  params: { slug: string };
}) {
  const shop = await loadShop(params.slug);
  if (!shop) notFound();

  return (
    <Storefront
      slug={shop.slug}
      businessName={shop.businessName}
      city={shop.city}
      memberSince={shop.memberSince}
      places={shop.places}
      products={shop.products}
      verified={shop.verified}
      bookable={shop.bookable}
    />
  );
}
