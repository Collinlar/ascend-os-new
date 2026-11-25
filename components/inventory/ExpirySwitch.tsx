"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "This product has expiry dates" (Advanced Inventory A5). Switching on puts
// what is already on the shelf in "date not known", so the batches add up to
// the shelf from the first day.

export default function ExpirySwitch({ businessId, itemId, itemName, on }: { businessId: string; itemId: string; itemName: string; on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/expiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, action: "track", itemId, on: next }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not change that just now. Tap again in a moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold ${active ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"}`;

  return (
    <div className="mb-4 rounded-[18px] border border-line-brand bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Expiry dates</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" aria-pressed={!on} disabled={busy} onClick={() => on && set(false)} className={chip(!on)}>
          Does not expire
        </button>
        <button type="button" aria-pressed={on} disabled={busy} onClick={() => !on && set(true)} className={chip(on)}>
          Has expiry dates
        </button>
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-600">
        {on
          ? `Receive stock asks for the date on each delivery of ${itemName}. Sales take from what expires first, and the Expiry tab warns you 30 days ahead.`
          : `Switch on for food, drinks, medicine or anything with a date on the box. What is on the shelf now is counted with no date known.`}
      </p>
      {error && <p role="alert" className="mt-2 text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
