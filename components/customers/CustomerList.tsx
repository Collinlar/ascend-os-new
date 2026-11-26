"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel, primaryAction } from "@/components/shell/Page";
import Pills from "@/components/shell/Pills";
import { Avatar, Tag } from "@/components/shell/Parts";
import { visitsOf } from "@/lib/customers/visits";

// Customers (v3 design). One person however they bought: a till sale, an
// online order, a booking and an invoice all sit under the same record.
// From 1024px the design's table (customer, came from, last visit, visits,
// lifetime, owes, can message); below that, one card each. A row opens the
// customer's profile with their whole history (Modules M5).

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


export default function CustomerList({
  customers,
  query,
  canRecordConsent,
  startAdding = false,
}: {
  customers: CustomerRow[];
  query: string;
  /** customers.manage (0088): only then is adding someone offered. */
  canRecordConsent: boolean;
  /** Opened from "Add customer" in the module bar (?add=1). */
  startAdding?: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("Everyone");
  const [adding, setAdding] = useState(startAdding);
  // "Add customer" lives in the top bar, so it arrives as ?add=1. Open the
  // form, then take the flag off the address so the next tap opens it again.
  useEffect(() => {
    if (!startAdding) return;
    setAdding(true);
    router.replace(query ? `/customers?q=${encodeURIComponent(query)}` : "/customers", { scroll: false });
  }, [startAdding, query, router]);

  const groups = useMemo(
    () =>
      ({
        "Came back": customers.filter((c) => visitsOf(c) > 1),
        "Owe you": customers.filter((c) => c.owed > 0),
        "Agreed to offers": customers.filter((c) => c.marketingConsent),
        "Not seen in 90 days": customers.filter((c) => c.lastSeen && Date.now() - new Date(c.lastSeen).getTime() > 90 * 86400000),
      }) as Record<string, CustomerRow[]>,
    [customers]
  );
  const shown = filter === "Everyone" ? customers : groups[filter] ?? customers;

  return (
    <div>
      {canRecordConsent && adding && <AddCustomer onAdded={() => router.refresh()} onClose={() => setAdding(false)} />}

      {customers.length > 0 && (
        <Pills
          pills={[
            { label: "Everyone" },
            { label: "Came back", count: groups["Came back"].length },
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
            <span>Came from</span>
            <span>Last visit</span>
            <span className="text-right">Visits</span>
            <span className="text-right">Lifetime</span>
            <span className="text-right">Owes you</span>
            <span>Can message</span>
          </div>
          {shown.map((c, i) => {
            const visits = visitsOf(c);
            return (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className={`tap flex items-center gap-3 px-5 py-3 hover:bg-teal-50 ${COLS} ${i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.name} size={34} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-semibold text-ink">{c.name}</span>
                    <span className="truncate text-xs text-neutral-500">
                      {c.phone ? local(c.phone) : c.email ?? "No number"}
                      <span className="lg:hidden">
                        {visits > 0 ? ` · ${visits} visit${visits === 1 ? "" : "s"}` : ""}
                        {c.spent > 0 ? ` · ${formatGHS(c.spent)}` : ""}
                      </span>
                    </span>
                    {c.owed > 0 && <span className="num text-xs font-bold text-gold-700 lg:hidden">Owes you {formatGHS(c.owed)}</span>}
                  </span>
                </span>
                <span className="hidden min-w-0 lg:block">
                  <span className="sr-only">Came from: </span>
                  <Tag>{VIA[c.createdVia] ?? "Added by hand"}</Tag>
                </span>
                <span className="hidden text-[13.5px] text-neutral-600 lg:block">
                  <span className="sr-only">Last visit: </span>
                  {c.lastSeen ? seen(c.lastSeen) : "Not yet"}
                </span>
                <span className="num hidden text-right text-[13.5px] text-ink lg:block">
                  <span className="sr-only">Visits: </span>
                  {visits}
                </span>
                <span className="num hidden text-right text-[13.5px] font-semibold text-ink lg:block">
                  <span className="sr-only">Lifetime: </span>
                  {formatGHS(c.spent)}
                </span>
                <span className={`num hidden text-right text-[13.5px] lg:block ${c.owed > 0 ? "font-bold text-gold-700" : "text-neutral-500"}`}>
                  <span className="sr-only">Owes you: </span>
                  {c.owed > 0 ? formatGHS(c.owed) : "Nothing"}
                </span>
                <span className="hidden text-[13px] text-neutral-600 lg:block">
                  <span className="sr-only">Can message: </span>
                  {c.phone ? (c.marketingConsent ? "WhatsApp, offers too" : "WhatsApp, their orders") : c.email ? "Email" : "No way yet"}
                </span>
              </Link>
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

// The design's table, from 1024px.
const COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_130px_100px_60px_110px_100px_150px] lg:items-center lg:gap-3";
