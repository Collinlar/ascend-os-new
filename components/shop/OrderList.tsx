"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

export interface OwnerOrder {
  id: string;
  status: string;
  fulfilment: string;
  total: number;
  placedAt: string;
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: string | null;
  lines: Array<{ description: string; quantity: number }>;
}

// The one action the owner should take next, per state. Keeping this in one
// place means the button always matches what the server will accept.
const NEXT_ACTION: Record<string, { to: string; label: string } | null> = {
  pending: { to: "confirmed", label: "Confirm this order" },
  confirmed: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "fulfilled", label: "Mark collected" },
  out_for_delivery: { to: "fulfilled", label: "Mark delivered" },
  fulfilled: null,
  cancelled: null,
  refunded: null,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Needs your confirmation",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Done",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const OPEN_STATES = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

export default function OrderList({ orders }: { orders: OwnerOrder[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(orderId: string, toStatus: string) {
    setBusy(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not update this order. Tap again.");
        return;
      }
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const open = orders.filter((o) => OPEN_STATES.includes(o.status));
  const settled = orders.filter((o) => !OPEN_STATES.includes(o.status));

  return (
    <div className="space-y-8">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-dark">
          {error}
        </p>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          {open.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busy === order.id}
              onAct={act}
            />
          ))}
        </section>
      )}

      {settled.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-mid-grey">Settled</h2>
          <div className="mt-3 space-y-2">
            {settled.map((order) => (
              <div
                key={order.id}
                className="flex items-baseline justify-between border border-line bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{order.customerName}</p>
                  <p className="text-xs text-mid-grey">{STATUS_LABEL[order.status]}</p>
                </div>
                <p className="text-sm font-medium text-ink">{formatGHS(order.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onAct,
}: {
  order: OwnerOrder;
  busy: boolean;
  onAct: (id: string, to: string) => void;
}) {
  const next = NEXT_ACTION[order.status];
  const needsAttention = order.status === "pending";

  return (
    <div
      className={`bg-white px-5 py-4 ${
        needsAttention ? "border-l-4 border border-l-gold border-line" : "border border-line"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{order.customerName}</p>
          <p className="text-xs text-mid-grey">
            {STATUS_LABEL[order.status]} · {timeAgo(order.placedAt)}
          </p>
        </div>
        <p className="font-semibold text-ink">{formatGHS(order.total)}</p>
      </div>

      <ul className="mt-3 space-y-0.5">
        {order.lines.map((line, i) => (
          <li key={i} className="text-sm text-mid-grey">
            {line.quantity} × {line.description}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-mid-grey">
        {order.fulfilment === "pickup"
          ? "Customer is picking up"
          : `Deliver to ${order.deliveryAddress ?? "address not given"}`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {next && (
          <button
            onClick={() => onAct(order.id, next.to)}
            disabled={busy}
            className="tap bg-teal px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Working..." : next.label}
          </button>
        )}
        {order.status === "ready" && order.fulfilment !== "pickup" && (
          <button
            onClick={() => onAct(order.id, "out_for_delivery")}
            disabled={busy}
            className="tap border border-line px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-60"
          >
            Send for delivery
          </button>
        )}
        {order.customerPhone && (
          <a
            href={`https://wa.me/${order.customerPhone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            className="tap flex items-center border border-line px-4 text-sm font-medium text-teal-dark"
          >
            Message on WhatsApp
          </a>
        )}
        <button
          onClick={() => onAct(order.id, "cancelled")}
          disabled={busy}
          className="tap px-3 py-2.5 text-sm font-medium text-mid-grey disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
