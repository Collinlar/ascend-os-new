"use client";

import { useState } from "react";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel, PanelRow } from "@/components/shell/Page";

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdVia: string;
  orders: number;
  sales: number;
  bookings: number;
  documents: number;
  spent: number;
  owed: number;
  lastSeen: string | null;
}

export interface HistoryRow {
  kind: string;
  reference: string | null;
  happenedAt: string | null;
  amount: number | null;
  status: string;
}

// Where the customer first arrived from. Worth showing: a merchant treats
// somebody who walked into the shop differently from somebody who found
// them on Discover.
const VIA: Record<string, string> = {
  pos: "met at the counter",
  shop: "ordered online",
  services: "booked a service",
  documents: "sent a document",
  import: "imported",
  manual: "added by hand",
};

export default function CustomerList({
  customers,
  query,
}: {
  customers: CustomerRow[];
  query: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function open(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (history[id]) return;
    setLoading(id);
    try {
      const res = await fetch(`/api/customers/${id}/history`);
      const data = await res.json();
      if (res.ok) setHistory((prev) => ({ ...prev, [id]: data.history ?? [] }));
    } catch {
      // The list still works without the history; opening again retries.
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <form className="mb-3.5" action="/customers">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, number or email"
          aria-label="Search your customers"
          className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
        />
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={query ? "Nobody matches that." : "No customers yet."}
          detail={
            query
              ? "Try a different word, or clear the search."
              : "They appear here as soon as somebody buys, books or is sent a document."
          }
        />
      ) : (
        <Panel>
          {customers.map((c, i) => {
            const dealings = [
              c.sales && `${c.sales} sale${c.sales === 1 ? "" : "s"}`,
              c.orders && `${c.orders} order${c.orders === 1 ? "" : "s"}`,
              c.bookings && `${c.bookings} booking${c.bookings === 1 ? "" : "s"}`,
              c.documents && `${c.documents} document${c.documents === 1 ? "" : "s"}`,
            ].filter(Boolean) as string[];

            return (
              <div key={c.id}>
                <PanelRow last={i === customers.length - 1 && openId !== c.id}>
                  <span
                    aria-hidden
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-light-grey text-sm font-extrabold text-ink-slate"
                  >
                    {initials(c.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-ink">
                      {c.name}
                    </p>
                    <p className="text-[12.5px] font-medium text-slate-grey">
                      {dealings.length > 0
                        ? dealings.join(" · ")
                        : VIA[c.createdVia] ?? "added by hand"}
                      {c.phone && ` · ${c.phone}`}
                    </p>
                  </div>

                  <div className="flex flex-none flex-col items-end gap-0.5">
                    {c.spent > 0 && (
                      <span className="num text-[13.5px] font-extrabold text-ink">
                        {formatGHS(c.spent)}
                      </span>
                    )}
                    {c.owed > 0 && (
                      <span className="num text-[12px] font-bold text-gold-ink">
                        {formatGHS(c.owed)} owed
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => open(c.id)}
                    aria-expanded={openId === c.id}
                    className="tap flex flex-none items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                  >
                    {openId === c.id ? "Close" : "History"}
                  </button>
                </PanelRow>

                {openId === c.id && (
                  <div className="border-b border-[#EEF3F7] bg-light-grey px-[22px] py-4">
                    {loading === c.id ? (
                      <p className="text-[13px] font-medium text-slate-grey">
                        Looking through their record...
                      </p>
                    ) : (history[c.id] ?? []).length === 0 ? (
                      <p className="text-[13px] font-medium text-slate-grey">
                        Nothing recorded against them yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(history[c.id] ?? []).map((h, n) => (
                          <div
                            key={`${h.kind}-${h.reference}-${n}`}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                          >
                            <p className="text-[13px] font-medium text-ink">
                              <span className="font-bold">{h.kind}</span>
                              {h.reference && ` ${h.reference}`}
                              <span className="text-slate-grey"> · {h.status}</span>
                            </p>
                            <p className="text-[12.5px] font-medium text-slate-grey">
                              {h.amount !== null && (
                                <span className="num font-bold text-ink">
                                  {formatGHS(Number(h.amount))}
                                </span>
                              )}
                              {h.happenedAt && ` · ${day(h.happenedAt)}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters || name.slice(0, 1).toUpperCase();
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
