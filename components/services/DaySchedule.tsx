import Link from "next/link";
import { formatGHS } from "@/lib/money";
import { toneOf, type DayBooking, type DayColumn, type DayTone } from "@/lib/services/day";
import { Avatar } from "@/components/shell/Parts";

// The day, person by person (Modules M4). On a desktop a column each, the
// bookings placed at their hour and coloured by where they stand; on a phone
// the same day as one list in time order, because seven columns on a 375px
// screen are seven slivers.

const HOUR = 60; // pixels for an hour

const TONE: Record<DayTone, { box: string; label: string }> = {
  paid: { box: "border-l-teal bg-teal-50 text-teal-800", label: "Deposit paid" },
  awaiting: { box: "border-l-gold bg-gold-100 text-gold-700", label: "Awaiting deposit" },
  booked: { box: "border-l-info bg-info-light text-info-ink", label: "Booked" },
  requested: { box: "border-l-neutral-400 border-dashed bg-white text-neutral-700", label: "Request" },
  done: { box: "border-l-neutral-400 bg-neutral-100 text-neutral-600", label: "Done" },
  no_show: { box: "border-l-danger bg-danger-tint text-danger-ink", label: "No-show" },
  cancelled: { box: "border-l-neutral-300 bg-white text-neutral-600", label: "Cancelled" },
};

export const LEGEND: DayTone[] = ["paid", "awaiting", "booked", "requested", "no_show", "done"];

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });
const hourOf = (iso: string) => {
  const d = new Date(iso);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

function Block({ b, top, height }: { b: DayBooking; top: number; height: number }) {
  const tone = TONE[toneOf(b)];
  return (
    <Link
      href={`/bookings/${b.id}`}
      className={`tap absolute inset-x-1 flex flex-col gap-px overflow-hidden rounded-[10px] border border-l-4 border-transparent px-2.5 py-1.5 text-left hover:brightness-[0.98] ${tone.box}`}
      style={{ top, height: Math.max(height, 40) }}
    >
      <span className="truncate text-[11.5px] font-bold">
        {clock(b.start)} · {tone.label}
      </span>
      <span className="truncate text-[13px] font-semibold text-ink">{b.customer}</span>
      {height >= 58 && <span className="truncate text-xs">{b.service}</span>}
    </Link>
  );
}

export default function DaySchedule({ columns, day }: { columns: DayColumn[]; day: string }) {
  const all = columns.flatMap((c) => c.bookings).filter((b) => b.status !== "cancelled");
  // The hours worth drawing: 8 to 18, stretched to fit what is booked.
  const first = Math.min(8, ...all.map((b) => Math.floor(hourOf(b.start))));
  const last = Math.max(18, ...all.map((b) => Math.ceil(b.end ? hourOf(b.end) : hourOf(b.start) + 1)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const dayStart = new Date(`${day}T00:00:00Z`).getTime();
  const pos = (iso: string) => Math.max(0, ((new Date(iso).getTime() - dayStart) / 3600e3 - first) * HOUR);

  if (columns.length === 0) {
    return (
      <div className="rounded-[20px] border border-line-brand bg-white px-6 py-12 text-center">
        <p className="font-heading text-base font-bold text-ink-heading">Nothing booked this day.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">Share your booking link on WhatsApp and bookings land here, in each person&apos;s column.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: a column a person. */}
      <div className="hidden overflow-hidden rounded-[20px] border border-line-brand bg-white lg:block">
        <div className="flex border-b border-neutral-100">
          <span className="w-14 flex-none" />
          {columns.map((c) => (
            <div key={c.membershipId ?? "nobody"} className="flex min-w-0 flex-1 items-center gap-2 border-l border-neutral-100 px-3 py-2.5">
              {c.membershipId ? <Avatar name={c.name} size={28} /> : <span className="h-7 w-7 flex-none rounded-full border-2 border-dashed border-neutral-300" />}
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-[13px] text-ink">{c.name}</strong>
                <span className="text-xs text-neutral-600">
                  {c.bookings.filter((b) => b.status !== "cancelled").length} booking{c.bookings.filter((b) => b.status !== "cancelled").length === 1 ? "" : "s"}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          <div className="relative flex" style={{ height: hours.length * HOUR }}>
            <div className="w-14 flex-none">
              {hours.map((h) => (
                <div key={h} className="relative border-t border-neutral-100" style={{ height: HOUR }}>
                  <span className="absolute -top-2 right-2 bg-white px-0.5 text-[11px] text-neutral-600">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {columns.map((c) => (
              <div key={c.membershipId ?? "nobody"} className="relative min-w-0 flex-1 border-l border-neutral-100">
                {hours.map((h) => (
                  <div key={h} className="border-t border-neutral-100" style={{ height: HOUR }} />
                ))}
                {c.away.map((a, i) => {
                  const top = pos(a.from < `${day}T00:00:00Z` ? `${day}T00:00:00Z` : a.from);
                  const bottom = Math.min(hours.length * HOUR, pos(a.to));
                  return (
                    <div
                      key={i}
                      className="absolute inset-x-1 flex items-start rounded-[10px] bg-[repeating-linear-gradient(135deg,#F3F4F6_0_8px,#ffffff_8px_16px)] px-2.5 py-1.5 text-[11.5px] font-semibold text-neutral-600"
                      style={{ top, height: Math.max(bottom - top, 24) }}
                    >
                      Away
                    </div>
                  );
                })}
                {c.bookings
                  .filter((b) => b.status !== "cancelled")
                  .map((b) => {
                    const top = pos(b.start);
                    const end = b.end ? pos(b.end) : top + HOUR;
                    return <Block key={b.id} b={b} top={top} height={end - top - 2} />;
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Phone: the day as one list. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {all.length === 0 && (
          <p className="rounded-[18px] border border-line-brand bg-white px-4 py-5 text-sm text-neutral-600">Nothing booked this day.</p>
        )}
        {all
          .slice()
          .sort((a, b) => (a.start < b.start ? -1 : 1))
          .map((b) => {
            const tone = TONE[toneOf(b)];
            const who = columns.find((c) => c.membershipId === b.providerId);
            return (
              <Link key={b.id} href={`/bookings/${b.id}`} className={`tap flex items-center gap-3 rounded-[14px] border border-l-4 border-transparent px-3.5 py-3 ${tone.box}`}>
                <strong className="num w-12 flex-none text-[13px] text-ink">{clock(b.start)}</strong>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{b.customer}</span>
                  <span className="truncate text-xs">
                    {b.service}
                    {who ? ` · ${who.name}` : ""}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end">
                  <span className="text-[11.5px] font-bold">{tone.label}</span>
                  {b.price !== null && <span className="num text-xs text-ink">{formatGHS(b.price)}</span>}
                </span>
              </Link>
            );
          })}
      </div>
    </>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-600">
      {LEGEND.map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span aria-hidden className={`h-3 w-3 rounded-[3px] border border-l-4 border-transparent ${TONE[t].box}`} />
          {TONE[t].label}
        </span>
      ))}
    </div>
  );
}
