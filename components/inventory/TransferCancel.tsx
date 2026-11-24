"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Call back goods still on the way (Advanced Inventory A1). They return to
// the place they left. Asks once before doing it.

export default function TransferCancel({ businessId, transferId, from }: { businessId: string; transferId: string; from: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callBack() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/transfer/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, transferId }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not call it back just now. Tap again in a moment.");
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
      <button type="button" onClick={() => setAsking(true)} className="tap min-h-[44px] rounded-control px-3 text-[13.5px] font-semibold text-neutral-700 hover:bg-neutral-100">
        Call it back
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-neutral-700">The goods go back on the record at {from}. Only do this if they never left, or came back.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={callBack} disabled={busy} className="tap min-h-[44px] rounded-control bg-ink-heading px-3.5 text-[13.5px] font-bold text-white disabled:opacity-60">
          {busy ? "Calling it back..." : `Yes, back to ${from}`}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="tap min-h-[44px] rounded-control border border-line-brand px-3.5 text-[13.5px] font-semibold text-ink">
          Keep it on the way
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
