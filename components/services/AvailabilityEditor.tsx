"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DaySchedule {
  dayOfWeek: number;
  closed: boolean;
  startTime: string;
  endTime: string;
}

export interface TimeOffRow {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

interface Clash {
  bookingId: string;
  scheduledStart: string;
  customerName: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function AvailabilityEditor({
  businessId,
  initialDays,
  initialTimeOff,
}: {
  businessId: string;
  initialDays: DaySchedule[];
  initialTimeOff: TimeOffRow[];
}) {
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Time off
  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");
  const [clashes, setClashes] = useState<Clash[] | null>(null);

  function updateDay(dow: number, patch: Partial<DaySchedule>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  async function saveHours() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          days: days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            closed: d.closed,
            startTime: d.startTime,
            endTime: d.endTime,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save your hours. Tap again.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function blockTime() {
    if (!offStart || !offEnd) {
      setError("Pick the days you will be away.");
      return;
    }
    setBusy(true);
    setError(null);
    setClashes(null);
    try {
      const res = await fetch("/api/services/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          timeOff: {
            startsAt: new Date(`${offStart}T00:00:00`).toISOString(),
            endsAt: new Date(`${offEnd}T23:59:59`).toISOString(),
            reason: offReason || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not block that time. Tap again.");
        return;
      }
      setClashes(data.clashes ?? []);
      setOffStart("");
      setOffEnd("");
      setOffReason("");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTimeOff(id: string) {
    setBusy(true);
    try {
      await fetch("/api/services/availability", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeOffId: id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const openCount = days.filter((d) => !d.closed).length;

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      <section className="rounded-[18px] border border-line-soft bg-white p-6 shadow-lift">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
          Your normal week
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-grey">
          {openCount === 0
            ? "You are closed every day, so nobody can book you."
            : `Open ${openCount} day${openCount === 1 ? "" : "s"} a week.`}
        </p>

        <div className="mt-4 space-y-2">
          {days.map((day) => (
            <div
              key={day.dayOfWeek}
              className="flex flex-wrap items-center gap-3 border-b border-[#EEF3F7] py-2.5 last:border-0"
            >
              <button
                onClick={() => updateDay(day.dayOfWeek, { closed: !day.closed })}
                className={`tap w-28 shrink-0 px-1 text-left text-[15px] font-bold ${
                  day.closed ? "text-slate-grey" : "text-ink"
                }`}
              >
                {DAY_NAMES[day.dayOfWeek]}
              </button>

              {day.closed ? (
                <button
                  onClick={() => updateDay(day.dayOfWeek, { closed: false })}
                  className="tap rounded-chip px-3 text-[13px] font-bold text-teal-dark hover:bg-teal-light"
                >
                  Closed, tap to open
                </button>
              ) : (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) => updateDay(day.dayOfWeek, { startTime: e.target.value })}
                    className="num rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-teal focus:outline-none"
                    aria-label={`${DAY_NAMES[day.dayOfWeek]} opening time`}
                  />
                  <span className="text-sm font-medium text-slate-grey">to</span>
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) => updateDay(day.dayOfWeek, { endTime: e.target.value })}
                    className="num rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus:border-teal focus:outline-none"
                    aria-label={`${DAY_NAMES[day.dayOfWeek]} closing time`}
                  />
                  <button
                    onClick={() => updateDay(day.dayOfWeek, { closed: true })}
                    className="tap ml-auto rounded-chip px-3 text-[13px] font-bold text-ink-muted hover:bg-light-grey"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={saveHours}
          disabled={busy}
          className="tap mt-5 flex items-center justify-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Saving..." : saved ? "Saved" : "Save my hours"}
        </button>
      </section>

      <section className="rounded-[18px] border border-line-soft bg-white p-6 shadow-lift">
        <h2 className="text-lg font-extrabold tracking-[-0.02em] text-ink">
          Days you are away
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-grey">
          Block time and nobody can book it. Anything already booked stays,
          and we will show you what clashes.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            type="date"
            value={offStart}
            onChange={(e) => setOffStart(e.target.value)}
            className="rounded-control border border-line-strong bg-surface px-3 font-semibold text-ink focus:border-teal focus:outline-none"
            aria-label="First day away"
          />
          <input
            type="date"
            value={offEnd}
            onChange={(e) => setOffEnd(e.target.value)}
            className="rounded-control border border-line-strong bg-surface px-3 font-semibold text-ink focus:border-teal focus:outline-none"
            aria-label="Last day away"
          />
        </div>
        <input
          value={offReason}
          onChange={(e) => setOffReason(e.target.value)}
          placeholder="Why? Only you see this"
          className="mt-2 w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
        <button
          onClick={blockTime}
          disabled={busy}
          className="tap mt-3 w-full border border-teal px-4 py-3 font-medium text-teal-dark disabled:opacity-60"
        >
          Block these days
        </button>

        {clashes !== null && (
          <div className="mt-4 bg-gold-light px-4 py-3 text-sm text-gold-ink">
            {clashes.length === 0 ? (
              <p>Blocked. Nothing was booked in that time.</p>
            ) : (
              <>
                <p className="font-medium">
                  Blocked, but {clashes.length} booking
                  {clashes.length === 1 ? " is" : "s are"} already in that time.
                </p>
                <ul className="mt-2 space-y-1">
                  {clashes.map((c) => (
                    <li key={c.bookingId}>
                      {c.customerName} · {formatWhen(c.scheduledStart)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  We did not cancel them. Message the customers and decide.
                </p>
              </>
            )}
          </div>
        )}

        {initialTimeOff.length > 0 && (
          <div className="mt-5 space-y-2">
            {initialTimeOff.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 border border-line px-3 py-2"
              >
                <div>
                  <p className="text-sm text-ink">
                    {formatRange(t.startsAt, t.endsAt)}
                  </p>
                  {t.reason && <p className="text-xs text-ink-muted">{t.reason}</p>}
                </div>
                <button
                  onClick={() => removeTimeOff(t.id)}
                  disabled={busy}
                  className="tap px-2 text-sm font-medium text-ink-muted disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${d.toLocaleTimeString(
    "en-GB",
    { hour: "numeric", minute: "2-digit" }
  )}`;
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString("en-GB", opts);
  }
  return `${start.toLocaleDateString("en-GB", opts)} to ${end.toLocaleDateString("en-GB", opts)}`;
}
