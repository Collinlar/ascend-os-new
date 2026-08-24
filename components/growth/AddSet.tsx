"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Taking on another part of the business.
//
// The button says what arrives, not what is being purchased, because at
// this point nothing is: a set switches on and the merchant finds out
// whether it suits them by using it.

export default function AddSet({
  businessId,
  productSet,
  name,
  goTo,
}: {
  businessId: string;
  productSet: string;
  name: string;
  /** Where the merchant lands once it is on: its own home, not back here. */
  goTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business/product-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, productSet, enabled: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We could not turn it on. Tap again.");
        setBusy(false);
        return;
      }
      // Straight into the thing they just took on. Landing back on a list
      // of things to add would leave them wondering what happened.
      router.push(goTo);
      router.refresh();
    } catch {
      setError("We could not reach the network. Tap again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-2 text-sm text-gold-dark">{error}</p>}
      <button
        onClick={turnOn}
        disabled={busy}
        className="tap flex items-center bg-teal px-5 font-semibold text-white disabled:opacity-50"
      >
        {busy ? `Setting up ${name}...` : `Add ${name}`}
      </button>
    </div>
  );
}
