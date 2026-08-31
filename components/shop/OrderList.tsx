"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";

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
  const [filter, setFilter] = useState("Needs confirming");
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
  const waiting = open.filter((o) => o.status === "pending");

  const shown =
    filter === "Needs confirming"
      ? waiting
      : filter === "Working on"
        ? open.filter((o) => o.status !== "pending")
        : filter === "Settled"
          ? settled
          : orders;

  return (
    <div>
      {error && (
        <p className="mb-3.5 rounded-panel bg-gold-light px-4 py-3 text-sm font-semibold text-gold-ink">
          {error}
        </p>
      )}

      <Pills
        pills={[
          { label: "Needs confirming", count: waiting.length },
          { label: "Working on", count: open.length - waiting.length },
          { label: "Settled", count: settled.length },
          { label: "Everything" },
        ]}
        active={filter}
        onPick={setFilter}
        trailing={`${shown.length} ${shown.length === 1 ? "order" : "orders"}`}
      />

      {shown.length === 0 ? (
        <EmptyState
          title={`Nothing under ${filter.toLowerCase()}.`}
          detail="Try another filter, or share your shop link to bring orders in."
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {shown.map((order) =>
            OPEN_STATES.includes(order.status) ? (
              <OrderCard
                key={order.id}
                order={order}
                busy={busy === order.id}
                onAct={act}
              />
            ) : (
              <SettledRow key={order.id} order={order} />
            )
          )}
        </div>
      )}
    </div>
  );
}

// An order still in play. Everything needed to decide is on the card,
// because deciding from a list and then opening a page to act is two
// screens for one thought.
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
  const waiting = order.status === "pending";

  return (
    <article
      className={`overflow-hidden rounded-[18px] border border-line-soft bg-white shadow-lift ${
        waiting ? "border-l-4 border-l-gold-rule" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-5 px-[22px] pb-3.5 pt-[18px]">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[13px] bg-light-grey text-[15px] font-extrabold text-ink-slate"
          >
            {order.customerName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div>
            <p className="text-base font-extrabold tracking-[-0.02em] text-ink">
              {order.customerName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${
                  waiting ? "bg-gold-tint text-gold-ink" : "bg-teal-light text-teal-dark"
                }`}
              >
                {STATUS_LABEL[order.status]}
              </span>
              <span className="text-[12.5px] font-medium text-slate-grey">
                {timeAgo(order.placedAt)} ·{" "}
                {order.fulfilment === "pickup"
                  ? "Customer is picking up"
                  : `Deliver to ${order.deliveryAddress ?? "an address they did not give"}`}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-[22px] font-extrabold tracking-[-0.025em] text-ink">
            {formatGHS(order.total)}
          </p>
          <p className="text-xs font-medium text-slate-grey">
            {order.lines.length} {order.lines.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      <ul className="mx-[22px] flex flex-col gap-1.5 rounded-[13px] bg-[#F6F9FB] px-4 py-3.5">
        {order.lines.map((line, i) => (
          <li key={i} className="text-[13.5px] font-medium text-ink-slate">
            <span className="num font-bold text-ink">{line.quantity} ×</span>{" "}
            {line.description}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2.5 px-[22px] pb-[18px] pt-4">
        {next && (
          <button
            onClick={() => onAct(order.id, next.to)}
            disabled={busy}
            className="tap flex items-center rounded-control bg-teal px-[22px] text-[13.5px] font-bold text-white hover:bg-teal-hover disabled:opacity-60"
          >
            {busy ? "Working..." : next.label}
          </button>
        )}
        {order.status === "ready" && order.fulfilment !== "pickup" && (
          <button
            onClick={() => onAct(order.id, "out_for_delivery")}
            disabled={busy}
            className="tap flex items-center rounded-control border border-line px-[18px] text-[13.5px] font-bold text-ink-slate disabled:opacity-60"
          >
            Send for delivery
          </button>
        )}
        {order.customerPhone && (
          <a
            href={`https://wa.me/${order.customerPhone.replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            className="tap flex items-center gap-2 rounded-control border border-teal-pale px-[18px] text-[13.5px] font-bold text-teal-dark hover:bg-teal-light"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#25D366]" />
            Message on WhatsApp
          </a>
        )}
        <span className="flex-1" />
        <button
          onClick={() => onAct(order.id, "cancelled")}
          disabled={busy}
          className="tap px-2 text-[13px] font-semibold text-slate-grey hover:text-danger-ink disabled:opacity-60"
        >
          Cancel order
        </button>
      </div>
    </article>
  );
}

// One that is finished. Nothing to decide, so nothing but the record.
function SettledRow({ order }: { order: OwnerOrder }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[15px] border border-line-soft bg-white px-[18px] py-3.5">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="flex h-9 w-9 flex-none items-center justify-center rounded-chip bg-light-grey text-[13px] font-extrabold text-ink-slate"
        >
          {order.customerName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div>
          <p className="text-[14.5px] font-bold text-ink">{order.customerName}</p>
          <p className="text-xs font-medium text-slate-grey">
            {STATUS_LABEL[order.status]} · {timeAgo(order.placedAt)}
          </p>
        </div>
      </div>
      <p className="num text-[14.5px] font-bold text-ink">{formatGHS(order.total)}</p>
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
