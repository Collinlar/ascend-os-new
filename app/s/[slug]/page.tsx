import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
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
  themeColor: "#0F2438",
};

interface ShopData {
  businessId: string;
  businessName: string;
  city: string | null;
  slug: string;
  products: StorefrontProduct[];
}

async function loadShop(slug: string): Promise<ShopData | null> {
  try {
    const db = supabaseServer();
    const { data: business } = await db
      .from("business")
      .select("id, name, shop_slug")
      .eq("shop_slug", slug)
      .maybeSingle();
    if (!business) return null;

    // A shop is public because its owner turned it on. Every business had a
    // storefront the moment it was created, including ones that only ever
    // wanted a till: a page they were never told about, could not find, and
    // had no way to take down. A stranger could order from it.
    const access = await effectiveAccess(business.id).catch(() => null);
    if (!access?.capabilities.has("shop.storefront")) return null;

    const { data: location } = await db
      .from("location")
      .select("city")
      .eq("business_id", business.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    const { data: items } = await db
      .from("catalogue_item")
      .select(
        "id, name, description, category, base_price, currency_code, channel_listing!inner(price_override, media, visible, channel)"
      )
      .eq("business_id", business.id)
      .eq("active", true)
      .eq("channel_listing.channel", "shop")
      .eq("channel_listing.visible", true);

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
        },
      ];
    });

    return {
      businessId: business.id,
      businessName: business.name,
      city: location?.city ?? null,
      slug: business.shop_slug,
      products,
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
      products={shop.products}
    />
  );
}
