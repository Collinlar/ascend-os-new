import type { Metadata, Viewport } from "next";
import { supabaseServer } from "@/lib/supabase";
import { bookingRef, lookUpBookingLink } from "@/lib/services/booking-link";
import BookingManage, { type ManageView } from "@/components/services/BookingManage";

export const dynamic = "force-dynamic";

// A customer's own page for their booking (round 4, S2), from the Services
// customer design: when, who, where, what was paid and what is left, and,
// while the change window is open, move it or cancel it. After the visit,
// a rating only the business sees and "Book your next visit". Reached only
// through the private link they were given.

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export default async function BookingLinkPage({ params }: { params: { token: string } }) {
  const link = await lookUpBookingLink(params.token);
  if (link.state !== "ready") {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="font-heading text-xl font-extrabold text-ink-heading">
            {link.state === "unreachable" ? "We could not open your booking just now" : "This booking link has expired"}
          </h1>
          <p className="mt-2 text-[14px] text-neutral-600">
            {link.state === "unreachable" ? "Check your connection and refresh the page." : "Ask the business to send you a new link on WhatsApp."}
          </p>
        </div>
      </main>
    );
  }

  const db = supabaseServer();
  const [{ data: b }, biz, look, paid, windowHours, rating] = await Promise.all([
    db
      .from("service_booking")
      .select(
        "id, status, scheduled_start, scheduled_end, price_quoted, deposit_required, cancelled_by, cancellation_reason, deposit_to_return, deposit_returned_at, deposit_return_method, assigned_membership_id, item_id, item:item_id(name), location:location_id(name, address, city), provider:assigned_membership_id(person:person_id(full_name))"
      )
      .eq("id", link.bookingId)
      .maybeSingle(),
    db.from("business").select("name, shop_slug").eq("id", link.businessId).maybeSingle(),
    db.from("document_branding").select("phone").eq("business_id", link.businessId).maybeSingle(),
    db.rpc("booking_paid", { p_booking: link.bookingId }),
    db.rpc("booking_change_window", { p_business: link.businessId }),
    db.from("booking_rating").select("stars").eq("booking_id", link.bookingId).maybeSingle(),
  ]);
  if (!b) {
    return (
      <main className="min-h-screen bg-white">
        <p className="mx-auto max-w-md px-5 py-16 text-center text-neutral-600">This booking is no longer here. Ask the business on WhatsApp.</p>
      </main>
    );
  }

  // Round 4, S3: a class's seats, a home visit, a quotation request and
  // its quotation. Before 0152 these are not there.
  const extra = await db
    .from("service_booking")
    .select("model, seats, service_address, travel_fee, request_detail, quotation_document_id, item:item_id(service_attributes)")
    .eq("id", link.bookingId)
    .maybeSingle()
    .then((r) => (r.error ? null : (r.data as Record<string, unknown> | null)), () => null);
  const quotationId = (extra?.quotation_document_id as string) ?? null;
  const quotation = quotationId
    ? await db.from("document").select("number, status, total, valid_until, lines").eq("id", quotationId).maybeSingle().then((r) => r.data as Record<string, unknown> | null, () => null)
    : null;
  const attrs = ((extra?.item as { service_attributes: Record<string, unknown> | null } | null)?.service_attributes ?? {}) as Record<string, unknown>;
  const detail = (extra?.request_detail as Record<string, unknown> | null) ?? null;

  const place = b.location as unknown as { name: string; address: string | null; city: string | null } | null;
  const phone = ((look.data?.phone as string) ?? "").replace(/[^\d+]/g, "");
  const businessName = (biz.data?.name as string) ?? "The business";
  const ref = bookingRef(b.id as string);
  const view: ManageView = {
    token: params.token,
    reference: ref,
    status: b.status as string,
    start: (b.scheduled_start as string) ?? null,
    end: (b.scheduled_end as string) ?? null,
    serviceId: (b.item_id as string) ?? null,
    serviceName: (b.item as unknown as { name: string } | null)?.name ?? "Your booking",
    providerId: (b.assigned_membership_id as string) ?? null,
    providerName: (b.provider as unknown as { person: { full_name: string } | null } | null)?.person?.full_name ?? null,
    place: place ? [place.name, place.city].filter(Boolean).join(", ") : null,
    address: place ? [place.address, place.name, place.city].filter(Boolean).join(", ") : null,
    price: b.price_quoted === null ? null : Number(b.price_quoted),
    paid: Number(paid.data ?? 0),
    cancelledBy: (b.cancelled_by as string) ?? null,
    cancellationReason: (b.cancellation_reason as string) ?? null,
    depositToReturn: b.deposit_to_return === null ? null : Number(b.deposit_to_return),
    depositReturned: Boolean(b.deposit_returned_at),
    windowHours: Number(windowHours.data ?? 24),
    rated: Boolean(rating.data),
    businessName,
    slug: (biz.data?.shop_slug as string) ?? null,
    model: (extra?.model as string) ?? "fixed_slot",
    seats: Number(extra?.seats ?? 1),
    homeAddress: (extra?.service_address as string) ?? null,
    travelFee: extra?.travel_fee === null || extra?.travel_fee === undefined ? null : Number(extra.travel_fee),
    request: detail
      ? {
          occasion: (detail.occasion as string) ?? "",
          date: (detail.date as string) ?? null,
          people: (detail.people as string) ?? "",
          where: (detail.where as string) ?? "",
          note: (detail.note as string) ?? "",
          photos: Array.isArray(detail.photos) ? detail.photos.length : 0,
        }
      : null,
    quotation:
      quotation && quotation.number
        ? {
            number: quotation.number as string,
            status: quotation.status as string,
            total: Number(quotation.total ?? 0),
            validUntil: (quotation.valid_until as string) ?? null,
            lines: ((quotation.lines ?? []) as Array<Record<string, unknown>>).map((l) => ({ description: String(l.description ?? ""), quantity: Number(l.quantity ?? 1), total: Number(l.line_total ?? 0) })),
            depositPercent: attrs.deposit_percent === undefined ? 30 : Number(attrs.deposit_percent),
          }
        : null,
    whatsapp: phone.replace(/^0/, "233").replace(/^\+/, "").length >= 11 ? `https://wa.me/${phone.replace(/^0/, "233").replace(/^\+/, "")}?text=${encodeURIComponent(`Hello, about my booking ${ref}.`)}` : null,
  };

  return (
    <main className="min-h-screen bg-white">
      <BookingManage view={view} />
    </main>
  );
}
