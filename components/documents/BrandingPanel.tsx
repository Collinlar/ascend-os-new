"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// How a merchant's documents look.
//
// Deliberately five fields. This is not a template designer, and a template
// designer is not what a trader in Makola needs at nine in the morning. It
// is the handful of things that make a document theirs.

export interface Branding {
  tradingName: string | null;
  addressLine: string | null;
  phone: string | null;
  footerNote: string | null;
  accentColour: string | null;
}

// Enough choice to feel like theirs, few enough that none of them make a
// document hard to read on a photocopy.
const COLOURS: Array<[string, string]> = [
  ["#0D8377", "Teal"],
  ["#185FA5", "Blue"],
  ["#633806", "Brown"],
  ["#8A1C3B", "Wine"],
  ["#111827", "Black"],
];

export default function BrandingPanel({
  businessId,
  branding,
}: {
  businessId: string;
  branding: Branding | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tradingName, setTradingName] = useState(branding?.tradingName ?? "");
  const [addressLine, setAddressLine] = useState(branding?.addressLine ?? "");
  const [phone, setPhone] = useState(branding?.phone ?? "");
  const [footerNote, setFooterNote] = useState(branding?.footerNote ?? "");
  const [accentColour, setAccentColour] = useState(branding?.accentColour ?? "#0D8377");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/documents/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          tradingName,
          addressLine,
          phone,
          footerNote,
          accentColour,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save that. Tap again.");
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

  if (!open) {
    return (
      <div className="mb-3.5 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="tap flex items-center text-[13px] font-bold text-teal-dark"
        >
          How your documents look
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3.5 rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
      <p className="text-base font-bold text-ink">How your documents look</p>
      <p className="mt-1 text-[13px] font-medium text-slate-grey">
        This goes on every document you send from now on. Anything already
        sent keeps the look it was sent with.
      </p>

      {error && (
        <p className="mt-3 border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 border border-teal bg-teal-light px-4 py-3 text-sm font-medium text-teal-dark">
          Saved. Your next document will carry it.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={tradingName}
          onChange={(e) => setTradingName(e.target.value)}
          placeholder="What you trade as"
          aria-label="Trading name"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Number customers should call"
          aria-label="Phone shown on documents"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
        <input
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
          placeholder="Where you trade from"
          aria-label="Address shown on documents"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none sm:col-span-2"
        />
        <input
          value={footerNote}
          onChange={(e) => setFooterNote(e.target.value)}
          placeholder="Say something at the bottom, like how to pay you"
          aria-label="Footer note"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none sm:col-span-2"
        />
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-bold text-ink">Your colour</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOURS.map(([hex, name]) => (
            <button
              key={hex}
              onClick={() => setAccentColour(hex)}
              aria-label={name}
              aria-pressed={accentColour === hex}
              className={`tap flex items-center gap-2 rounded-chip border px-4 text-[13px] font-bold ${
                accentColour === hex ? "border-ink text-ink" : "border-line text-ink-slate"
              }`}
            >
              <span
                aria-hidden
                style={{ backgroundColor: hex }}
                className="h-3.5 w-3.5 flex-none rounded-full"
              />
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save how they look"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
        >
          Close
        </button>
      </div>
    </div>
  );
}
