"use client";

import { discoverRef } from "@/lib/discover/ref";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGHS } from "@/lib/money";
import { newClientRef } from "@/lib/ids";
import { TILE_TINTS } from "@/lib/brand/tints";

// Customer booking page (round 4, S1), from the Ascend Services customer
// designs: the business up front with when it is open and the next free
// time, services by category, then one question a screen: the service,
// who and when (mornings and afternoons), your details, booked.
//
// Paying the deposit online waits for Paystack (decision 7): the deposit is
// told as paid to the business, on the day or directly, never collected
// behind a button that does not work.

export interface BookableService {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number;
  depositAmount: number | null;
  category: string | null;
  photo: string | null;
}

export interface Provider {
  membershipId: string;
  name: string;
}

export interface BookingPlace {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
}

interface Slot {
  start: string;
  end: string;
  membershipIds: string[];
}

type Step = "services" | "service" | "time" | "details" | "done";

const ACCRA = "Africa/Accra";

function tintFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % 997;
  return TILE_TINTS[n % TILE_TINTS.length];
}

function initials(name: string, max = 2) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, max)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 1).toUpperCase();
}

function duration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} hr ${rest} min`;
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
}

function longDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "long", day: "numeric", month: "long" });
}

function accraHour(iso: string) {
  return Number(new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", hour12: false }));
}

/** "today 15:30", "tomorrow 09:00", "Thu 4 Dec, 10:00". */
export function whenShort(iso: string) {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ACCRA });
  const t = new Date(iso);
  const today = day(new Date());
  const tomorrow = day(new Date(Date.now() + 864e5));
  if (day(t) === today) return `today ${clock(iso)}`;
  if (day(t) === tomorrow) return `tomorrow ${clock(iso)}`;
  return `${t.toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short" })}, ${clock(iso)}`;
}

function calendarFile(title: string, start: string, end: string, where: string, details: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AscendSME//Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@ascendsme`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

export default function BookingFlow({
  slug,
  businessName,
  verified,
  about,
  openUntil,
  nextFree,
  places,
  services,
  providers,
  windowHours = null,
  initialServiceId = null,
}: {
  /** Free changes until this many hours before (round 4, S2). */
  windowHours?: number | null;
  /** "Book your next visit" opens on the service (round 4, S2). */
  initialServiceId?: string | null;
  slug: string;
  businessName: string;
  verified: boolean;
  about: string;
  /** "8pm", from the team's hours today; null when nobody works today. */
  openUntil: string | null;
  /** The earliest free time across the services, if any in the next days. */
  nextFree: string | null;
  places: BookingPlace[];
  services: BookableService[];
  providers: Provider[];
}) {
  const initial = initialServiceId ? services.find((s) => s.id === initialServiceId) ?? null : null;
  const [step, setStep] = useState<Step>(initial ? "service" : "services");
  const [category, setCategory] = useState<string>("All");
  const [service, setService] = useState<BookableService | null>(initial);
  const [wishing, setWishing] = useState(false);
  const [place, setPlace] = useState<BookingPlace | null>(places[0] ?? null);
  // null means anybody: the first person free at that time.
  const [provider, setProvider] = useState<Provider | null>(null);
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [offers, setOffers] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string; start: string; end: string; reference: string; manage: string | null } | null>(null);
  const [clientRef] = useState(() => newClientRef("book"));

  const categories = useMemo(() => {
    const set = Array.from(new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c))));
    return set.length > 1 ? ["All", ...set] : [];
  }, [services]);
  const shown = category === "All" ? services : services.filter((s) => s.category === category);

  // Two weeks is as far as most people plan a visit.
  const days = useMemo(() => {
    const out: Array<{ iso: string; dow: string; day: string; month: string }> = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(Date.now() + i * 864e5);
      out.push({
        iso: d.toLocaleDateString("en-CA", { timeZone: ACCRA }),
        dow: d.toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "short" }),
        day: d.toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric" }),
        month: d.toLocaleDateString("en-GB", { timeZone: ACCRA, month: "long", year: "numeric" }),
      });
    }
    return out;
  }, []);
  const monthLabel = (days.find((d) => d.iso === date) ?? days[0]).month;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const loadSlots = useCallback(async () => {
    if (!service || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSlot(null);
    try {
      const res = await fetch(`/api/services/slots?itemId=${service.id}&membershipId=${provider?.membershipId ?? "any"}&date=${date}`);
      const data = await res.json().catch(() => null);
      setSlots(res.ok ? (data.slots ?? []) : []);
      if (!res.ok) setError(data?.error ?? "We could not load the times just now. Tap the day again.");
    } catch {
      setError("We could not load the times just now. Tap the day again.");
    } finally {
      setLoadingSlots(false);
    }
  }, [service, date, provider]);

  useEffect(() => {
    if (step === "time" && date) loadSlots();
  }, [step, date, loadSlots]);

  const morning = slots.filter((s) => accraHour(s.start) < 12);
  const afternoon = slots.filter((s) => accraHour(s.start) >= 12);
  const who = provider?.name ?? (slot ? providers.find((p) => slot.membershipIds.includes(p.membershipId))?.name : null) ?? "First one free";
  const whereL = place ? [place.name, place.city].filter(Boolean).join(", ") : "";

  async function book() {
    if (!service || !slot) return;
    setPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/services/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          clientRef,
          itemId: service.id,
          // Anybody resolves to the first person the slot says is free.
          membershipId: provider?.membershipId ?? slot.membershipIds[0],
          locationId: place?.id ?? undefined,
          scheduledStart: slot.start,
          customerName: name,
          customerPhone: phone,
          note: note.trim() || undefined,
          marketingOptIn: offers,
          // A Discover click that brought them, for the promotion (round 3, P1).
          discoverRef: discoverRef(slug),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not book that time. Pick another.");
        return;
      }
      setConfirmed({
        id: data.bookingId,
        start: data.scheduledStart ?? slot.start,
        end: slot.end,
        reference: data.reference ?? `BK-${String(data.bookingId).replace(/-/g, "").slice(0, 6).toUpperCase()}`,
        manage: typeof data.managePath === "string" ? data.managePath : null,
      });
      setStep("done");
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setPlacing(false);
    }
  }

  const deposit = service?.depositAmount ?? null;
  const later = service && service.price !== null ? service.price - (deposit ?? 0) : null;

  // ---------------------------------------------------------------- done --
  if (step === "done" && confirmed && service) {
    const address = place ? [place.address, place.name, place.city].filter(Boolean).join(", ") : "";
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pb-16 pt-6 lg:max-w-lg">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-teal-700 text-white">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />
            </svg>
          </span>
          <h1 className="font-heading text-[23px] font-extrabold text-ink-heading">You are booked</h1>
          <p className="text-[14px] leading-relaxed text-neutral-600">
            {longDay(confirmed.start)}, {clock(confirmed.start)}
            <br />
            {who}
            {whereL ? ` · ${whereL}` : ""}
          </p>
        </div>

        <div className="rounded-[16px] border border-neutral-200 bg-white">
          <Line k="Booking" v={`${confirmed.reference} · ${service.name}`} />
          {service.price !== null && (
            <>
              {deposit ? <Line k="Deposit to hold it" v={formatGHS(deposit)} /> : null}
              <Line k={deposit ? "Rest after your visit" : "To pay on the day"} v={formatGHS(later ?? service.price)} last />
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-[16px] bg-neutral-50 px-4 py-3.5 text-[13px] text-ink">
          <strong>What happens next</strong>
          <span>{businessName} confirms on WhatsApp.</span>
          {deposit ? <span>Pay the {formatGHS(deposit)} deposit to {businessName} as they tell you. Nothing was taken here.</span> : <span>You pay {businessName} on the day. Nothing was taken here.</span>}
          <span>Please arrive 10 minutes early.</span>
          {confirmed.manage && windowHours !== null && (
            <span>
              Change or cancel for free until{" "}
              {new Date(new Date(confirmed.start).getTime() - windowHours * 3600e3).toLocaleString("en-GB", { timeZone: ACCRA, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              .
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <a
            href={calendarFile(`${service.name} at ${businessName}`, confirmed.start, confirmed.end, address, `Booking ${confirmed.reference} with ${who}.`)}
            download={`${confirmed.reference}.ics`}
            className="tap flex min-h-[46px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-line-brand bg-white text-[14px] font-bold text-teal-800"
          >
            Add to calendar
          </a>
          {address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex min-h-[46px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-line-brand bg-white text-[14px] font-bold text-teal-800"
            >
              Directions
            </a>
          )}
        </div>
        {confirmed.manage && (
          <a href={confirmed.manage} className="tap flex min-h-[48px] items-center justify-center rounded-[14px] bg-teal font-bold text-white">
            Manage booking
          </a>
        )}
        {confirmed.manage && <p className="text-center text-[12.5px] text-neutral-600">Keep this page: it is your own link to the booking.</p>}
        <button
          type="button"
          onClick={() => {
            setService(null);
            setSlot(null);
            setProvider(null);
            setDate("");
            setConfirmed(null);
            setStep("services");
          }}
          className={`tap flex min-h-[48px] items-center justify-center rounded-[14px] font-bold ${confirmed.manage ? "border-[1.5px] border-line-brand bg-white text-teal-800" : "bg-teal text-white"}`}
        >
          Book something else
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ services --
  if (step === "services") {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3.5 pb-10 pt-4 lg:max-w-5xl">
        {/* @contrast-surface #007A6F */}
        <div className="mx-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-teal-800 to-teal-700 text-white">
          <div className="flex flex-col gap-2 px-[18px] pb-4 pt-[18px] lg:px-7 lg:py-6">
            <span className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-white font-heading font-extrabold text-teal-800">{initials(businessName)}</span>
              <span className="flex min-w-0 flex-col">
                <h1 className="font-heading text-[18px] font-bold leading-tight lg:text-[22px]">{businessName}</h1>
                {verified && (
                  <span className="flex items-center gap-1 text-[12px] font-bold text-mint-bright">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                    Verified business
                  </span>
                )}
              </span>
            </span>
            {about && <p className="text-[13px] leading-snug text-white/90">{about}</p>}
            {(openUntil || nextFree) && (
              <span className="flex flex-wrap gap-1.5">
                {openUntil && <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">Open today until {openUntil}</span>}
                {nextFree && <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">Next free: {whenShort(nextFree)}</span>}
              </span>
            )}
          </div>
        </div>

        {/* @contrast-surface white */}
        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`tap min-h-[36px] flex-none rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${
                  category === c ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-200 bg-white text-neutral-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 px-4 lg:grid-cols-2">
          {services.length === 0 ? (
            <p className="py-16 text-center text-sm font-medium text-neutral-600">Nothing is bookable here just yet. Check back soon.</p>
          ) : (
            shown.map((s) => {
              const tint = tintFor(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setService(s);
                    setStep("service");
                  }}
                  className="tap flex items-center gap-3 rounded-[16px] border border-neutral-200 bg-white p-2.5 text-left"
                >
                  {s.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo} alt="" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] flex-none rounded-[12px] object-cover" />
                  ) : (
                    <span aria-hidden style={{ backgroundColor: tint.bg, color: tint.ink }} className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-[12px]">
                      <span className="mono text-lg font-semibold">{initials(s.name)}</span>
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="text-[14px] text-ink">{s.name}</strong>
                    <span className="text-[12.5px] text-neutral-600">{duration(s.durationMinutes)}</span>
                    <span className="flex items-center justify-between gap-1.5">
                      <strong className="num text-[13.5px] text-ink">{s.price === null ? "Price on asking" : formatGHS(s.price)}</strong>
                      {s.depositAmount ? (
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11.5px] font-bold text-teal-800">Deposit {formatGHS(s.depositAmount)}</span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11.5px] font-bold text-neutral-700">Pay on the day</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="mx-4 flex flex-col gap-2 rounded-[16px] bg-neutral-50 px-3.5 py-3.5 text-[12.5px] text-neutral-700">
          <span>Book in a minute. No account needed.</span>
          <span>A deposit, where there is one, holds your time. The rest is paid after.</span>
          {windowHours !== null && (
            <span>Free changes up to {windowHours === 0 ? "the start" : windowHours % 24 === 0 ? `${windowHours / 24 === 1 ? "24 hours" : `${windowHours / 24} days`} before` : `${windowHours} hours before`}, from your booking link.</span>
          )}
          <span>{businessName} confirms your booking on WhatsApp.</span>
        </div>
        <p className="text-center text-[12px] text-neutral-600">Bookings powered by AscendSME</p>
      </div>
    );
  }

  // ------------------------------------------------------------- the rest --
  const stepIndex = { service: 1, time: 2, details: 3 }[step as "service" | "time" | "details"];
  const canGo = step === "service" ? true : step === "time" ? Boolean(slot) : name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 9;

  return (
    <div className="mx-auto max-w-md px-4 pb-32 lg:max-w-4xl">
      <div className="flex items-center gap-2.5 pb-2.5 pt-3">
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (step === "service") setStep("services");
            else if (step === "time") setStep("service");
            else setStep("time");
          }}
          aria-label="Go back"
          className="tap flex h-11 w-11 flex-none items-center justify-center rounded-full bg-neutral-100"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
            <polyline points="7.5,1 1,7.5 7.5,14" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <strong className="min-w-0 flex-1 truncate text-center text-[15.5px] text-ink">
          {step === "service" ? businessName : step === "time" ? "Choose a time" : "Your details"}
        </strong>
        <span className="w-11" />
      </div>
      <div className="flex gap-1.5 pb-3" aria-label={`Step ${stepIndex} of 3`}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-teal-700" : "bg-neutral-200"}`} />
        ))}
      </div>

      {error && <p role="alert" className="mb-3 rounded-[14px] bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">{error}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          {step === "service" && service && (
            <>
              <h2 className="font-heading text-[24px] font-extrabold text-ink-heading">{service.name}</h2>
              <p className="text-[13.5px] text-neutral-600">
                {duration(service.durationMinutes)}
                {service.price !== null ? ` · ${formatGHS(service.price)}` : ""}
              </p>
              {service.description && <p className="text-[14px] leading-relaxed text-neutral-700">{service.description}</p>}

              {places.length > 1 && (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-600">Where</span>
                  <div className="grid grid-cols-2 gap-2">
                    {places.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlace(p)}
                        aria-pressed={place?.id === p.id}
                        className={`tap flex min-h-[52px] flex-col justify-center rounded-[14px] border-[1.5px] px-3 py-2 text-left ${place?.id === p.id ? "border-teal-700 bg-teal-50" : "border-neutral-200 bg-white"}`}
                      >
                        <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
                        {p.address && <span className="text-[12px] text-neutral-600">{p.address}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {service.price !== null && (
                <div className="flex flex-col gap-1 rounded-[14px] border border-teal-200 bg-teal-50 px-4 py-3 text-[13px] text-teal-800">
                  <strong>{deposit ? `${formatGHS(deposit)} deposit holds your time` : "Pay on the day"}</strong>
                  <span>{deposit ? `The rest, ${formatGHS(later ?? 0)}, is paid after your visit. You pay ${businessName} directly.` : `You pay ${businessName} after your visit. Nothing is taken now.`}</span>
                </div>
              )}

              {providers.length > 0 && (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-600">Done by</span>
                  <div className="flex flex-wrap gap-3">
                    {providers.map((p) => (
                      <span key={p.membershipId} className="flex items-center gap-2">
                        <Avatar name={p.name} />
                        <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === "time" && service && (
            <>
              <div className="flex items-center gap-2.5 rounded-[14px] bg-neutral-50 px-3 py-2.5">
                <span aria-hidden style={{ backgroundColor: tintFor(service.id).bg }} className="h-10 w-10 flex-none rounded-[10px]" />
                <span className="flex min-w-0 flex-col">
                  <strong className="text-[13.5px] text-ink">{service.name}</strong>
                  <span className="text-[12.5px] text-neutral-600">
                    {duration(service.durationMinutes)}
                    {whereL ? ` · ${whereL}` : ""}
                  </span>
                </span>
              </div>

              {providers.length > 1 && (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-600">With</span>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {[null, ...providers].map((p) => {
                      const on = (provider?.membershipId ?? null) === (p?.membershipId ?? null);
                      return (
                        <button
                          key={p?.membershipId ?? "any"}
                          type="button"
                          onClick={() => {
                            setProvider(p);
                            setSlot(null);
                          }}
                          aria-pressed={on}
                          className={`tap flex min-w-[92px] flex-1 flex-col items-center gap-1 rounded-[14px] border-[1.5px] px-2 py-2.5 ${on ? "border-teal-700 bg-teal-50" : "border-neutral-200 bg-white"}`}
                        >
                          {p ? <Avatar name={p.name} /> : <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-extrabold text-neutral-700">Any</span>}
                          <span className="text-[12.5px] font-bold text-ink">{p ? p.name.split(" ")[0] : "Anyone"}</span>
                          <span className="text-[11px] text-neutral-600">{p ? "Pick their times" : "First one free"}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-600">{monthLabel}</span>
                <span className="text-[12px] text-neutral-600">Times in Accra</span>
              </div>
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {days.map((d) => {
                  const on = d.iso === date;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDate(d.iso)}
                      aria-pressed={on}
                      aria-label={`${d.dow} ${d.day}`}
                      className={`tap flex w-[52px] flex-none flex-col items-center gap-0.5 rounded-[14px] border-[1.5px] py-2 ${on ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-200 bg-white text-ink"}`}
                    >
                      <span className="text-[11px] font-semibold">{d.dow}</span>
                      <strong className="num text-[16px]">{d.day}</strong>
                    </button>
                  );
                })}
              </div>

              {!date ? (
                <p className="text-[13.5px] text-neutral-600">Pick a day and we show what is free.</p>
              ) : loadingSlots ? (
                <p className="text-[13.5px] text-neutral-600">Checking the diary for that day.</p>
              ) : slots.length === 0 ? (
                <p className="rounded-[14px] border border-neutral-200 bg-neutral-50 px-4 py-4 text-[13.5px] text-neutral-700">Nothing free that day{provider ? ` with ${provider.name.split(" ")[0]}` : ""}. Try another day.</p>
              ) : (
                <>
                  {[
                    ["Morning", morning],
                    ["Afternoon", afternoon],
                  ].map(([label, list]) =>
                    (list as Slot[]).length === 0 ? null : (
                      <div key={label as string} className="flex flex-col gap-1.5">
                        <span className="text-[12.5px] text-neutral-600">{label as string}</span>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {(list as Slot[]).map((s) => {
                            const on = slot?.start === s.start;
                            return (
                              <button
                                key={s.start}
                                type="button"
                                onClick={() => setSlot(s)}
                                aria-pressed={on}
                                className={`tap num min-h-[44px] rounded-[12px] border-[1.5px] text-[14px] font-bold ${on ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-200 bg-white text-ink"}`}
                              >
                                {clock(s.start)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </>
              )}

              {/* "Nothing fits" (round 4, S2, decision 5). */}
              {!wishing ? (
                <button
                  type="button"
                  onClick={() => setWishing(true)}
                  className="tap flex min-h-[44px] items-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-neutral-300 px-3 py-2.5 text-left text-[13px] font-semibold text-neutral-700"
                >
                  Nothing fits? Tell {businessName} when suits you
                </button>
              ) : (
                <WishForm slug={slug} businessName={businessName} serviceId={service.id} membershipId={provider?.membershipId ?? null} onClose={() => setWishing(false)} />
              )}
            </>
          )}

          {step === "details" && service && slot && (
            <>
              <Field id="bk-name" label="Name" value={name} onChange={setName} placeholder="Who should they ask for?" autoComplete="name" />
              <Field id="bk-phone" label="WhatsApp number for your booking" value={phone} onChange={setPhone} placeholder="024 000 0000" autoComplete="tel" inputMode="tel" />
              <label htmlFor="bk-note" className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-neutral-700">Anything we should know? (optional)</span>
                <textarea
                  id="bk-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder="Like your hair length, or a colour you want"
                  className="rounded-[14px] border-[1.5px] border-neutral-200 bg-white px-4 py-3 text-[16px] text-ink outline-none placeholder:text-neutral-500 focus:border-teal"
                />
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[14px] border border-neutral-200 bg-white px-3.5 py-3">
                <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-teal-700" />
                <span className="text-[13px] leading-snug text-neutral-700">Send me offers from {businessName} on WhatsApp. You can stop anytime.</span>
              </label>
            </>
          )}
        </div>

        {/* What is being booked, kept in view: under the questions on a
            phone, beside them on a laptop. */}
        {service && step !== "service" && (
          <aside className="flex flex-col gap-2 rounded-[16px] border border-neutral-200 bg-white px-4 py-3.5 lg:sticky lg:top-4">
            <span className="text-[11px] font-bold uppercase tracking-eyebrow text-neutral-600">Your booking</span>
            <Line k="Service" v={service.name} bare />
            <Line k="When" v={slot ? `${longDay(slot.start)}, ${clock(slot.start)}` : "Pick a time"} bare />
            <Line k="With" v={who} bare />
            {whereL && <Line k="Where" v={whereL} bare />}
            {service.price !== null && <Line k="Price" v={formatGHS(service.price)} bare />}
            {deposit ? <Line k="Deposit, paid to the business" v={formatGHS(deposit)} bare /> : null}
          </aside>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-100 bg-white px-4 pb-6 pt-3">
        <div className="mx-auto max-w-md lg:max-w-4xl">
          <button
            type="button"
            disabled={placing || !canGo}
            onClick={() => {
              setError(null);
              if (step === "service") setStep("time");
              else if (step === "time") setStep("details");
              else book();
            }}
            className="tap flex h-[50px] w-full items-center justify-center rounded-[14px] bg-teal font-heading text-[15px] font-extrabold text-white disabled:opacity-40 lg:ml-auto lg:w-[320px]"
          >
            {step === "service"
              ? "Choose a time"
              : step === "time"
                ? slot
                  ? `Continue · ${whenShort(slot.start)}`
                  : "Pick a time to continue"
                : placing
                  ? "Booking your time"
                  : "Book this time"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const tint = tintFor(name);
  return (
    <span aria-hidden style={{ backgroundColor: tint.bg, color: tint.ink }} className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-extrabold">
      {initials(name)}
    </span>
  );
}

function Line({ k, v, last, bare }: { k: string; v: string; last?: boolean; bare?: boolean }) {
  return (
    <span className={`flex items-baseline justify-between gap-3 text-[13px] ${bare ? "" : `px-3.5 py-2.5 ${last ? "" : "border-b border-neutral-100"}`}`}>
      <span className="text-neutral-600">{k}</span>
      <strong className="text-right text-ink">{v}</strong>
    </span>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-neutral-700">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="h-12 rounded-[14px] border-[1.5px] border-neutral-200 bg-white px-4 text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-neutral-500 focus:border-teal"
      />
    </label>
  );
}

const WEEK: Array<[number, string]> = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

function WishForm({ slug, businessName, serviceId, membershipId, onClose }: { slug: string; businessName: string; serviceId: string; membershipId: string | null; onClose: () => void }) {
  const [days, setDays] = useState<number[]>([]);
  const [part, setPart] = useState<"morning" | "afternoon" | "any">("any");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p role="status" className="rounded-[14px] bg-success-tint px-4 py-3 text-[13.5px] font-semibold text-success-ink">
        Sent. {businessName} messages you on WhatsApp when a time like that opens up.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] border border-neutral-200 px-4 py-3.5">
      <strong className="text-[14px] text-ink">When would suit you?</strong>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
        {WEEK.map(([d, l]) => (
          <button
            key={d}
            type="button"
            aria-pressed={days.includes(d)}
            onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
            className={`tap min-h-[40px] min-w-[48px] rounded-full border-[1.5px] px-3 text-[13px] font-semibold ${days.includes(d) ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Part of the day">
        {(
          [
            ["morning", "Mornings"],
            ["afternoon", "Afternoons"],
            ["any", "Any time"],
          ] as Array<["morning" | "afternoon" | "any", string]>
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={part === k}
            onClick={() => setPart(k)}
            className={`tap min-h-[40px] rounded-full border-[1.5px] px-3 text-[13px] font-semibold ${part === k ? "border-teal-700 bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <Field id="wish-name" label="Name" value={name} onChange={setName} placeholder="Who should they ask for?" autoComplete="name" />
      <Field id="wish-phone" label="WhatsApp number" value={phone} onChange={setPhone} placeholder="024 000 0000" autoComplete="tel" inputMode="tel" />
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || days.length === 0 || name.trim().length < 2 || phone.replace(/\D/g, "").length < 9}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/services/wish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug, itemId: serviceId, membershipId, days, part, name, phone }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) return setError(data.error ?? "That did not go through. Tap again.");
              setSent(true);
            } catch {
              setError("We could not reach the business just now. Tap again.");
            } finally {
              setBusy(false);
            }
          }}
          className="tap flex min-h-[44px] items-center rounded-[12px] bg-teal px-4 text-[14px] font-bold text-white disabled:opacity-40"
        >
          {busy ? "Sending" : `Tell ${businessName}`}
        </button>
        <button type="button" onClick={onClose} className="tap min-h-[44px] px-2 text-[14px] font-semibold text-neutral-700">
          Not now
        </button>
      </div>
    </div>
  );
}
