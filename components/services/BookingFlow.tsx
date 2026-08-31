"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGHS } from "@/lib/money";
import { newClientRef } from "@/lib/ids";

// Customer Web booking, built on the Ascend Services design.
//
// Six screens that each ask one thing: which service, which day and time,
// who with, and who you are. A stranger on a phone should never be looking
// at two questions at once.
//
// The design has a seventh, paying the deposit. Nothing on this platform
// can take a card or a MoMo push yet, so the deposit is told plainly as
// what is due on the day instead of being collected behind a button that
// does not work.

export interface BookableService {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  durationMinutes: number;
  depositAmount: number | null;
}

export interface Provider {
  membershipId: string;
  name: string;
}

interface Slot {
  start: string;
  end: string;
  membershipIds: string[];
}

type Step = "services" | "service" | "time" | "staff" | "details" | "done";

// Deterministic tint, so the same service is the same colour every visit.
const TINTS = [
  { bg: "#F0EAF6", ink: "#6B4F8F" },
  { bg: "#E4F0EC", ink: "#0B6F65" },
  { bg: "#FBEFD8", ink: "#9A6207" },
  { bg: "#E7EEF6", ink: "#3F6494" },
  { bg: "#FBECE8", ink: "#B0453A" },
  { bg: "#EEF3F7", ink: "#33506A" },
];

function tintFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n + seed.charCodeAt(i)) % 997;
  return TINTS[n % TINTS.length];
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
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function clockTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "");
}

export default function BookingFlow({
  slug,
  businessName,
  city,
  services,
  providers,
}: {
  slug: string;
  businessName: string;
  city: string | null;
  services: BookableService[];
  providers: Provider[];
}) {
  const [step, setStep] = useState<Step>("services");
  const [service, setService] = useState<BookableService | null>(null);
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  // null means anybody: the first specialist free at that time.
  const [provider, setProvider] = useState<Provider | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string; start: string } | null>(null);
  const [clientRef] = useState(() => newClientRef("book"));

  // Fourteen days is as far as anybody plans a haircut, and it keeps the
  // rail scrollable rather than endless.
  const days = useMemo(() => {
    const out: Array<{ iso: string; dow: string; day: string }> = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({
        iso: d.toISOString().slice(0, 10),
        dow: d.toLocaleDateString("en-GB", { weekday: "short" }),
        day: String(d.getDate()),
      });
    }
    return out;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const loadSlots = useCallback(async () => {
    if (!service || !date) return;
    setLoadingSlots(true);
    setSlots([]);
    setSlot(null);
    try {
      const res = await fetch(
        `/api/services/slots?itemId=${service.id}&membershipId=any&date=${date}`
      );
      const data = await res.json().catch(() => null);
      setSlots(res.ok ? (data.slots ?? []) : []);
      if (!res.ok) setError(data?.error ?? null);
    } catch {
      setError("We could not load the times just now. Tap the day again.");
    } finally {
      setLoadingSlots(false);
    }
  }, [service, date]);

  useEffect(() => {
    if (step === "time" && date) loadSlots();
  }, [step, date, loadSlots]);

  // Only the specialists free at the chosen time are offered.
  const freeThen = useMemo(
    () => providers.filter((p) => slot?.membershipIds.includes(p.membershipId)),
    [providers, slot]
  );

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
          // Anybody resolves to the first specialist the slot says is free.
          membershipId: provider?.membershipId ?? slot.membershipIds[0],
          scheduledStart: slot.start,
          customerName: name,
          customerPhone: phone,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not book that time. Pick another.");
        return;
      }
      setConfirmed({ id: data.bookingId, start: data.scheduledStart ?? slot.start });
      setStep("done");
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setPlacing(false);
    }
  }

  const summary = service && slot && (
    <dl className="flex flex-col gap-2.5">
      <Row label="Service" value={service.name} />
      <Row
        label="When"
        value={`${new Date(slot.start).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })} at ${clockTime(slot.start)}`}
      />
      <Row label="With" value={provider?.name ?? "First one free"} />
      <Row label="Takes" value={duration(service.durationMinutes)} />
      {service.price !== null && <Row label="Price" value={formatGHS(service.price)} />}
    </dl>
  );

  // ---------------------------------------------------------------- done --
  if (step === "done" && confirmed && service) {
    const balance =
      service.price !== null && service.depositAmount
        ? service.price - service.depositAmount
        : service.price;

    return (
      <div className="mx-auto max-w-md px-6 pb-16">
        <div className="flex animate-riseup flex-col items-center pt-11 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-light">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
              <polyline
                points="5,12.5 10,17.5 19,7"
                stroke="#0D8377"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="mt-4 text-[23px] font-extrabold tracking-[-0.02em] text-ink">
            You are booked
          </h1>
          <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-ink-muted">
            {businessName} confirms on WhatsApp. Message them there if you need
            to move it.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-[18px] border border-line bg-white">
          <div className="flex items-center justify-between border-b border-dashed border-line-strong px-5 py-4">
            <div>
              <p className="text-[15px] font-extrabold text-ink">{businessName}</p>
              {city && (
                <p className="text-[11.5px] font-medium text-slate-grey">{city}</p>
              )}
            </div>
            <span className="mono text-[11.5px] text-ink-muted">
              {confirmed.id.replace(/-/g, "").slice(0, 6).toUpperCase()}
            </span>
          </div>

          <div className="px-5 py-4">{summary}</div>

          {service.price !== null && (
            <div className="flex flex-col gap-2 border-t border-line-soft bg-surface px-5 py-3.5">
              {service.depositAmount ? (
                <>
                  <Money
                    label="Deposit to hold it"
                    value={formatGHS(service.depositAmount)}
                    tone="teal"
                  />
                  <Money
                    label="Rest on the day"
                    value={formatGHS(balance ?? 0)}
                  />
                </>
              ) : (
                <Money label="Due on the day" value={formatGHS(service.price)} />
              )}
              <p className="text-[11.5px] font-medium text-slate-grey">
                Nothing is taken now. You settle with {businessName} when you
                come in.
              </p>
            </div>
          )}
        </div>

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
          className="tap mt-4 flex w-full items-center justify-center rounded-[14px] bg-ink font-bold text-white"
        >
          Book something else
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ services --
  if (step === "services") {
    return (
      <div>
        {/* @contrast-surface navy */}
        <div className="relative h-[186px] bg-navy">
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-navy/85 to-navy/10"
          />
          <div className="absolute inset-x-6 bottom-4">
            <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1.5 backdrop-blur">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal-mint" />
              <span className="text-[11px] font-bold text-teal-light">
                Taking bookings
              </span>
            </span>
            <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-white">
              {businessName}
            </h1>
            {city && (
              <p className="mt-0.5 text-[12.5px] font-medium text-on-dark-strong">
                {city}
              </p>
            )}
          </div>
        </div>
        {/* @contrast-surface white */}

        <div className="mx-auto flex max-w-md flex-col gap-3 px-5 pb-10 pt-5">
          {services.length === 0 ? (
            <p className="py-16 text-center text-sm font-medium text-ink-muted">
              Nothing is bookable here just yet. Check back soon.
            </p>
          ) : (
            services.map((s) => {
              const tint = tintFor(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setService(s);
                    setStep("service");
                  }}
                  className="tap flex items-center gap-3.5 rounded-panel border border-line bg-white p-3 text-left"
                >
                  <span
                    aria-hidden
                    style={{ backgroundColor: tint.bg, color: tint.ink }}
                    className="flex h-[70px] w-[70px] flex-none items-center justify-center rounded-control"
                  >
                    <span className="mono text-lg font-semibold">{initials(s.name)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-navy-soft">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-ink-muted">
                      {duration(s.durationMinutes)}
                      {s.depositAmount ? " · deposit to hold" : ""}
                    </span>
                    <span className="num mt-2 block text-[15px] font-extrabold text-ink">
                      {s.price === null ? "Price on asking" : formatGHS(s.price)}
                    </span>
                  </span>
                  <svg width="8" height="14" viewBox="0 0 9 15" fill="none" aria-hidden>
                    <polyline
                      points="1,1 7.5,7.5 1,14"
                      stroke="#C4D2DC"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- chosen ---
  const stepIndex = { service: 1, time: 2, staff: 3, details: 4 }[
    step as "service" | "time" | "staff" | "details"
  ];

  return (
    <div className="mx-auto max-w-md px-6 pb-32">
      <Header
        title={
          step === "service"
            ? businessName
            : step === "time"
              ? "Pick a time"
              : step === "staff"
                ? "Who with?"
                : "Your details"
        }
        step={stepIndex}
        onBack={() => {
          setError(null);
          if (step === "service") setStep("services");
          else if (step === "time") setStep("service");
          else if (step === "staff") setStep("time");
          else setStep(freeThen.length > 1 ? "staff" : "time");
        }}
      />

      {error && (
        <p className="mb-3 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      {step === "service" && service && (
        <>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
            {service.name}
          </h2>
          {service.description && (
            <p className="mt-2 text-[13.5px] font-medium leading-relaxed text-ink-muted">
              {service.description}
            </p>
          )}

          <div className="mt-4 flex gap-2.5">
            <Stat label="Price" value={service.price === null ? "On asking" : formatGHS(service.price)} />
            <Stat label="Takes" value={duration(service.durationMinutes)} />
            {service.depositAmount !== null && (
              <Stat
                label="Deposit"
                value={formatGHS(service.depositAmount)}
                tone="teal"
              />
            )}
          </div>

          {providers.length > 0 && (
            <>
              <p className="eyebrow mt-6">Who can do this</p>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {providers.map((p) => (
                  <div
                    key={p.membershipId}
                    className="flex items-center gap-3 rounded-control border border-line bg-white px-3 py-2.5"
                  >
                    <Avatar name={p.name} />
                    <span className="text-sm font-bold text-navy-soft">{p.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {step === "time" && service && (
        <>
          <p className="eyebrow">Choose a day</p>
          <div className="scr -mx-6 mt-2.5 flex gap-2 overflow-x-auto px-6 pb-1.5">
            {days.map((d) => {
              const on = d.iso === date;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setDate(d.iso)}
                  aria-pressed={on}
                  className={`tap flex w-14 flex-none flex-col items-center justify-center rounded-control border py-2 ${
                    on
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink-muted"
                  }`}
                >
                  <span className="text-[11px] font-semibold opacity-80">{d.dow}</span>
                  <span className="num text-[19px] font-extrabold leading-tight">
                    {d.day}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="eyebrow mt-6">Available times</p>
          {!date ? (
            <p className="mt-3 text-sm font-medium text-ink-muted">
              Pick a day and we will show what is free.
            </p>
          ) : loadingSlots ? (
            <p className="mt-3 text-sm font-medium text-ink-muted">
              Checking the diary...
            </p>
          ) : slots.length === 0 ? (
            <p className="mt-3 rounded-panel border border-line bg-surface px-4 py-4 text-sm font-medium text-ink-muted">
              Nothing free that day. Try another.
            </p>
          ) : (
            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              {slots.map((s) => {
                const on = slot?.start === s.start;
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={on}
                    className={`tap num flex items-center justify-center rounded-control border py-3 text-sm font-bold ${
                      on
                        ? "border-teal bg-teal-light text-teal-dark"
                        : "border-line bg-white text-ink-soft"
                    }`}
                  >
                    {clockTime(s.start)}
                  </button>
                );
              })}
            </div>
          )}

          {slot && (
            <div className="mt-4 flex gap-3 rounded-panel border border-teal-pale bg-teal-light px-3.5 py-3.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 flex-none">
                <circle cx="12" cy="12" r="9.2" stroke="#0B6F65" strokeWidth="1.5" />
                <path
                  d="M12 7.4V12l3 1.8"
                  stroke="#0B6F65"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-[12.5px] font-semibold leading-snug text-teal-dark">
                {clockTime(slot.start)} to {clockTime(slot.end)}, about{" "}
                {duration(service.durationMinutes)}.
              </p>
            </div>
          )}
        </>
      )}

      {step === "staff" && (
        <>
          <p className="eyebrow">Choose your specialist</p>
          <div className="mt-2.5 flex flex-col gap-2.5">
            <Choice
              selected={provider === null}
              onClick={() => setProvider(null)}
              title="Anybody"
              detail="Whoever is free at that time"
            />
            {freeThen.map((p) => (
              <Choice
                key={p.membershipId}
                selected={provider?.membershipId === p.membershipId}
                onClick={() => setProvider(p)}
                title={p.name}
                detail="Free at the time you picked"
                avatar={p.name}
              />
            ))}
          </div>
        </>
      )}

      {step === "details" && service && slot && (
        <>
          <label htmlFor="bk-name" className="eyebrow block">
            Your name
          </label>
          <input
            id="bk-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Who should they ask for?"
            className="mt-2 w-full rounded-[14px] border-[1.5px] border-line bg-white px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
          />

          <label htmlFor="bk-phone" className="eyebrow mt-5 block">
            Your WhatsApp number
          </label>
          <input
            id="bk-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="024 000 0000"
            className="num mt-2 w-full rounded-[14px] border-[1.5px] border-line bg-white px-4 font-semibold text-ink outline-none placeholder:font-medium placeholder:text-slate-grey focus:border-teal"
          />

          <div className="mt-5 rounded-panel border border-line bg-white px-4 py-4">
            <p className="eyebrow mb-2.5">Your booking</p>
            {summary}
          </div>

          {service.depositAmount !== null && (
            <p className="mt-3 rounded-panel border border-teal-pale bg-teal-light px-4 py-3.5 text-[12.5px] font-semibold leading-snug text-teal-dark">
              {formatGHS(service.depositAmount)} holds this slot, and you settle
              it with {businessName} when you come in. Nothing is taken now.
            </p>
          )}
        </>
      )}

      {/* One decision, one button, always in the same place. */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white from-70% to-transparent px-6 pb-6 pt-5">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            disabled={
              placing ||
              (step === "time" && !slot) ||
              (step === "details" && (name.trim().length < 2 || phone.trim().length < 9))
            }
            onClick={() => {
              setError(null);
              if (step === "service") setStep("time");
              else if (step === "time") setStep(freeThen.length > 1 ? "staff" : "details");
              else if (step === "staff") setStep("details");
              else book();
            }}
            className="tap flex h-14 w-full items-center justify-center rounded-[16px] bg-ink text-base font-bold text-white disabled:opacity-40"
          >
            {step === "service"
              ? "Pick a time"
              : step === "time"
                ? "Continue"
                : step === "staff"
                  ? "Continue"
                  : placing
                    ? "Booking your time..."
                    : "Confirm this booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({
  title,
  step,
  onBack,
}: {
  title: string;
  step: number;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="tap flex h-10 w-10 flex-none items-center justify-center rounded-full border border-line bg-white"
      >
        <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
          <polyline
            points="7.5,1 1,7.5 7.5,14"
            stroke="#33506A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink">
        {title}
      </p>
      <span className="num flex-none text-xs font-bold text-slate-grey">
        Step {step} of 4
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "teal";
}) {
  return (
    <div
      className={`flex-1 rounded-[13px] border p-3 ${
        tone === "teal" ? "border-teal-pale bg-teal-light" : "border-line bg-white"
      }`}
    >
      <p
        className={`text-[10.5px] font-bold uppercase tracking-[0.05em] ${
          tone === "teal" ? "text-teal-dark" : "text-slate-grey"
        }`}
      >
        {label}
      </p>
      <p
        className={`num mt-0.5 text-[17px] font-extrabold ${
          tone === "teal" ? "text-teal-dark" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const tint = tintFor(name);
  return (
    <span
      aria-hidden
      style={{ backgroundColor: tint.bg, color: tint.ink }}
      className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-extrabold"
    >
      {initials(name)}
    </span>
  );
}

function Choice({
  selected,
  onClick,
  title,
  detail,
  avatar,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  avatar?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`tap flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left ${
        selected ? "border-teal bg-teal-light" : "border-line bg-white"
      }`}
    >
      {avatar ? (
        <Avatar name={avatar} />
      ) : (
        <span
          aria-hidden
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-light-grey"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="9" r="3.2" stroke="#5A7184" strokeWidth="1.6" />
            <circle cx="16" cy="10" r="2.6" stroke="#5A7184" strokeWidth="1.6" />
            <path
              d="M3.5 18c.4-2.6 2.4-4 5.5-4s5.1 1.4 5.5 4"
              stroke="#5A7184"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-navy-soft">{title}</span>
        <span className="block text-xs font-medium text-ink-muted">{detail}</span>
      </span>
      <span
        aria-hidden
        className={`h-5 w-5 flex-none rounded-full border-2 ${
          selected ? "border-teal bg-teal" : "border-line-stronger"
        }`}
      />
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12.5px] font-medium text-ink-muted">{label}</dt>
      <dd className="text-right text-[13px] font-bold text-ink">{value}</dd>
    </div>
  );
}

function Money({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "teal";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-[12.5px] font-semibold text-ink-muted">{label}</span>
      <span
        className={`num text-[12.5px] font-extrabold ${
          tone === "teal" ? "text-teal-dark" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
