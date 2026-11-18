"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel, primaryAction } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";
import { Icon } from "@/components/shell/icons";

// Customers (v3 design). One person however they bought: a till sale, an
// online order, a booking and an invoice all sit under the same record.
// From 1024px the design's table (customer, phone, visits, spent, owed, last
// seen); below that, one card each. Opening a row shows their history and
// whether they agreed to offers.

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
  marketingConsent: boolean;
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
  pos: "Met at the counter",
  shop: "Ordered online",
  services: "Booked a service",
  documents: "Sent a document",
  import: "Imported",
  manual: "Added by hand",
};

const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_150px_80px_120px_110px_120px_104px] lg:items-center lg:gap-4";

export default function CustomerList({
  customers,
  query,
  canRecordConsent,
}: {
  customers: CustomerRow[];
  query: string;
  /** customers.manage (0088): only then is the consent switch, or adding someone, offered. */
  canRecordConsent: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  // Held here so the switch answers immediately. The record behind it is
  // what counts, and the server writes that.
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState("Everyone");
  const [adding, setAdding] = useState(false);

  const groups = useMemo(
    () =>
      ({
        "Owe you": customers.filter((c) => c.owed > 0),
        "Agreed to offers": customers.filter((c) => consent[c.id] ?? c.marketingConsent),
        "Not seen in 90 days": customers.filter((c) => c.lastSeen && Date.now() - new Date(c.lastSeen).getTime() > 90 * 86400000),
      }) as Record<string, CustomerRow[]>,
    [customers, consent]
  );
  const shown = filter === "Everyone" ? customers : groups[filter] ?? customers;

  async function setMarketing(id: string, granted: boolean) {
    setSaving(id);
    setConsent((prev) => ({ ...prev, [id]: granted }));
    try {
      const res = await fetch(`/api/customers/${id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted }),
      });
      if (!res.ok) {
        // Put the switch back where it was rather than showing a state the
        // database does not agree with.
        setConsent((prev) => ({ ...prev, [id]: !granted }));
      }
    } catch {
      setConsent((prev) => ({ ...prev, [id]: !granted }));
    } finally {
      setSaving(null);
    }
  }

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
      <div className="mb-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <form className="flex-1" action="/customers" role="search">
          <label className="flex h-11 items-center gap-2.5 rounded-control border border-line-brand bg-white px-3.5 text-neutral-500 focus-within:border-teal">
            <Icon name="search" size={16} />
            <span className="sr-only">Search your customers</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Who are you looking for? A name, number or email"
              className="min-h-0 w-full border-0 bg-transparent text-base text-ink placeholder:text-neutral-500 focus:outline-none"
            />
          </label>
        </form>
        {canRecordConsent && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryAction} justify-center`}>
            <Icon name="plus" size={16} />
            Add a customer
          </button>
        )}
      </div>
      {canRecordConsent && adding && <AddCustomer onAdded={() => router.refresh()} onClose={() => setAdding(false)} />}

      {customers.length > 0 && (
        <Pills
          pills={[
            { label: "Everyone" },
            { label: "Owe you", count: groups["Owe you"].length },
            { label: "Agreed to offers", count: groups["Agreed to offers"].length },
            { label: "Not seen in 90 days", count: groups["Not seen in 90 days"].length },
          ]}
          active={filter}
          onPick={setFilter}
          trailing={`${shown.length} ${shown.length === 1 ? "customer" : "customers"}`}
        />
      )}

      {shown.length === 0 ? (
        <EmptyState
          title={query ? "Nobody matches that." : customers.length > 0 ? "Nobody here right now." : "No customers yet."}
          detail={
            query
              ? "Try a different word, or clear the search."
              : customers.length > 0
                ? "Pick Everyone to see the whole list."
                : "They appear here as soon as somebody buys, books or is sent a document."
          }
        />
      ) : (
        <Panel>
          <div
            aria-hidden
            className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${COLS}`}
          >
            <span>Customer</span>
            <span>Phone</span>
            <span className="text-right">Visits</span>
            <span className="text-right">Spent</span>
            <span className="text-right">Owes you</span>
            <span>Last seen</span>
            <span />
          </div>
          {shown.map((c, i) => {
            const visits = c.sales + c.orders + c.bookings + c.documents;
            const opened = openId === c.id;
            const agreed = consent[c.id] ?? c.marketingConsent;
            return (
              <div key={c.id} className={i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}>
                <div className={`flex items-center gap-3 px-5 py-3 ${COLS}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-teal-50 text-[11.5px] font-bold text-teal-800"
                    >
                      {initials(c.name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold text-ink">{c.name}</span>
                      <span className="truncate text-xs text-neutral-500">
                        <span className="lg:hidden">
                          {visits > 0 ? `${visits} visit${visits === 1 ? "" : "s"}` : VIA[c.createdVia] ?? "Added by hand"}
                          {c.spent > 0 ? ` · spent ${formatGHS(c.spent)}` : ""}
                          {c.phone && c.owed === 0 ? ` · ${local(c.phone)}` : ""}
                        </span>
                        {c.owed > 0 && (
                          <span className="num block font-bold text-gold-700 lg:hidden">Owes you {formatGHS(c.owed)}</span>
                        )}
                        <span className="hidden lg:inline">{VIA[c.createdVia] ?? "Added by hand"}</span>
                      </span>
                    </span>
                  </div>

                  <span className="hidden truncate text-[13.5px] text-neutral-600 lg:block">
                    <span className="sr-only">Phone: </span>
                    {c.phone ? local(c.phone) : "None"}
                  </span>
                  <span className="num hidden text-right text-[13.5px] text-ink lg:block">
                    <span className="sr-only">Visits: </span>
                    {visits}
                  </span>
                  <span className="num hidden text-right text-[13.5px] font-semibold text-ink lg:block">
                    <span className="sr-only">Spent: </span>
                    {formatGHS(c.spent)}
                  </span>
                  <span className={`num hidden text-right text-[13.5px] lg:block ${c.owed > 0 ? "font-bold text-gold-700" : "text-neutral-500"}`}>
                    <span className="sr-only">Owes you: </span>
                    {c.owed > 0 ? formatGHS(c.owed) : "Nothing"}
                  </span>
                  <span className="hidden text-[13.5px] text-neutral-600 lg:block">
                    <span className="sr-only">Last seen: </span>
                    {c.lastSeen ? seen(c.lastSeen) : "Not yet"}
                  </span>

                  <button
                    onClick={() => open(c.id)}
                    aria-expanded={opened}
                    className="tap flex flex-none items-center justify-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand lg:w-full"
                  >
                    {opened ? "Close" : "History"}
                  </button>
                </div>

                {opened && (
                  <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4">
                    {loading === c.id ? (
                      <p className="text-[13px] text-neutral-600">Looking through their record...</p>
                    ) : (history[c.id] ?? []).length === 0 ? (
                      <p className="text-[13px] text-neutral-600">Nothing recorded against them yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {(history[c.id] ?? []).map((h, n) => (
                          <div key={`${h.kind}-${h.reference}-${n}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            <p className="text-[13px] text-ink">
                              <span className="font-semibold">{h.kind}</span>
                              {h.reference && ` ${h.reference}`}
                              <span className="text-neutral-500"> · {h.status}</span>
                            </p>
                            <p className="text-[12.5px] text-neutral-500">
                              {h.amount !== null && <span className="num font-semibold text-ink">{formatGHS(Number(h.amount))}</span>}
                              {h.happenedAt && ` · ${day(h.happenedAt)}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Whether this business may market to them, and the
                        record that proves it either way. */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-3">
                      <p className="text-[13px] text-neutral-600">
                        {agreed ? "Happy to receive offers from you." : "Only messages about their own orders."}
                        {c.email ? ` ${c.email}` : ""}
                      </p>
                      {canRecordConsent && (
                        <button
                          onClick={() => setMarketing(c.id, !agreed)}
                          disabled={saving === c.id}
                          aria-pressed={agreed}
                          className="tap flex items-center rounded-control border border-line-brand bg-white px-4 text-[13px] font-bold text-teal-800 hover:border-teal-brand disabled:opacity-60"
                        >
                          {saving === c.id ? "Saving their choice..." : agreed ? "They have opted out" : "They agreed to offers"}
                        </button>
                      )}
                    </div>
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

// Adding someone by hand. If the number or email is already a customer,
// that record is used, and the owner is told so.
function AddCustomer({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That did not go through. Tap add again.");
        return;
      }
      setDone(data.created ? `${name.trim()} is on your list.` : "They were already on your list, under the same number or email.");
      setName("");
      setPhone("");
      setEmail("");
      onAdded();
    } catch {
      setError("We could not reach Ascend just now. Check the connection and tap add again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3.5 w-full rounded-panel border border-line-brand bg-white p-4 sm:max-w-[440px]">
      <p className="font-heading text-base font-bold text-ink-heading">Add a customer</p>
      <label htmlFor="cust-name" className="mt-3 block text-[13px] font-semibold text-ink">
        Their name
      </label>
      <input
        id="cust-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What do you call them?"
        className="mt-1 min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink"
      />
      <label htmlFor="cust-phone" className="mt-3 block text-[13px] font-semibold text-ink">
        WhatsApp number
      </label>
      <input
        id="cust-phone"
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="024 000 0000"
        className="mt-1 min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink"
      />
      <label htmlFor="cust-email" className="mt-3 block text-[13px] font-semibold text-ink">
        Email, if they use one
      </label>
      <input
        id="cust-email"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 min-h-[44px] w-full rounded-control border border-neutral-200 px-3 text-base text-ink"
      />
      {error && (
        <p className="mt-3 rounded-control bg-gold-100 px-3 py-2 text-[13px] font-semibold text-gold-700" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 rounded-control bg-teal-50 px-3 py-2 text-[13px] font-semibold text-teal-800" role="status">
          {done}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={add} disabled={busy} className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}>
          {busy ? "Adding them..." : "Add them"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap flex items-center rounded-control border border-neutral-200 px-4 text-[13px] font-bold text-neutral-700"
        >
          Close
        </button>
      </div>
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

// +233 24 771 0932 reads as the number people say: 024 771 0932.
function local(e164: string): string {
  if (e164.startsWith("+233") && e164.length === 13) {
    const d = "0" + e164.slice(4);
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return e164;
}

function seen(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return day(iso);
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
