import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import BookingList, { type OwnerBooking } from "@/components/services/BookingList";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// The provider's day. What is next, what needs a decision, and what is
// already settled (OFF-008).

async function load(): Promise<OwnerBooking[] | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data } = await db
      .from("service_booking")
      .select(
        "id, status, model, scheduled_start, scheduled_end, price_quoted, service_address, staff_notes, customer:customer_id(display_name, phone_e164), item:item_id(name), provider:assigned_membership_id(person:person_id(full_name))"
      )
      .eq("business_id", membership.business_id)
      .order("scheduled_start", { ascending: true, nullsFirst: false })
      .limit(50);

    return (data ?? []).map((b) => {
      const customer = b.customer as unknown as {
        display_name: string;
        phone_e164: string | null;
      } | null;
      return {
        id: b.id,
        status: b.status,
        model: b.model,
        scheduledStart: b.scheduled_start,
        scheduledEnd: b.scheduled_end,
        providerName:
          ((b.provider as unknown as { person: { full_name: string } | null } | null)
            ?.person?.full_name) ?? null,
        price: b.price_quoted === null ? null : Number(b.price_quoted),
        serviceAddress: b.service_address,
        // Staff notes stay server-side and owner-only; they are never sent
        // to a customer surface (SRV-013).
        hasNotes: Boolean(b.staff_notes),
        customerName: customer?.display_name ?? "Customer",
        customerPhone: customer?.phone_e164 ?? null,
        serviceName:
          (b.item as unknown as { name: string } | null)?.name ?? "Service",
      };
    });
  } catch {
    return null;
  }
}

export default async function Bookings() {
  const bookings = await load();

  return (
    <PageShell>
      <PageHeader
        title="Your schedule"
        intro="Requests needing an answer come first, then what is coming up."
      />

      {bookings === null ? (
        <EmptyState
          title="Sign in to see your schedule."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="Nothing booked yet."
          detail="Share your booking link on WhatsApp and your first request will land here."
        />
      ) : (
        <BookingList bookings={bookings} />
      )}
    </PageShell>
  );
}
