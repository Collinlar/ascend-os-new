import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import BookingFlow, {
  type BookableService,
  type BookingPlace,
  type Provider,
} from "@/components/services/BookingFlow";
import ReportProblem from "@/components/risk/ReportProblem";

export const dynamic = "force-dynamic";

// The root layout locks zoom, which is right for a till held in a queue and
// wrong for a stranger reading a price on their own phone. Pinch to zoom is
// how a lot of people read anything (WCAG 1.4.4), and this page is for
// somebody who is not our user.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0E1A",
};

// Customer Web booking page, opened from a WhatsApp link or QR code. No
// account, no download (SRV-005, CHN-004).

async function load(slug: string) {
  try {
    const db = supabaseServer();
    const { data: business } = await db
      .from("business")
      .select("id, name, shop_slug, identity_verification")
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

    const { data: locations } = await db
      .from("location")
      .select("id, name, address, city")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("created_at");
    const places: BookingPlace[] = (locations ?? []).map((l) => ({
      id: l.id as string,
      name: l.name as string,
      address: (l.address as string) ?? null,
      city: (l.city as string) ?? null,
    }));
    const location = places[0] ?? null;

    const { data: items } = await db
      .from("catalogue_item")
      .select("id, name, description, base_price, service_attributes, category, photo_url")
      .eq("business_id", business.id)
      .eq("kind", "service")
      .eq("active", true);

    // Only staff with published availability can be booked (SRV-004).
    const { data: availability } = await db
      .from("staff_availability")
      .select("membership_id, day_of_week, end_time, effective_from, effective_to")
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
        category: (item.category as string) || null,
        photo: (item.photo_url as string) || null,
        // How it is booked, and home service (round 4, S3).
        model: (["class_session", "quote_first"].includes(String(attrs.booking_model)) ? attrs.booking_model : "fixed_slot") as BookableService["model"],
        home: (() => {
          const h = (attrs.home ?? {}) as { enabled?: boolean; travel_fee?: number; areas?: string };
          return h.enabled ? { travelFee: Number(h.travel_fee ?? 0), areas: h.areas ?? "" } : null;
        })(),
      };
    });

    // Upcoming classes for each class service (round 4, S3). None before 0152.
    for (const s of services.filter((x) => x.model === "class_session")) {
      const { data: rows } = await db.rpc("class_sessions", { p_business: business.id, p_item: s.id }).then((r) => r, () => ({ data: [] }));
      s.sessions = ((rows ?? []) as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        startsAt: c.starts_at as string,
        endsAt: c.ends_at as string,
        seatsLeft: Number(c.seats_left),
        place: (c.place as string) ?? null,
        teacher: (c.teacher as string) ?? null,
      }));
    }

    // "Open today until 8pm": the latest anybody works today (round 4, S1).
    // Ascend keeps no opening hours, so the team's own hours say it.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    const ends = (availability ?? [])
      .filter((a) => a.day_of_week === dow && (!a.effective_from || a.effective_from <= today) && (!a.effective_to || a.effective_to >= today) && a.end_time)
      .map((a) => String(a.end_time).slice(0, 5))
      .sort();
    const last = ends[ends.length - 1];
    const openUntil = last ? hourLabel(last) : null;

    // The next free time: the shortest service, anybody, today and the next
    // few days. A handful of lookups, so the page stays quick.
    let nextFree: string | null = null;
    const shortest = services.filter((s) => s.model === "fixed_slot").sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
    if (shortest && providers.length > 0) {
      for (let i = 0; i < 4 && !nextFree; i += 1) {
        const day = new Date(Date.now() + i * 864e5).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
        const found = await Promise.all(
          providers.slice(0, 6).map((p) =>
            db
              .rpc("available_slots", { p_item_id: shortest.id, p_membership_id: p.membershipId, p_date: day })
              .then((r) => ((r.data ?? []) as Array<{ slot_start: string }>).map((s) => s.slot_start), () => [] as string[])
          )
        );
        const soonest = found.flat().filter((s) => new Date(s).getTime() > Date.now()).sort()[0];
        if (soonest) nextFree = soonest;
      }
    }

    const cities = Array.from(new Set(places.map((p) => p.city).filter(Boolean)));
    const cats = Array.from(new Set(services.map((s) => s.category).filter(Boolean))).slice(0, 4);
    const about = [cats.length ? cats.join(", ") : null, places.length > 1 ? places.map((p) => p.name).join(", ") : cities.join(", ")]
      .filter(Boolean)
      .join(". ");

    // The free-change window (round 4, S2); null before 0151.
    const windowHours = await db.rpc("booking_change_window", { p_business: business.id }).then((r) => (r.error ? null : Number(r.data)), () => null);

    return {
      windowHours,
      businessName: business.name,
      city: location?.city ?? null,
      slug: business.shop_slug as string,
      verified: business.identity_verification === "verified",
      about: about ? `${about}.` : "",
      openUntil,
      nextFree,
      places,
      services,
      providers,
    };
  } catch {
    return null;
  }
}

// Almost every visit starts as a link pasted into WhatsApp, where the
// preview card is the first thing anybody sees of this business.
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await load(params.slug);
  if (!data) return { title: "Booking page not found" };

  const where = data.city ? ` in ${data.city}` : "";
  const description =
    data.services.length > 0
      ? `Book ${data.businessName}${where}. ${data.services.length} ${
          data.services.length === 1 ? "service" : "services"
        }, confirmed on WhatsApp.`
      : `${data.businessName}${where} takes bookings online.`;

  return {
    title: `${data.businessName} · Book a time`,
    description,
    openGraph: { title: data.businessName, description, type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { service?: string };
}) {
  const data = await load(params.slug);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-white">
      <BookingFlow
        slug={data.slug}
        businessName={data.businessName}
        verified={data.verified}
        about={data.about}
        openUntil={data.openUntil}
        nextFree={data.nextFree}
        places={data.places}
        services={data.services}
        providers={data.providers}
        windowHours={data.windowHours}
        initialServiceId={searchParams.service ?? null}
      />
      {/* Clear of the booking button, which is fixed to the foot of the page. */}
      <div className="mx-auto max-w-md px-6 pb-36 lg:max-w-5xl">
        <ReportProblem source="booking" slug={data.slug} businessName={data.businessName} />
      </div>
    </main>
  );
}

/** "20:00" to "8pm", "17:30" to "5:30pm". */
function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}
