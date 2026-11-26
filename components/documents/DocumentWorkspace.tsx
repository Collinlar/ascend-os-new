"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import type { DocumentType } from "@/lib/domains/types";
import { EmptyState, Panel as Surface, primaryAction, secondaryAction } from "@/components/shell/Page";
import { StatusPill, Tag, type Tone } from "@/components/shell/Parts";
import Pills from "@/components/shell/Pills";
import { Icon } from "@/components/shell/icons";

export interface DocumentRow {
  id: string;
  type: string;
  status: string;
  number: string | null;
  total: number | null;
  dueDate: string | null;
  createdAt: string;
  issuedAt: string | null;
  /** Still owed after payments and credits (Financial Foundation); null when nothing is. */
  outstanding: number | null;
  customerName: string | null;
  /** Where it came from: "Booking", "Shop order", "From QUO-0012". */
  cameFrom: string;
}

/** What is owed on invoices, from the Financial Foundation (receivables_aging). */
export interface OwedSummary {
  total: number;
  count: number;
  overdueCount: number;
  overdueTotal: number;
}

interface DraftLine {
  /** Set when the line came from the catalogue, so the document can be
   *  joined back to what was sold. Null for a line typed by hand. */
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface CatalogueOption {
  id: string;
  name: string;
  kind: string;
  basePrice: number | null;
}

const BLANK_LINE: DraftLine = {
  itemId: null,
  description: "",
  quantity: "1",
  unitPrice: "",
};

const TYPE_LABEL: Record<string, string> = {
  quotation: "Quote",
  proforma: "Proforma",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
  purchase_order: "Purchase order",
};

export default function DocumentWorkspace({
  businessId,
  documents,
  catalogue,
  query = "",
  startCreating: startWith = null,
}: {
  businessId: string;
  documents: DocumentRow[];
  catalogue: CatalogueOption[];
  /** What the module bar's search asked for (?q=). */
  query?: string;
  /** Opened from "New invoice" or "New quotation" in the module bar (?new=). */
  startCreating?: DocumentType | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<DocumentType>("invoice");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...BLANK_LINE }]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Finding one document among hundreds. A filing cabinet nobody can search
  // is a pile.
  const [shelf, setShelf] = useState<"all" | "owed" | "invoice" | "receipt" | "quotation" | "purchase_order" | "credit_note">("all");

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0),
        0
      ),
    [lines]
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // Six is what fits on a 375px screen without the list becoming the page.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return [];
    return catalogue.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6);
  }, [catalogue, search]);

  function addFromCatalogue(item: CatalogueOption) {
    const line: DraftLine = {
      itemId: item.id,
      description: item.name,
      quantity: "1",
      unitPrice: item.basePrice === null ? "" : String(item.basePrice),
    };
    setLines((prev) => {
      // Fill the empty line the form opens with rather than leaving it
      // stranded above the thing the merchant just picked.
      const blank = prev.findIndex((l) => !l.itemId && l.description.trim() === "");
      if (blank === -1) return [...prev, line];
      return prev.map((l, i) => (i === blank ? line : l));
    });
    setSearch("");
  }

  async function create(issueNow: boolean) {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          type,
          ...(type === "purchase_order"
            ? { supplierName: customerName, supplierPhone: customerPhone }
            : { customerName, customerPhone, customerEmail }),
          issueNow,
          lines: lines.map((l) => ({
            itemId: l.itemId,
            description: l.description,
            quantity: parseFloat(l.quantity) || 0,
            unitPrice: parseFloat(l.unitPrice) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save this document. Tap again.");
        return;
      }
      setCreating(false);
      setLines([{ ...BLANK_LINE }]);
      setSearch("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      // Straight to the document, where it can be sent, paid and followed.
      if (data.documentId) router.push(`/documents/${data.documentId}`);
      else router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const OWED = new Set(["issued", "sent", "delivered", "viewed", "partially_paid", "overdue"]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (shelf === "owed") {
        if (d.type !== "invoice" || !OWED.has(d.status)) return false;
      } else if (shelf !== "all" && d.type !== shelf) {
        return false;
      }
      if (q === "") return true;
      return (
        (d.number ?? "").toLowerCase().includes(q) ||
        (d.customerName ?? "").toLowerCase().includes(q) ||
        (TYPE_LABEL[d.type] ?? d.type).toLowerCase().includes(q) ||
        d.cameFrom.toLowerCase().includes(q)
      );
    });
  }, [documents, query, shelf]);

  const SHELVES: Array<[typeof shelf, string]> = [
    ["all", "Everything"],
    ["owed", "Not paid yet"],
    ["invoice", "Invoices"],
    ["quotation", "Quotations"],
    ["receipt", "Receipts"],
    ["purchase_order", "Purchase orders"],
    ["credit_note", "Credit notes"],
  ];
  const shelfCount = (key: typeof shelf) =>
    key === "all"
      ? undefined
      : documents.filter((d) => (key === "owed" ? d.type === "invoice" && OWED.has(d.status) : d.type === key)).length;
  // "New invoice" lives in the top bar, so it arrives as ?new=invoice. Open
  // the form, then take the flag off the address so the next tap opens it.
  useEffect(() => {
    if (!startWith) return;
    setType(startWith);
    setCreating(true);
    router.replace(query ? `/documents?q=${encodeURIComponent(query)}` : "/documents", { scroll: false });
  }, [startWith, query, router]);

  return (
    <div className="space-y-6">
      {note && (
        <p className="rounded-panel bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800" role="status">
          {note}
        </p>
      )}

      {error && (
        <p className="rounded-panel bg-gold-100 px-4 py-3 text-sm font-semibold text-gold-700" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <div className="rounded-[18px] border border-line-brand bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {(["invoice", "quotation", "receipt", "purchase_order"] as DocumentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`tap rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold ${
                  type === t ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"
                }`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* A purchase order faces the other way: the business is the
              buyer, so it asks who they are ordering from. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={
                type === "purchase_order" ? "Who are you ordering from?" : "Who is this for?"
              }
              aria-label={type === "purchase_order" ? "Supplier name" : "Customer name"}
              className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              inputMode="tel"
              placeholder={
                type === "purchase_order" ? "Their phone number" : "Their WhatsApp number"
              }
              aria-label={type === "purchase_order" ? "Supplier phone" : "Customer WhatsApp number"}
              className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
            {/* Optional, and second to WhatsApp on purpose. A company
                paying on account wants it in the inbox its accounts team
                works from; a trader does not want to be asked. */}
            {type !== "purchase_order" && (
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                inputMode="email"
                placeholder="Their email, if they use one"
                aria-label="Customer email address"
                className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:col-span-2"
              />
            )}
          </div>

          {/* The catalogue the business already keeps. Typing a price that
              is already recorded is how two versions of the truth start,
              so the list comes first and the blank line stays underneath
              for whatever the catalogue has never heard of. */}
          {catalogue.length > 0 && (
            <div className="mt-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search what you sell"
                aria-label="Search your products and services"
                className="min-h-[44px] w-full rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
              />
              {matches.length > 0 && (
                <div className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-control border border-neutral-100">
                  {matches.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addFromCatalogue(item)}
                      className="tap flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-light-grey"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {item.name}
                      </span>
                      <span className="num flex-none text-sm font-bold text-teal-dark">
                        {item.basePrice === null ? "No price yet" : formatGHS(item.basePrice)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {search.trim() !== "" && matches.length === 0 && (
                <p className="mt-2 text-sm font-medium text-slate-grey">
                  Nothing in your catalogue matches that. Type the line below instead.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                {line.itemId ? (
                  <span className="col-span-3 flex items-center justify-between gap-2 rounded-control bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-800">
                    <span className="min-w-0 truncate">{line.description}</span>
                    <button
                      onClick={() => updateLine(i, { itemId: null })}
                      aria-label={`Unlink ${line.description} from your catalogue`}
                      className="flex-none font-bold"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    placeholder="What are you charging for?"
                    className="col-span-3 min-h-[44px] rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
                  />
                )}
                <input
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  inputMode="decimal"
                  placeholder="Qty"
                  className="min-h-[44px] rounded-control border border-neutral-200 px-2 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
                />
                <input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="Price"
                  className="col-span-2 min-h-[44px] rounded-control border border-neutral-200 px-2 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
                />
              </div>
            ))}
            <button
              onClick={() => setLines((prev) => [...prev, { ...BLANK_LINE }])}
              className="tap text-sm font-medium text-teal-dark"
            >
              Add another line
            </button>
          </div>

          <p className="num mt-4 text-right font-heading text-xl font-extrabold text-ink-heading">{formatGHS(total)}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => create(true)}
              disabled={busy === "create"}
              className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}
            >
              {busy === "create" ? `Sending your ${TYPE_LABEL[type].toLowerCase()} out...` : `Send this ${TYPE_LABEL[type].toLowerCase()} out`}
            </button>
            <button
              onClick={() => create(false)}
              disabled={busy === "create"}
              className={`${secondaryAction} disabled:opacity-60`}
            >
              Save as draft
            </button>
            <button
              onClick={() => setCreating(false)}
              className="tap px-3 text-sm font-semibold text-neutral-600"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <Pills
          pills={SHELVES.map(([key, label]) => ({ label, count: shelfCount(key) }))}
          active={SHELVES.find(([key]) => key === shelf)?.[1] ?? "Everything"}
          onPick={(label) => setShelf(SHELVES.find(([, l]) => l === label)?.[0] ?? "all")}
          trailing={`${visible.length} ${visible.length === 1 ? "document" : "documents"}`}
        />
      )}

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet."
          detail="Your first invoice takes about a minute."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing here matches."
          detail="Try a different word, or tap Everything to see them all."
        />
      ) : (
        <Surface>
          <div
            aria-hidden
            className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${DOC_COLS}`}
          >
            <span>Document</span>
            <span>Customer or supplier, and where it came from</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Balance</span>
            <span>Status</span>
          </div>
          {visible.map((doc, i) => {
            const sent = Boolean(doc.number);
            // The relay marks these on a tick, so the stored status is the
            // answer. The date comparison stays as a fallback for the few
            // minutes between a date passing and the next tick.
            const overdue =
              doc.status === "overdue" ||
              (sent &&
                doc.dueDate !== null &&
                !["paid", "cancelled", "credited", "expired"].includes(doc.status) &&
                new Date(doc.dueDate) < new Date());
            const status = statusChip(doc, overdue);
            const balance = doc.type === "invoice" && sent ? doc.outstanding ?? 0 : null;
            return (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className={`tap flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] hover:bg-teal-50 ${DOC_COLS} ${i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate font-semibold text-ink ${doc.number ? "mono text-[13px]" : ""}`}>
                    {doc.number ?? "Draft"}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {TYPE_LABEL[doc.type] ?? doc.type} ·{" "}
                    {doc.dueDate && doc.type === "invoice" && !["paid", "credited"].includes(doc.status)
                      ? `due ${shortDay(doc.dueDate)}`
                      : doc.issuedAt
                        ? shortDay(doc.issuedAt)
                        : `started ${shortDay(doc.createdAt)}`}
                  </span>
                </span>
                <span className="order-last flex min-w-0 basis-full flex-col items-start gap-1 lg:order-none lg:basis-auto">
                  <span className="max-w-full truncate text-ink">
                    <span className="sr-only">Who: </span>
                    {doc.customerName ?? "No name given"}
                  </span>
                  <span className="max-w-full truncate">
                    <span className="sr-only">Came from: </span>
                    <Tag>{doc.cameFrom}</Tag>
                  </span>
                </span>
                <span className="num ml-auto flex-none text-right font-bold text-ink lg:ml-0">
                  <span className="sr-only">Amount: </span>
                  {doc.total !== null ? formatGHS(doc.total) : "None"}
                </span>
                <span className="num hidden text-right text-neutral-600 lg:block">
                  <span className="sr-only">Balance: </span>
                  {balance === null ? "" : balance > 0.005 ? formatGHS(balance) : "Nothing"}
                </span>
                <span className="flex-none">
                  <span className="sr-only">Status: </span>
                  <StatusPill tone={status.tone}>{status.text}</StatusPill>
                </span>
              </Link>
            );
          })}
        </Surface>
      )}
    </div>
  );
}

// The design's table, from 1024px: the document and its date; who, with
// where it came from beneath; amount; balance; status (Modules M3).
const DOC_COLS = "lg:grid lg:grid-cols-[140px_minmax(0,1fr)_100px_100px_130px] lg:items-center lg:gap-3";

// What the customer still owes, and whether it is late, said the way the
// design says it: "12 days overdue", "Part paid", "Paid".
function statusChip(doc: DocumentRow, overdue: boolean): { text: string; tone: Tone } {
  if (!doc.number) return { text: "Draft", tone: "mute" };
  const late = doc.dueDate ? Math.floor((Date.now() - new Date(`${doc.dueDate}T23:59:59`).getTime()) / 86400000) + 1 : 0;
  switch (doc.status) {
    case "paid":
      return { text: "Paid", tone: "ok" };
    case "credited":
      return { text: "Credited", tone: "mute" };
    case "refunded":
      return { text: "Refunded", tone: "mute" };
    case "cancelled":
      return { text: "Cancelled", tone: "mute" };
    case "expired":
      return { text: "Expired", tone: "mute" };
    case "accepted":
    case "approved":
      return { text: "Accepted", tone: "ok" };
    case "pending_approval":
      return { text: "Waiting for approval", tone: "warn" };
    case "change_requested":
      return { text: "Change asked for", tone: "warn" };
  }
  if (overdue && late > 0) return { text: `${late} day${late === 1 ? "" : "s"} overdue`, tone: late > 30 ? "bad" : "warn" };
  if (doc.status === "partially_paid") return { text: "Part paid", tone: "info" };
  if (doc.status === "viewed") return { text: "Seen by them", tone: "info" };
  if (doc.type === "receipt" || doc.type === "credit_note") return { text: "Issued", tone: "mute" };
  return { text: "Sent", tone: "info" };
}

function shortDay(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
