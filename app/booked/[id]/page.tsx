import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

// Where a customer lands after paying a deposit. Deliberately minimal: it
// confirms their own booking and nothing about the business's other work.

async function load(bookingId: string) {
  try {
    const db = supabaseServer();
    const { data } = await db
      .from("service_booking")
      .select(
        "id, status, scheduled_start, deposit_required, deposit_paid, price_quoted, business:business_id(name), item:item_id(name)"
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!data) return null;

    return {
      status: data.status as string,
      scheduledStart: data.scheduled_start as string | null,
      depositRequired: Number(data.deposit_required ?? 0),
      depositPaid: Number(data.deposit_paid ?? 0),
      price: data.price_quoted === null ? null : Number(data.price_quoted),
      businessName:
        (data.business as unknown as { name: string } | null)?.name ?? "The business",
      serviceName: (data.item as unknown as { name: string } | null)?.name ?? "Service",
    };
  } catch {
    return null;
  }
}

export default async function Booked({ params }: { params: { id: string } }) {
  const booking = await load(params.id);
  if (!booking) notFound();

  const outstanding = booking.depositRequired - booking.depositPaid;
  const settled = booking.depositRequired > 0 && outstanding <= 0;
  const released = booking.status === "cancelled";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-16">
      <div className="w-full max-w-sm text-center">
        {released ? (
          <>
            <p className="text-4xl">⏳</p>
            <h1 className="mt-4 font-heading text-[26px] font-extrabold text-ink-heading">
              That time was released.
            </h1>
            <p className="mt-3 text-neutral-600">
              The deposit did not arrive in time, so the slot went back on the
              calendar. Book another time and it is yours.
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl">{settled ? "✅" : "📅"}</p>
            <h1 className="mt-4 font-heading text-[26px] font-extrabold text-ink-heading">
              {settled ? "Your booking is secured." : "You are booked."}
            </h1>
            <p className="mt-3 text-neutral-600">
              {booking.serviceName} with {booking.businessName}
              {booking.scheduledStart && ` on ${formatWhen(booking.scheduledStart)}`}.
            </p>

            {booking.depositRequired > 0 && (
              <p className="mt-4 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                {settled ? (
                  <>
                    Deposit of {formatGHS(booking.depositPaid)} received.
                    {booking.price !== null &&
                      booking.price > booking.depositPaid &&
                      ` Balance of ${formatGHS(booking.price - booking.depositPaid)} on the day.`}
                  </>
                ) : (
                  <>
                    Waiting on your {formatGHS(outstanding)} deposit. If it has
                    just been sent, give it a moment and refresh.
                  </>
                )}
              </p>
            )}

            <p className="mt-6 text-sm text-neutral-600">
              {businessMessage(settled)}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function businessMessage(settled: boolean): string {
  return settled
    ? "They will message you on WhatsApp if anything changes."
    : "They will confirm on WhatsApp once the deposit lands.";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })} at ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`;
}
