"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";

// Moving one order on from its page (Modules M6a): the same steps the order
// list offers, through the same route, so the two never disagree.

const NEXT: Record<string, { to: string; label: string } | null> = {
  pending: { to: "confirmed", label: "Confirm this order" },
  confirmed: { to: "preparing", label: "Start packing" },
  preparing: { to: "ready", label: "Mark packed and ready" },
  ready: { to: "fulfilled", label: "Mark collected" },
  out_for_delivery: { to: "fulfilled", label: "Mark delivered" },
};

export default function OrderActions({ orderId, status, fulfilment }: { orderId: string; status: string; fulfilment: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function move(to: string) {
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus: to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "We could not update this order. Tap again.");
      else {
        setCancelling(false);
        router.refresh();
      }
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(null);
    }
  }

  const next = NEXT[status] ?? null;
  const open = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"].includes(status);
  if (!open) return null;

  return (
    <div className="flex flex-col gap-2">
      {next && (
        <button type="button" onClick={() => move(next.to)} disabled={busy !== null} className={`${primaryAction} min-h-[40px] justify-center disabled:opacity-60`}>
          {busy === next.to ? "Saving..." : fulfilment !== "pickup" && status === "ready" ? "Mark delivered" : next.label}
        </button>
      )}
      {status === "ready" && fulfilment !== "pickup" && (
        <button type="button" onClick={() => move("out_for_delivery")} disabled={busy !== null} className={`${secondaryAction} min-h-[40px] justify-center disabled:opacity-60`}>
          Send it for delivery
        </button>
      )}
      {!cancelling ? (
        <button type="button" onClick={() => setCancelling(true)} className="tap min-h-[40px] text-[13px] font-semibold text-neutral-600 hover:text-danger-ink">
          Cancel this order
        </button>
      ) : (
        <span className="flex flex-wrap items-center gap-2 rounded-panel bg-danger-tint px-3 py-2 text-[13px] text-danger-ink">
          Cancel it? The customer is not charged and the stock comes back.
          <button type="button" onClick={() => move("cancelled")} disabled={busy !== null} className="tap font-bold underline">
            {busy === "cancelled" ? "Cancelling..." : "Yes, cancel"}
          </button>
          <button type="button" onClick={() => setCancelling(false)} className="tap font-bold">
            Keep it
          </button>
        </span>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
