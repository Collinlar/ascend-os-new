"use client";

// The customer's booking (round 4, S2), from the Services customer design:
// "Your booking", then move it with the same person or cancel it while the
// window is open, message the business, and after the visit a rating and
// "Book your next visit". Paying online waits for Paystack: what is left
// is paid to the business directly.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

export interface ManageView {
  token: string;
  reference: string;
  status: string;
  start: string | null;
  end: string | null;
  serviceId: string | null;
  serviceName: string;
  providerId: string | null;
  providerName: string | null;
  place: string | null;
  address: string | null;
  price: number | null;
  paid: number;
  cancelledBy: string | null;
  cancellationReason: string | null;
  depositToReturn: number | null;
  depositReturned: boolean;
  windowHours: number;
  rated: boolean;
  businessName: string;
  slug: string | null;
  whatsapp: string | null;
}

const ACCRA = "Africa/Accra";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
const longDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "long", day: "numeric", month: "long" });
const shortDay = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function act(token: string, body: Record<string, unknown>) {
  try {
    const r = await fetch("/api/booking-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "We could not reach the business just now. Check your connection and tap again." } };
  }
}

export default function BookingManage({ view: v }: { view: ManageView }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const freeUntil = v.start ? new Date(new Date(v.start).getTime() - v.windowHours * 3600e3) : null;
  const open = ["requested", "confirmed"].includes(v.status);
  const changeable = open && freeUntil !== null && freeUntil.getTime() > Date.now();
  const left = v.price !== null ? Math.max(0, v.price - v.paid) : null;
  const first = v.providerName?.split(/\s+/)[0] ?? null;

  const kicker =
    v.status === "cancelled"
      ? "Cancelled"
      : v.status === "completed"
        ? "Done"
        : v.status === "no_show"
          ? "Missed"
          : v.status === "requested"
            ? "Waiting for the business to confirm"
            : "Coming up";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pb-16 pt-6">
      <span className="text-[11px] font-bold uppercase tracking-eyebrow text-teal-700">{kicker}</span>
      <h1 className="font-heading text-[24px] font-extrabold leading-tight text-ink-heading">
        {v.start ? `${longDay(v.start)}, ${clock(v.start)}` : v.serviceName}
      </h1>
      <p className="text-[14px] text-neutral-600">
        {[v.serviceName, first, v.place].filter(Boolean).join(" · ")}
      </p>

      {done && <p role="status" className="rounded-[14px] bg-success-tint px-4 py-3 text-[13.5px] font-semibold text-success-ink">{done}</p>}
      {error && <p role="alert" className="rounded-[14px] bg-gold-light px-4 py-3 text-[13.5px] font-semibold text-gold-ink">{error}</p>}

      <div className="rounded-[16px] border border-neutral-200 bg-white">
        <Line k="Booking" v={`${v.reference} · ${v.businessName}`} />
        {v.paid > 0 && <Line k="Paid" v={formatGHS(v.paid)} />}
        {left !== null && v.status !== "cancelled" && <Line k={v.status === "completed" ? "Left to pay" : "Left to pay after"} v={formatGHS(left)} />}
        {v.status === "cancelled" && v.depositToReturn ? (
          <Line k="Deposit" v={v.depositReturned ? `${formatGHS(v.depositToReturn)} returned` : `${formatGHS(v.depositToReturn)} to come back to you`} />
        ) : null}
        <Line k="Where" v={v.place ?? "Ask the business"} last />
      </div>

      {v.status === "cancelled" && (
        <p className="text-[13.5px] leading-relaxed text-neutral-700">
          {v.cancelledBy === "customer" ? "You cancelled this booking." : `${v.businessName} cancelled this booking${v.cancellationReason ? `: "${v.cancellationReason}"` : "."}`}
          {v.depositToReturn && !v.depositReturned ? ` ${v.businessName} returns your ${formatGHS(v.depositToReturn)} deposit to you directly.` : ""}
        </p>
      )}

      {open && (
        <p className="flex flex-col gap-1 rounded-[16px] bg-neutral-50 px-4 py-3 text-[13px] text-neutral-700">
          {changeable && freeUntil ? (
            <span>Free to change or cancel here until {shortDay(freeUntil.toISOString())}.</span>
          ) : (
            <span>
              It is less than {v.windowHours} hour{v.windowHours === 1 ? "" : "s"} to your booking, so changes are made with {v.businessName} directly.
            </span>
          )}
          <span>Please arrive 10 minutes early. {left ? `Pay the rest, ${formatGHS(left)}, to ${v.businessName} after your visit.` : ""}</span>
        </p>
      )}

      {changeable && mode === "view" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => { setMode("move"); setError(null); setDone(null); }} className="tap flex min-h-[46px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-line-brand bg-white text-[14px] font-bold text-teal-800">
            Pick a new time
          </button>
          <button type="button" onClick={() => { setMode("cancel"); setError(null); setDone(null); }} className="tap flex min-h-[46px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-neutral-200 bg-white text-[14px] font-bold text-danger-ink">
            Cancel booking
          </button>
        </div>
      )}

      {mode === "move" && v.serviceId && v.providerId && v.start && (
        <MovePicker
          view={v}
          busy={busy}
          onCancel={() => setMode("view")}
          onPick={async (start) => {
            setBusy(true);
            setError(null);
            const r = await act(v.token, { action: "reschedule", newStart: start });
            setBusy(false);
            if (!r.ok) return setError(r.data.error ?? "That did not go through. Pick another time.");
            setDone(`Moved to ${longDay(start)}, ${clock(start)}. ${v.businessName} has been told.`);
            setMode("view");
            router.refresh();
          }}
        />
      )}

      {mode === "cancel" && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-neutral-200 px-4 py-3.5">
          <strong className="text-[14px] text-ink">Cancel this booking?</strong>
          <p className="text-[13px] leading-relaxed text-neutral-700">
            {v.paid > 0
              ? `You are inside the free window, so ${v.businessName} returns your ${formatGHS(v.paid)} to you directly.`
              : "Nothing was paid, so there is nothing to return."}{" "}
            {v.businessName} is told so someone else can take the time.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await act(v.token, { action: "cancel" });
                setBusy(false);
                if (!r.ok) return setError(r.data.error ?? "That did not go through. Tap again.");
                setDone("Your booking is cancelled.");
                setMode("view");
                router.refresh();
              }}
              className="tap flex min-h-[44px] items-center rounded-[12px] bg-danger-ink px-4 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Cancelling" : v.paid > 0 ? `Cancel, and get ${formatGHS(v.paid)} back` : "Yes, cancel it"}
            </button>
            <button type="button" onClick={() => setMode("view")} className="tap min-h-[44px] px-2 text-[14px] font-semibold text-neutral-700">
              Keep it
            </button>
          </div>
        </div>
      )}

      {v.status === "completed" && !v.rated && <RateVisit token={v.token} first={first} businessName={v.businessName} />}
      {v.status === "completed" && v.rated && <p className="text-[13.5px] text-neutral-700">Thank you for your rating. Only {v.businessName} sees it.</p>}

      {(v.status === "completed" || v.status === "cancelled") && v.slug && (
        <a href={`/b/${v.slug}${v.serviceId ? `?service=${v.serviceId}` : ""}`} className="tap flex min-h-[48px] items-center justify-center rounded-[14px] bg-teal font-bold text-white">
          {v.status === "completed" ? "Book your next visit" : "Book another time"}
        </a>
      )}

      {open && v.address && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`} target="_blank" rel="noopener noreferrer" className="tap flex min-h-[46px] items-center justify-center rounded-[14px] border-[1.5px] border-line-brand bg-white text-[14px] font-bold text-teal-800">
          Directions
        </a>
      )}
      {v.whatsapp && (
        <a href={v.whatsapp} target="_blank" rel="noopener noreferrer" className="tap flex min-h-[44px] items-center justify-center text-[14px] font-bold text-teal-700">
          Message {v.businessName} on WhatsApp
        </a>
      )}
      <p className="text-center text-[12px] text-neutral-600">Bookings powered by AscendSME</p>
    </div>
  );
}

function MovePicker({ view: v, busy, onPick, onCancel }: { view: ManageView; busy: boolean; onPick: (start: string) => void; onCancel: () => void }) {
  const days = useMemo(() => {
    const out: Array<{ iso: string; dow: string; day: string }> = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(Date.now() + i * 864e5);
      out.push({ iso: d.toLocaleDateString("en-CA", { timeZone: ACCRA }), dow: d.toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "short" }), day: d.toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric" }) });
    }
    return out;
  }, []);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const earliest = Date.now() + v.windowHours * 3600e3;

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setPicked(null);
    try {
      const r = await fetch(`/api/services/slots?itemId=${v.serviceId}&membershipId=${v.providerId}&date=${date}`);
      const d = await r.json().catch(() => ({}));
      setSlots(((d.slots ?? []) as Array<{ start: string }>).map((s) => s.start).filter((s) => new Date(s).getTime() > earliest && s !== v.start));
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [date, v.serviceId, v.providerId, v.start, earliest]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-neutral-200 px-4 py-3.5">
      <strong className="text-[14px] text-ink">Pick a new time{v.providerName ? ` with ${v.providerName.split(/\s+/)[0]}` : ""}</strong>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => setDate(d.iso)}
            aria-pressed={date === d.iso}
            aria-label={`${d.dow} ${d.day}`}
            className={`tap flex w-[52px] flex-none flex-col items-center gap-0.5 rounded-[14px] border-[1.5px] py-2 ${date === d.iso ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-200 bg-white text-ink"}`}
          >
            <span className="text-[11px] font-semibold">{d.dow}</span>
            <strong className="num text-[16px]">{d.day}</strong>
          </button>
        ))}
      </div>
      {!date ? (
        <p className="text-[13px] text-neutral-600">Pick a day and we show what is free.</p>
      ) : loading ? (
        <p className="text-[13px] text-neutral-600">Checking the diary for that day.</p>
      ) : slots.length === 0 ? (
        <p className="text-[13px] text-neutral-700">Nothing free that day. Try another.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPicked(s)}
              aria-pressed={picked === s}
              className={`tap num min-h-[44px] rounded-[12px] border-[1.5px] text-[14px] font-bold ${picked === s ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-200 bg-white text-ink"}`}
            >
              {clock(s)}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!picked || busy} onClick={() => picked && onPick(picked)} className="tap flex min-h-[44px] items-center rounded-[12px] bg-teal px-4 text-[14px] font-bold text-white disabled:opacity-40">
          {busy ? "Moving it" : picked ? `Move to ${shortDay(picked)}` : "Pick a time"}
        </button>
        <button type="button" onClick={onCancel} className="tap min-h-[44px] px-2 text-[14px] font-semibold text-neutral-700">
          Keep my time
        </button>
      </div>
    </div>
  );
}

function RateVisit({ token, first, businessName }: { token: string; first: string | null; businessName: string }) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] border border-neutral-200 px-4 py-3.5">
      <strong className="text-[14px] text-ink">How was your visit{first ? ` with ${first}` : ""}?</strong>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          // @contrast-ignore star icons; the choice is also said by aria-checked and each label
          <button
            className={`tap flex h-11 w-11 items-center justify-center rounded-full text-[22px] ${n <= stars ? "text-gold-deep" : "text-neutral-400"}`}
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setStars(n)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
            </svg>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="Anything to tell them? (optional)"
        aria-label="Your comment"
        className="rounded-[12px] border-[1.5px] border-neutral-200 px-3 py-2.5 text-[16px] text-ink outline-none placeholder:text-neutral-500 focus:border-teal"
      />
      <p className="text-[12.5px] text-neutral-600">Only {businessName} sees your rating and comment.</p>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
      <button
        type="button"
        disabled={!stars || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await act(token, { action: "rate", stars, comment });
          setBusy(false);
          if (!r.ok) return setError(r.data.error ?? "That did not go through. Tap again.");
          router.refresh();
        }}
        className="tap flex min-h-[44px] items-center justify-center rounded-[12px] bg-teal text-[14px] font-bold text-white disabled:opacity-40"
      >
        {busy ? "Sending" : "Send my rating"}
      </button>
    </div>
  );
}

function Line({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <span className={`flex items-baseline justify-between gap-3 px-3.5 py-2.5 text-[13px] ${last ? "" : "border-b border-neutral-100"}`}>
      <span className="text-neutral-600">{k}</span>
      <strong className="text-right text-ink">{v}</strong>
    </span>
  );
}
