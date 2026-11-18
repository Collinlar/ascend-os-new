"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { primaryAction } from "@/components/shell/Page";

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
  fine,
}: {
  businessId: string;
  productSet: string;
  name: string;
  /** Where the merchant lands once it is on: its own home, not back here. */
  goTo: string;
  /** One line under the button about what stays as it is. */
  fine: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = name.replace("Ascend ", "");

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
        setError(data?.error ?? `${short} did not switch on. Tap again.`);
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
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="rounded-control bg-gold-light px-4 py-2.5 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}
      <button onClick={turnOn} disabled={busy} className={`${primaryAction} min-h-[50px] w-full justify-center disabled:opacity-60`}>
        {busy ? `Switching ${short} on...` : `Turn on ${short}`}
      </button>
      <p className="text-center text-[12.5px] text-neutral-500">{fine}</p>
    </div>
  );
}
