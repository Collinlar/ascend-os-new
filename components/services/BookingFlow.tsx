"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGHS } from "@/lib/money";
import { newClientRef } from "@/lib/ids";

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

type Step = "service" | "time" | "details" | "done";

export default function BookingFlow({
  slug,
  businessName,
  services,
  providers,
}: {
  slug: string;
  businessName: string;
  services: BookableService[];
  providers: Provider[];
}) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<BookableService | null>(null);
  const [provider, setProvider] = useState<Provider | null>(providers[0] ?? null);
  const [date, setDate] = useState(nextDays(1)[0]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    start: string;
    status: string;
    depositPending?: boolean;
  } | null>(null);
  const [clientRef] = useState(() => newClientRef("booking"));

  const loadSlots = useCallback(async () => {
    if (!service || !provider) return;
    setLoadingSlots(true);
    setSlot(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/services/slots?itemId=${service.id}&membershipId=${provider.membershipId}&date=${date}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not load the times. Tap again.");
        setSlots([]);
        return;
      }
      setSlots((data.slots ?? []).map((s: { start: string }) => s.start));
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [service, provider, date]);

  useEffect(() => {
    if (step === "time") loadSlots();
  }, [step, loadSlots]);

  async function book() {
    if (!service || !slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          clientRef,
          itemId: service.id,
          membershipId: provider?.membershipId,
          scheduledStart: slot,
          customerName: name,
          customerPhone: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not book that. Pick another time.");
        // Lost the slot: send them back to pick again with fresh times.
        if (res.status === 409) {
          setStep("time");
          loadSlots();
        }
        return;
      }
      // A deposit booking holds the slot briefly while the customer pays.
      // Send them straight to Mobile Money rather than making them find a
      // link later, when the hold may already have expired.
      if (Number(data.depositRequired) > 0) {
        const payRes = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "service_booking",
            bookingId: data.bookingId,
            payerContact: phone,
          }),
        });
        const payData = await payRes.json();
        if (payRes.ok && payData.checkoutUrl) {
          window.location.href = payData.checkoutUrl;
          return;
        }
        // Payment could not start. The booking exists and the hold stands,
        // so say what happened rather than losing their slot silently.
        setConfirmed({
          start: data.scheduledStart,
          status: data.status,
          depositPending: true,
        });
        setStep("done");
        return;
      }

      setConfirmed({ start: data.scheduledStart, status: data.status });
      setStep("done");
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (services.length === 0) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center text-ink-muted">
        This business has not listed any services yet.
      </div>
    );
  }

  if (step === "done" && confirmed) {
    const requested = confirmed.status === "requested";
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-4xl">📅</p>
        <h2 className="mt-4 text-2xl font-semibold text-ink">
          {requested ? "Your request is in." : "You are booked."}
        </h2>
        <p className="mt-3 text-ink-muted">
          {service?.name} with {businessName} on {formatSlot(confirmed.start)}.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          {confirmed.depositPending
            ? "We could not open Mobile Money just now. Your time is held for a short while, so pay the deposit soon or message them."
            : requested
              ? "They will confirm on WhatsApp shortly."
              : "They will message you on WhatsApp if anything changes."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-24 pt-6">
      {error && (
        <p className="mb-4 border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}

      {step === "service" && (
        <div className="space-y-3">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setService(s);
                setStep("time");
              }}
              className="tap block w-full border border-line px-4 py-4 text-left transition-colors hover:border-teal"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-ink">{s.name}</span>
                {s.price !== null && (
                  <span className="font-semibold text-ink">{formatGHS(s.price)}</span>
                )}
              </span>
              {s.description && (
                <span className="mt-1 block text-sm text-ink-muted">{s.description}</span>
              )}
              <span className="mt-1 block text-xs text-ink-muted">
                About {s.durationMinutes} minutes
                {s.depositAmount ? ` · ${formatGHS(s.depositAmount)} deposit` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === "time" && service && (
        <div>
          <p className="text-sm text-ink-muted">{service.name}</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Pick a time</h2>

          {providers.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p.membershipId}
                  onClick={() => setProvider(p)}
                  className={`tap border px-3 py-2 text-sm font-medium ${
                    provider?.membershipId === p.membershipId
                      ? "border-teal bg-teal-light text-teal-dark"
                      : "border-line text-ink-muted"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {nextDays(7).map((d) => (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={`tap shrink-0 border px-3 py-2 text-sm font-medium ${
                  date === d
                    ? "border-teal bg-teal-light text-teal-dark"
                    : "border-line text-ink-muted"
                }`}
              >
                {formatDay(d)}
              </button>
            ))}
          </div>

          <div className="mt-5">
            {loadingSlots ? (
              <p className="text-sm text-ink-muted">Checking what is free...</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nothing free that day. Try another one.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlot(s)}
                    className={`tap border py-3 text-sm font-medium ${
                      slot === s
                        ? "border-teal bg-teal text-white"
                        : "border-line text-ink"
                    }`}
                  >
                    {formatTime(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => setStep("service")}
              className="tap flex-1 border border-line py-3 font-medium text-ink"
            >
              Back
            </button>
            <button
              onClick={() => setStep("details")}
              disabled={!slot}
              className="tap flex-[2] bg-teal py-3 font-medium text-white disabled:opacity-40"
            >
              Use this time
            </button>
          </div>
        </div>
      )}

      {step === "details" && service && slot && (
        <div>
          <p className="text-sm text-ink-muted">{service.name}</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{formatSlot(slot)}</h2>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-ink">
                Your name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So they know who is coming"
                className="mt-2 w-full border border-line px-4 py-3 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-ink">
                Your WhatsApp number
              </label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="024 XXX XXXX"
                className="mt-2 w-full border border-line px-4 py-3 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
              />
            </div>

            {service.depositAmount ? (
              <p className="bg-gold-light px-4 py-3 text-sm text-gold-ink">
                This booking asks for a {formatGHS(service.depositAmount)} deposit.
                They will send you a payment link on WhatsApp.
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("time")}
                className="tap flex-1 border border-line py-3 font-medium text-ink"
              >
                Back
              </button>
              <button
                onClick={book}
                disabled={busy || name.trim().length < 2 || phone.trim().length < 9}
                className="tap flex-[2] bg-teal py-3 font-medium text-white disabled:opacity-40"
              >
                {busy ? "Booking..." : "Book it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nextDays(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return "Today";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSlot(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${formatTime(iso)}`;
}
