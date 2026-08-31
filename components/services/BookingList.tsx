"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState } from "@/components/shell/Page";

// The provider's schedule, built on the Ascend Services merchant design.
//
// Three numbers, then the week at a glance, then the decisions. What needs
// an answer comes first, because a request nobody answered is a customer
// who booked somewhere else (OFF-008).

export interface OwnerBooking {
  id: string;
  status: string;
  model: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  price: number | null;
  serviceAddress: string | null;
  hasNotes: boolean;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  providerName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for you to accept",
  quoted: "Waiting on your price",
  confirmed: "Confirmed",
  in_progress: "Happening now",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "Did not turn up",
};

const NEXT_ACTION: Record<string, { to: string; label: string } | null> = {
  requested: { to: "confirmed", label: "Accept this booking" },
  quoted: { to: "confirmed", label: "Accept this booking" },
  confirmed: { to: "in_progress", label: "Start it" },
  in_progress: { to: "completed", label: "Mark done" },
  completed: null,
  cancelled: null,
  no_show: null,
};

const OPEN = ["requested", "quoted", "confirmed", "in_progress"];
const WAITING = ["requested", "quoted"];

// One colour per provider, so a week reads by who rather than by squinting.
const PROVIDER_COLOURS = [
  { bg: "#E4F0EC", ink: "#0B6F65" },
  { bg: "#E7EEF6", ink: "#3F6494" },
  { bg: "#F0EAF6", ink: "#6B4F8F" },
  { bg: "#FBEFD8", ink: "#8A5710" },
  { bg: "#FBECE4", ink: "#A44A26" },
];

const DAY_MS = 86_400_000;

export default function BookingList({ bookings }: { bookings: OwnerBooking[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  async function act(id: string, to: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/services/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: to }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not update this booking. Tap again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const waiting = bookings.filter((b) => WAITING.includes(b.status));
  const upcoming = bookings.filter(
    (b) => OPEN.includes(b.status) && !WAITING.includes(b.status)
  );
  const settled = bookings.filter((b) => !OPEN.includes(b.status));

  const potential = waiting.reduce((sum, b) => sum + (b.price ?? 0), 0);

  // Everybody with something in the diary, in a stable order so a colour
  // does not move from one render to the next.
  const providers = useMemo(() => {
    const names = Array.from(
      new Set(bookings.map((b) => b.providerName).filter(Boolean) as string[])
    ).sort();
    return new Map(names.map((n, i) => [n, PROVIDER_COLOURS[i % PROVIDER_COLOURS.length]]));
  }, [bookings]);

  // Monday of the week being shown.
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
    const placed = bookings.filter(
      (b) =>
        b.scheduledStart &&
        OPEN.includes(b.status) &&
        new Date(b.scheduledStart) >= weekStart &&
        new Date(b.scheduledStart) < new Date(weekStart.getTime() + 7 * DAY_MS)
    );

    // The grid only covers the hours something actually happens in, so an
    // empty evening is not eight rows of nothing.
    let from = 9;
    let to = 17;
    for (const b of placed) {
      const start = new Date(b.scheduledStart as string);
      const end = b.scheduledEnd ? new Date(b.scheduledEnd) : start;
      from = Math.min(from, start.getHours());
      to = Math.max(to, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
    }
    return { days, placed, from, to };
  }, [bookings, weekStart]);

  const hourHeight = 56;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      <section className="grid gap-3.5 sm:grid-cols-3">
        <Stat
          label="Waiting on you"
          value={String(waiting.length)}
          note={waiting.length === 0 ? "Nothing to answer" : "New booking requests"}
          tone={waiting.length > 0 ? "gold" : "plain"}
        />
        <Stat
          label="Coming up"
          value={String(upcoming.length)}
          note={upcoming.length === 0 ? "Nothing in the diary" : "Accepted and ahead of you"}
        />
        <Stat
          label="If you accept them all"
          value={formatGHS(potential)}
          note="Value of what is waiting"
          tone="teal"
        />
      </section>

      {/* The week, on a screen with room for it. A seven column grid on a
          375px phone is a grid nobody can read, so the phone gets the
          lists below instead, which say the same thing in order. */}
      <section className="hidden lg:block">
        <div className="mb-3.5 flex items-center gap-3">
          <div className="flex gap-1">
            <Arrow direction="back" onClick={() => setWeekOffset((w) => w - 1)} />
            <Arrow direction="forward" onClick={() => setWeekOffset((w) => w + 1)} />
          </div>
          <p className="text-sm font-bold text-ink">
            {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to{" "}
            {new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="tap rounded-chip px-3 text-[13px] font-bold text-teal-dark hover:bg-teal-light"
            >
              This week
            </button>
          )}
          <span className="flex-1" />
          <div className="flex flex-wrap items-center gap-3.5">
            {Array.from(providers.entries()).map(([name, colour]) => (
              <span key={name} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  style={{ backgroundColor: colour.ink }}
                  className="h-2.5 w-2.5 rounded-[3px]"
                />
                <span className="text-[11.5px] font-semibold text-ink-muted">{name}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex overflow-hidden rounded-panel border border-line-soft bg-white">
          <div className="w-14 flex-none border-r border-[#EEF3F7] pt-11">
            {Array.from({ length: week.to - week.from }, (_, i) => (
              <div key={i} className="relative" style={{ height: hourHeight }}>
                <span className="num absolute -top-2 right-2.5 text-[10.5px] font-semibold text-slate-grey">
                  {String(week.from + i).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-1">
            {week.days.map((day) => {
              const today = day.toDateString() === new Date().toDateString();
              const onThisDay = week.placed.filter(
                (b) =>
                  new Date(b.scheduledStart as string).toDateString() === day.toDateString()
              );
              return (
                <div key={day.toISOString()} className="flex-1 border-r border-[#EEF3F7] last:border-r-0">
                  <div
                    className={`flex h-11 flex-col items-center justify-center border-b border-[#EEF3F7] ${
                      today ? "bg-teal-light" : ""
                    }`}
                  >
                    <span
                      className={`text-[10.5px] font-bold uppercase tracking-[0.04em] ${
                        today ? "text-teal-dark" : "text-slate-grey"
                      }`}
                    >
                      {day.toLocaleDateString("en-GB", { weekday: "short" })}
                    </span>
                    <span
                      className={`num text-[15px] font-extrabold ${
                        today ? "text-teal-dark" : "text-ink"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div
                    className="relative"
                    style={{ height: (week.to - week.from) * hourHeight }}
                  >
                    {Array.from({ length: week.to - week.from }, (_, i) => (
                      <div
                        key={i}
                        className="border-b border-[#F4F8FA]"
                        style={{ height: hourHeight }}
                      />
                    ))}

                    {onThisDay.map((b) => {
                      const start = new Date(b.scheduledStart as string);
                      const end = b.scheduledEnd
                        ? new Date(b.scheduledEnd)
                        : new Date(start.getTime() + 3_600_000);
                      const top =
                        (start.getHours() - week.from + start.getMinutes() / 60) * hourHeight;
                      const height = Math.max(
                        22,
                        ((end.getTime() - start.getTime()) / 3_600_000) * hourHeight - 3
                      );
                      const colour =
                        providers.get(b.providerName ?? "") ?? PROVIDER_COLOURS[0];
                      return (
                        <div
                          key={b.id}
                          title={`${b.customerName} · ${b.serviceName}`}
                          style={{
                            top,
                            height,
                            backgroundColor: colour.bg,
                            borderLeft: `3px solid ${colour.ink}`,
                          }}
                          className="absolute inset-x-1 overflow-hidden rounded-[7px] px-1.5 py-1"
                        >
                          <p
                            style={{ color: colour.ink }}
                            className="truncate text-[11px] font-extrabold"
                          >
                            {b.customerName}
                          </p>
                          <p
                            style={{ color: colour.ink }}
                            className="truncate text-[10px] font-semibold opacity-80"
                          >
                            {b.serviceName}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            Waiting for your answer
          </h2>
          <div className="flex flex-col gap-3.5">
            {waiting.map((b) => (
              <Card key={b.id} booking={b} busy={busy === b.id} onAct={act} waiting />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            Coming up
          </h2>
          <div className="flex flex-col gap-3.5">
            {upcoming.map((b) => (
              <Card key={b.id} booking={b} busy={busy === b.id} onAct={act} />
            ))}
          </div>
        </section>
      )}

      {waiting.length === 0 && upcoming.length === 0 && (
        <EmptyState
          title="Nothing in the diary."
          detail="Share your booking link and the next request lands here."
        />
      )}

      {settled.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
            Settled
          </h2>
          <div className="flex flex-col gap-2.5">
            {settled.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-[15px] border border-line-soft bg-white px-[18px] py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold text-ink">
                    {b.customerName}
                  </p>
                  <p className="text-xs font-medium text-slate-grey">
                    {b.serviceName} · {STATUS_LABEL[b.status] ?? b.status}
                  </p>
                </div>
                {b.price !== null && (
                  <p className="num flex-none text-[14.5px] font-bold text-ink">
                    {formatGHS(b.price)}
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

function Card({
  booking,
  busy,
  onAct,
  waiting = false,
}: {
  booking: OwnerBooking;
  busy: boolean;
  onAct: (id: string, to: string) => void;
  waiting?: boolean;
}) {
  const next = NEXT_ACTION[booking.status];

  return (
    <article
      className={`rounded-[18px] border border-line-soft bg-white px-[19px] py-[17px] shadow-lift ${
        waiting ? "border-l-4 border-l-gold-rule" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden
            className="flex h-12 w-12 flex-none items-center justify-center rounded-[13px] bg-light-grey text-[15px] font-extrabold text-ink-slate"
          >
            {booking.customerName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-[15.5px] font-extrabold text-ink">
                {booking.customerName}
              </p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${
                  waiting ? "bg-gold-tint text-gold-ink" : "bg-teal-light text-teal-dark"
                }`}
              >
                {STATUS_LABEL[booking.status] ?? booking.status}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-ink-muted">
              {booking.serviceName}
              {booking.scheduledStart &&
                ` · ${new Date(booking.scheduledStart).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })} at ${new Date(booking.scheduledStart)
                  .toLocaleTimeString("en-GB", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  .replace(" ", "")}`}
            </p>
            {booking.providerName && (
              <p className="mt-0.5 text-[12.5px] font-medium text-slate-grey">
                With {booking.providerName}
              </p>
            )}
            {booking.serviceAddress && (
              <p className="mt-0.5 text-[12.5px] font-medium text-slate-grey">
                {booking.serviceAddress}
              </p>
            )}
          </div>
        </div>
        {booking.price !== null && (
          <p className="num flex-none text-[19px] font-extrabold tracking-[-0.02em] text-ink">
            {formatGHS(booking.price)}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {next && (
          <button
            onClick={() => onAct(booking.id, next.to)}
            disabled={busy}
            className="tap flex items-center rounded-control bg-teal px-[22px] text-[13.5px] font-bold text-white hover:bg-teal-hover disabled:opacity-60"
          >
            {busy ? "Working..." : next.label}
          </button>
        )}
        {booking.customerPhone && (
          <a
            href={`https://wa.me/${booking.customerPhone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            className="tap flex items-center gap-2 rounded-control border border-teal-pale px-[18px] text-[13.5px] font-bold text-teal-dark hover:bg-teal-light"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#25D366]" />
            Message on WhatsApp
          </a>
        )}
        <span className="flex-1" />
        <button
          onClick={() => onAct(booking.id, "cancelled")}
          disabled={busy}
          className="tap px-2 text-[13px] font-semibold text-slate-grey hover:text-danger-ink disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "plain" | "gold" | "teal";
}) {
  return (
    <div
      className={`rounded-panel border px-[19px] py-[17px] ${
        tone === "gold"
          ? "border-gold-tint bg-gold-light"
          : "border-line-soft bg-white shadow-card"
      }`}
    >
      <p
        className={`text-[11.5px] font-semibold uppercase tracking-[0.04em] ${
          tone === "gold" ? "text-gold-ink" : "text-slate-grey"
        }`}
      >
        {label}
      </p>
      <p
        className={`num mt-1 text-[25px] font-extrabold ${
          tone === "gold"
            ? "text-gold-ink"
            : tone === "teal"
              ? "text-teal-dark"
              : "text-ink"
        }`}
      >
        {value}
      </p>
      <p
        className={`text-[11.5px] font-medium ${
          tone === "gold" ? "text-gold-ink" : "text-slate-grey"
        }`}
      >
        {note}
      </p>
    </div>
  );
}

function Arrow({
  direction,
  onClick,
}: {
  direction: "back" | "forward";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "back" ? "Previous week" : "Next week"}
      className="tap flex h-8 w-8 items-center justify-center rounded-chip border border-line bg-white hover:bg-light-grey"
    >
      <svg width="7" height="12" viewBox="0 0 9 15" fill="none" aria-hidden>
        <polyline
          points={direction === "back" ? "7.5,1 1,7.5 7.5,14" : "1,1 7.5,7.5 1,14"}
          stroke="#5A7184"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
