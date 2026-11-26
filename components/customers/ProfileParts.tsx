"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import type { HistoryEntry, HistoryKind } from "@/lib/customers/profile";
import { secondaryAction } from "@/components/shell/Page";
import { Tag } from "@/components/shell/Parts";
import { Icon, type IconName } from "@/components/shell/icons";

// The customer profile's moving parts (Modules M5): the history with its
// filters, and the switch that records whether they agreed to offers.

const FILTERS: Array<{ key: string; label: string; kinds: HistoryKind[] }> = [
  { key: "all", label: "Everything", kinds: ["sale", "order", "booking", "document", "payment", "message"] },
  { key: "money", label: "Money", kinds: ["sale", "payment"] },
  { key: "bookings", label: "Bookings", kinds: ["booking"] },
  { key: "documents", label: "Documents", kinds: ["document"] },
  { key: "shop", label: "Shop", kinds: ["order"] },
  { key: "messages", label: "Messages", kinds: ["message"] },
];

const ICON: Record<HistoryKind, IconName> = {
  sale: "sell",
  order: "store",
  booking: "calendar",
  document: "file",
  payment: "money",
  message: "send",
};

const DOT: Record<HistoryEntry["tone"], string> = {
  teal: "bg-teal-50 text-teal-700",
  ok: "bg-success-tint text-success-ink",
  warn: "bg-gold-100 text-gold-700",
  bad: "bg-danger-tint text-danger-ink",
  info: "bg-info-light text-info-ink",
  mute: "bg-neutral-100 text-neutral-600",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

export function History({ entries }: { entries: HistoryEntry[] }) {
  const [filter, setFilter] = useState("all");
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
  const shown = entries.filter((e) => kinds.includes(e.kind));
  const present = FILTERS.filter((f) => f.key === "all" || entries.some((e) => f.kinds.includes(e.kind)));

  return (
    <section aria-labelledby="history" className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="history" className="font-heading text-base font-bold text-ink-heading">
          History
        </h2>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {present.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`tap flex h-9 flex-none items-center whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold ${
                filter === f.key ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-neutral-600">Nothing here yet.</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((e, i) => {
            const body = (
              <>
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] ${DOT[e.tone]}`}>
                  <Icon name={ICON[e.kind]} size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <strong className="text-[13.5px] text-ink">{e.title}</strong>
                    <span className="flex-none text-xs text-neutral-600">{day(e.at)}</span>
                  </span>
                  {e.detail && <span className="text-xs text-neutral-600">{e.detail}</span>}
                  <span className="flex items-center gap-2">
                    <Tag>{e.from}</Tag>
                    {e.amount !== null && e.kind !== "payment" && <span className="num text-xs font-semibold text-ink">{formatGHS(e.amount)}</span>}
                  </span>
                </span>
              </>
            );
            return (
              <li key={e.id} className={i > 0 ? "border-t border-neutral-100" : ""}>
                {e.href ? (
                  <Link href={e.href} className="tap flex gap-3 rounded-[10px] py-2.5 hover:bg-teal-50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function ConsentSwitch({ customerId, agreed, canChange }: { customerId: string; agreed: boolean; canChange: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canChange) return null;
  async function flip() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted: !agreed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "That did not go through. Tap again.");
      else router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-col gap-1.5">
      <button type="button" onClick={flip} disabled={busy} aria-pressed={agreed} className={`${secondaryAction} min-h-[40px] justify-center disabled:opacity-60`}>
        {busy ? "Saving their choice..." : agreed ? "They have opted out" : "They agreed to offers"}
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-danger-ink">
          {error}
        </span>
      )}
    </span>
  );
}
