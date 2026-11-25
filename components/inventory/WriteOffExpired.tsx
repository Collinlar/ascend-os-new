"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

// Write off what is left of one expired batch (Advanced Inventory A5). Asks
// once, then records it as damage, from that batch only.

export default function WriteOffExpired({ businessId, batchId, label, value }: { businessId: string; batchId: string; label: string; value: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function writeOff() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/expiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, action: "write_off", batchId }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not write that off just now. Tap again in a moment.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="tap min-h-[44px] flex-none rounded-control px-3 text-[13.5px] font-semibold text-danger-ink hover:bg-danger-tint">
        Write off as expired
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 pt-1">
      <p className="text-[13px] text-neutral-700">
        Take {label} off the shelf{value > 0 ? ` and write off ${formatGHS(value)}` : ""}? Then throw it away or return it to the supplier.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={writeOff} disabled={busy} className="tap min-h-[44px] rounded-control bg-danger px-3.5 text-[13.5px] font-bold text-white disabled:opacity-60">
          {busy ? "Taking it off the shelf..." : "Yes, write it off"}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="tap min-h-[44px] rounded-control border border-line-brand px-3.5 text-[13.5px] font-semibold text-ink">
          Not now
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
