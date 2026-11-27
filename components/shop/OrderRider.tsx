"use client";

// Who delivers a delivery order (round 4, S1, decision 8): a name and a
// phone, shown to the customer on their tracking link with Call.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";

export default function OrderRider({ orderId, name, phone }: { orderId: string; name: string | null; phone: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!name);
  const [riderName, setRiderName] = useState(name ?? "");
  const [riderPhone, setRiderPhone] = useState(phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${orderId}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_rider", riderName: clear ? "" : riderName, riderPhone: clear ? "" : riderPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "That did not save. Tap again.");
      if (clear) {
        setRiderName("");
        setRiderPhone("");
      }
      setEditing(clear);
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing && name) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-ink">
          <strong>{name}</strong>
          {phone ? ` · ${phone}` : ""}
          <span className="block text-[12.5px] text-neutral-600">The customer sees them on their tracking link, with Call.</span>
        </span>
        <span className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={`${secondaryAction} min-h-[40px]`}>
            Change rider
          </button>
          <button type="button" disabled={busy} onClick={() => save(true)} className="tap min-h-[40px] px-2 text-[13px] font-semibold text-neutral-600">
            Remove
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          Rider&apos;s name
          <input value={riderName} onChange={(e) => setRiderName(e.target.value)} placeholder="Who is taking it?" className="min-h-[44px] rounded-control border border-line px-3 text-base font-normal text-ink focus:border-teal focus:outline-none sm:text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-neutral-700">
          Their phone
          <input value={riderPhone} onChange={(e) => setRiderPhone(e.target.value)} inputMode="tel" placeholder="024 555 2290" className="min-h-[44px] rounded-control border border-line px-3 text-base font-normal text-ink focus:border-teal focus:outline-none sm:text-sm" />
        </label>
      </div>
      <button type="button" disabled={busy || riderName.trim().length < 2} onClick={() => save()} className={`${secondaryAction} min-h-[40px] self-start disabled:opacity-50`}>
        {busy ? "Saving" : "Show the customer who is coming"}
      </button>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
