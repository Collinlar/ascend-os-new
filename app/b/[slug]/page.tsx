import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import BookingFlow, {
  type BookableService,
  type Provider,
} from "@/components/services/BookingFlow";

export const dynamic = "force-dynamic";

// Customer Web booking page, opened from a WhatsApp link or QR code. No
// account, no download (SRV-005, CHN-004).

async function load(slug: string) {
  try {
    const db = supabaseServer();
    const { data: business } = await db
      .from("business")
      .select("id, name, shop_slug")
      .eq("shop_slug", slug)
      .maybeSingle();
    if (!business) return null;

    // A booking page is public because its owner asked for one. Every
    // business got a shop_slug the moment it was created, and nothing here
    // ever checked, so thirty businesses that only wanted a till had a
    // live booking page they were never told about and could not take
    // down. A stranger could book their time.
    const access = await effectiveAccess(business.id).catch(() => null);
    if (!access?.capabilities.has("services.bookings")) return null;

    const { data: location } = await db
      .from("location")
      .select("city")
      .eq("business_id", business.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    const { data: items } = await db
      .from("catalogue_item")
      .select("id, name, description, base_price, service_attributes")
      .eq("business_id", business.id)
      .eq("kind", "service")
      .eq("active", true);

    // Only staff with published availability can be booked (SRV-004).
    const { data: availability } = await db
      .from("staff_availability")
      .select("membership_id")
      .eq("business_id", business.id);

    const providerIds = Array.from(
      new Set((availability ?? []).map((a) => a.membership_id as string))
    );

    let providers: Provider[] = [];
    if (providerIds.length > 0) {
      const { data: memberships } = await db
        .from("business_membership")
        .select("id, person:person_id(full_name)")
        .in("id", providerIds)
        .eq("status", "active");
      providers = (memberships ?? []).map((m) => ({
        membershipId: m.id as string,
        name:
          (m.person as unknown as { full_name: string } | null)?.full_name ?? "Our team",
      }));
    }

    const services: BookableService[] = (items ?? []).map((item) => {
      const attrs = (item.service_attributes ?? {}) as Record<string, unknown>;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.base_price === null ? null : Number(item.base_price),
        durationMinutes: Number(attrs.duration_minutes ?? 60),
        depositAmount: attrs.deposit_amount ? Number(attrs.deposit_amount) : null,
      };
    });

    return {
      businessName: business.name,
      city: location?.city ?? null,
      slug: business.shop_slug as string,
      services,
      providers,
    };
  } catch {
    return null;
  }
}

export default async function BookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await load(params.slug);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-line">
        <div className="mx-auto max-w-md px-5 py-6">
          <h1 className="text-2xl font-semibold leading-display text-ink">
            {data.businessName}
          </h1>
          {data.city && <p className="mt-1 text-sm text-ink-muted">{data.city}</p>}
          <p className="mt-2 text-sm text-ink-muted">
            Pick what you need and a time that works. They will confirm on
            WhatsApp.
          </p>
        </div>
      </header>

      <BookingFlow
        slug={data.slug}
        businessName={data.businessName}
        services={data.services}
        providers={data.providers}
      />
    </main>
  );
}
