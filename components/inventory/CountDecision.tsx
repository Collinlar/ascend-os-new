"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Approve or turn down a waiting count (Inventory Core I4).

export default function CountDecision({ businessId, countId, blocked }: { businessId: string; countId: string; blocked?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(approve ? "yes" : "no");
    setError(null);
    try {
      const res = await fetch("/api/inventory/count/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, countId, approve }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "We could not save that just now. Tap again in a moment.");
      setDone(approve ? "Approved. The shelf now matches the count." : "Turned down. Nothing on the shelf changed.");
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(null);
    }
  }

  if (done) return <p className="text-[13.5px] font-semibold text-teal-800">{done}</p>;
  if (blocked) return <p className="text-[13px] text-neutral-600">{blocked}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => decide(true)} disabled={busy !== null} className="tap flex min-h-[44px] items-center rounded-control bg-teal px-4 text-[14px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
          {busy === "yes" ? "Changing the shelf..." : "Approve this count"}
        </button>
        <button type="button" onClick={() => decide(false)} disabled={busy !== null} className="tap flex min-h-[44px] items-center rounded-control border-[1.5px] border-line-brand bg-white px-4 text-[14px] font-bold text-ink disabled:opacity-60">
          {busy === "no" ? "Saving..." : "Turn it down"}
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
