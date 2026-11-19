"use client";

import { useState } from "react";
import { formatGHS } from "@/lib/money";

// Customer-side payment on a shared document link. No account needed: the
// link is the authority, and the provider handles the money.

export default function PayButton({
  token,
  amount,
}: {
  token: string;
  amount: number;
}) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "document",
          documentToken: token,
          payerContact: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "We could not start the payment. Tap again.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-card border border-teal-200 bg-teal-50 px-4 py-4">
      <p className="text-[14px] font-semibold text-teal-800">
        Pay with Mobile Money
      </p>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="tel"
        placeholder="Your MoMo number"
        className="mt-2 h-12 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
      />
      {error && <p className="mt-2 text-sm font-semibold text-gold-700">{error}</p>}
      <button
        onClick={pay}
        disabled={busy}
        className="tap mt-3 flex h-12 w-full items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white disabled:opacity-60"
      >
        {busy ? "Opening Mobile Money..." : `Pay ${formatGHS(amount)}`}
      </button>
      <p className="mt-2 text-xs text-teal-dark">
        You will approve this on your phone. MTN MoMo, Telecel Cash and card.
      </p>
    </div>
  );
}
