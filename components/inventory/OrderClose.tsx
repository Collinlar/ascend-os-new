"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Nothing more is coming on this order (Advanced Inventory A2). Asks once.
// An order where something came is closed short; one where nothing came is
// cancelled.

export default function OrderClose({ businessId, documentId, anyReceived }: { businessId: string; documentId: string; anyReceived: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/order/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, documentId, note: note.trim() }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not close that order just now. Tap again in a moment.");
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
        {anyReceived ? "Nothing more is coming" : "Cancel this order"}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-[13px] text-neutral-700">
        {anyReceived ? "What arrived stays on your shelf. The rest is no longer expected." : "Nothing arrived, so the order is cancelled."}
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Why"
        placeholder="They ran out of Milo"
        className="h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={close} disabled={busy} className="tap min-h-[44px] rounded-control bg-ink-heading px-3.5 text-[13.5px] font-bold text-white disabled:opacity-60">
          {busy ? "Closing it..." : anyReceived ? "Yes, close it" : "Yes, cancel it"}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="tap min-h-[44px] rounded-control border border-line-brand px-3.5 text-[13.5px] font-semibold text-ink">
          Keep waiting
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
