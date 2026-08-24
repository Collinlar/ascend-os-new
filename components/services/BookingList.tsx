"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

export interface OwnerBooking {
  id: string;
  status: string;
  model: string;
  scheduledStart: string | null;
  price: number | null;
  serviceAddress: string | null;
  hasNotes: boolean;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
}

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for you to accept",
  quoted: "Quote sent",
  confirmed: "Confirmed",
  in_progress: "Happening now",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "Did not show up",
};

const NEXT_ACTION: Record<string, { to: string; label: string } | null> = {
  requested: { to: "confirmed", label: "Accept this booking" },
  quoted: { to: "confirmed", label: "Confirm it" },
  confirmed: { to: "in_progress", label: "Start it" },
  in_progress: { to: "completed", label: "Mark done" },
  completed: null,
  cancelled: null,
  no_show: null,
};

const OPEN = ["requested", "quoted", "confirmed", "in_progress"];

export default function BookingList({ bookings }: { bookings: OwnerBooking[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, toStatus: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/services/bookings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not update this booking. Tap again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const open = bookings.filter((b) => OPEN.includes(b.status));
  const settled = bookings.filter((b) => !OPEN.includes(b.status));

  return (
    <div className="space-y-8">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-dark">
          {error}
        </p>
      )}

      <section className="space-y-3">
        {open.map((booking) => {
          const next = NEXT_ACTION[booking.status];
          const needsAnswer = booking.status === "requested";
          return (
            <div
              key={booking.id}
              className={`bg-white px-5 py-4 ${
                needsAnswer
                  ? "border border-l-4 border-line border-l-gold"
                  : "border border-line"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{booking.serviceName}</p>
                  <p className="text-xs text-mid-grey">
                    {booking.customerName} · {STATUS_LABEL[booking.status]}
                  </p>
                </div>
                {booking.price !== null && (
                  <p className="font-semibold text-ink">{formatGHS(booking.price)}</p>
                )}
              </div>

              {booking.scheduledStart && (
                <p className="mt-2 text-sm text-ink">
                  {formatWhen(booking.scheduledStart)}
                </p>
              )}
              {booking.serviceAddress && (
                <p className="mt-1 text-sm text-mid-grey">{booking.serviceAddress}</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {next && (
                  <button
                    onClick={() => act(booking.id, next.to)}
                    disabled={busy === booking.id}
                    className="tap bg-teal px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy === booking.id ? "Working..." : next.label}
                  </button>
                )}
                {booking.customerPhone && (
                  <a
                    href={`https://wa.me/${booking.customerPhone.replace("+", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tap flex items-center border border-line px-4 text-sm font-medium text-teal-dark"
                  >
                    Message on WhatsApp
                  </a>
                )}
                {booking.status === "confirmed" && (
                  <button
                    onClick={() => act(booking.id, "no_show")}
                    disabled={busy === booking.id}
                    className="tap px-3 py-2.5 text-sm font-medium text-mid-grey disabled:opacity-60"
                  >
                    Did not show
                  </button>
                )}
                <button
                  onClick={() => act(booking.id, "cancelled")}
                  disabled={busy === booking.id}
                  className="tap px-3 py-2.5 text-sm font-medium text-mid-grey disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {settled.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-mid-grey">Past</h2>
          <div className="mt-3 space-y-2">
            {settled.map((booking) => (
              <div
                key={booking.id}
                className="flex items-baseline justify-between gap-3 border border-line bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{booking.serviceName}</p>
                  <p className="text-xs text-mid-grey">
                    {booking.customerName} · {STATUS_LABEL[booking.status]}
                  </p>
                </div>
                {booking.price !== null && (
                  <p className="text-sm font-medium text-ink">
                    {formatGHS(booking.price)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  if (today) return `Today at ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}`;
}
