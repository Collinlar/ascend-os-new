"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";
import { EmptyState, FigureRow, Panel as Surface, primaryAction, secondaryAction } from "@/components/shell/Page";
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

const CONVERT_LABEL: Record<string, string> = {
  proforma: "Make a proforma",
  invoice: "Turn into an invoice",
  receipt: "Mark paid, make a receipt",
  credit_note: "Issue a credit note",
};

export default function DocumentWorkspace({
  businessId,
  documents,
  catalogue,
  owed,
}: {
  businessId: string;
  documents: DocumentRow[];
  catalogue: CatalogueOption[];
  owed: OwedSummary;
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
  // Which invoice is being credited, and on what grounds.
  const [crediting, setCrediting] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Finding one document among hundreds. A filing cabinet nobody can search
  // is a pile.
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState<"all" | "owed" | "invoice" | "receipt" | "quotation" | "purchase_order">("all");

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
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function credit(documentId: string) {
    setBusy(documentId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "credit",
          reason: creditReason,
          // Blank means the whole of what is still owed, which is what a
          // merchant means when they do not stop to work out a figure.
          ...(creditAmount.trim() === "" ? {} : { amount: parseFloat(creditAmount) }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not issue that credit note. Tap again.");
        return;
      }
      setNote(
        data.remaining > 0
          ? `${data.number} issued for ${formatGHS(data.credited)}. ${formatGHS(data.remaining)} of this invoice can still be credited.`
          : `${data.number} issued for ${formatGHS(data.credited)}. This invoice is now fully credited.`
      );
      setCrediting(null);
      setCreditReason("");
      setCreditAmount("");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function act(documentId: string, action: "issue" | "convert", toType?: DocumentType) {
    setBusy(documentId);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, toType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not do that. Tap again.");
        return;
      }
      router.refresh();
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
        (TYPE_LABEL[d.type] ?? d.type).toLowerCase().includes(q)
      );
    });
  }, [documents, query, shelf]);

  const drafts = useMemo(() => documents.filter((d) => !d.number).length, [documents]);

  const SHELVES: Array<[typeof shelf, string]> = [
    ["all", "Everything"],
    ["owed", "Not paid yet"],
    ["invoice", "Invoices"],
    ["quotation", "Quotations"],
    ["receipt", "Receipts"],
    ["purchase_order", "Purchase orders"],
  ];
  const shelfCount = (key: typeof shelf) =>
    key === "all"
      ? undefined
      : documents.filter((d) => (key === "owed" ? d.type === "invoice" && OWED.has(d.status) : d.type === key)).length;
  const startCreating = (t: DocumentType) => {
    setType(t);
    setCreating(true);
  };

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

      {/* What is owed, from the Financial Foundation: after payments and
          credits, not the face value of the invoices. */}
      {(owed.total > 0 || drafts > 0) && (
        <FigureRow
          figures={[
            {
              label: "Owed on invoices",
              value: formatGHS(owed.total),
              sub: owed.count > 0 ? `${owed.count} invoice${owed.count === 1 ? "" : "s"} still to be paid` : "Nothing outstanding",
            },
            {
              label: "Overdue",
              value: formatGHS(owed.overdueTotal),
              sub: owed.overdueCount > 0 ? `${owed.overdueCount} past the due date` : "None past the due date",
              tone: owed.overdueCount > 0 ? "warn" : undefined,
            },
            { label: "Drafts", value: String(drafts), sub: drafts > 0 ? "Not sent out yet" : "None waiting" },
          ]}
        />
      )}

      {!creating ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          {documents.length > 0 && (
            <label className="flex h-11 flex-1 items-center gap-2.5 rounded-control border border-line-brand bg-white px-3.5 text-neutral-500 focus-within:border-teal">
              <Icon name="search" size={16} />
              <span className="sr-only">Search your documents</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Which one? A number or a name"
                className="min-h-0 w-full border-0 bg-transparent text-base text-ink placeholder:text-neutral-500 focus:outline-none"
              />
            </label>
          )}
          <div className="flex flex-none gap-2 sm:ml-auto">
            <button onClick={() => startCreating("quotation")} className={`${secondaryAction} flex-1 justify-center sm:flex-none`}>
              <Icon name="plus" size={16} />
              New quotation
            </button>
            <button onClick={() => startCreating("invoice")} className={`${primaryAction} flex-1 justify-center sm:flex-none`}>
              <Icon name="plus" size={16} />
              New invoice
            </button>
          </div>
        </div>
      ) : (
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
            <span>Number</span>
            <span>Who</span>
            <span>Issued</span>
            <span>Due</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
          </div>
          {visible.map((doc, i) => {
            const conversions = doc.number
              ? (DOCUMENT_CONVERSIONS[doc.type as DocumentType] ?? [])
              : [];
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

            return (
              <div key={doc.id} className={i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"}>
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3 text-[13.5px] ${DOC_COLS}`}>
                  <span className={`min-w-0 truncate font-semibold text-ink lg:text-[13px] ${doc.number ? "mono" : ""}`}>
                    <span className="sr-only">Number: </span>
                    {doc.number ?? `${TYPE_LABEL[doc.type] ?? doc.type} draft`}
                    <span className="font-sans font-normal text-neutral-500 lg:hidden"> · {TYPE_LABEL[doc.type] ?? doc.type}</span>
                  </span>
                  <span className="min-w-0 basis-full truncate text-ink lg:basis-auto">
                    <span className="sr-only">Who: </span>
                    {doc.customerName ?? "No name given"}
                    <span className="block text-xs text-neutral-500 lg:hidden">
                      {[
                        doc.issuedAt ? `Issued ${shortDay(doc.issuedAt)}` : "Not sent yet",
                        doc.dueDate ? `due ${shortDay(doc.dueDate)}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                  <span className="hidden text-neutral-600 lg:block">
                    <span className="sr-only">Issued: </span>
                    {doc.issuedAt ? shortDay(doc.issuedAt) : "Not yet"}
                  </span>
                  <span className="hidden text-neutral-600 lg:block">
                    <span className="sr-only">Due: </span>
                    {doc.dueDate ? shortDay(doc.dueDate) : "None set"}
                  </span>
                  <span className="flex-none">
                    <span className="sr-only">Status: </span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${status.cls}`}>{status.text}</span>
                  </span>
                  <span className="num ml-auto flex-none text-right font-bold text-ink lg:ml-0">
                    <span className="sr-only">Amount: </span>
                    {doc.total !== null ? formatGHS(doc.total) : "None"}
                  </span>
                </div>

                <div className="flex flex-wrap justify-end gap-2 px-5 pb-3 pt-2">
                  {!doc.number && (
                    <button
                      onClick={() => act(doc.id, "issue")}
                      disabled={busy === doc.id}
                      className="tap flex items-center rounded-control bg-teal-50 px-3.5 text-[13px] font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-60"
                    >
                      {busy === doc.id ? "Sending it out..." : "Send it out"}
                    </button>
                  )}
                  {/* Only an issued document has a number and a frozen
                      version, which is what a PDF is a copy of. A draft
                      would produce a file that changes under the customer. */}
                  {doc.number && (
                    <a
                      href={`/api/documents/${doc.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand"
                    >
                      Open the PDF
                    </a>
                  )}
                  {conversions.map((target) => (
                    <button
                      key={target}
                      onClick={() => act(doc.id, "convert", target)}
                      disabled={busy === doc.id}
                      className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand disabled:opacity-60"
                    >
                      {CONVERT_LABEL[target] ?? `Convert to ${target}`}
                    </button>
                  ))}
                  {/* Crediting an issued invoice is giving money back, so
                      it asks for a reason before it will do anything. */}
                  {doc.type === "invoice" && doc.number && (
                    <button
                      onClick={() => {
                        setCrediting(crediting === doc.id ? null : doc.id);
                        setCreditReason("");
                        setCreditAmount("");
                      }}
                      className="tap flex items-center rounded-control border border-line-brand px-3.5 text-[13px] font-bold text-teal-800 hover:border-teal-brand"
                    >
                      Give money back
                    </button>
                  )}
                </div>

                {crediting === doc.id && (
                  <div className="mx-5 mb-4 border-t border-neutral-100 pt-4">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        placeholder="Why are you giving this back?"
                        aria-label="Reason for the credit note"
                        className="w-full border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                      />
                      <input
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="Whole invoice"
                        aria-label="Amount to credit, or blank for the whole invoice"
                        className="w-full border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none sm:w-36"
                      />
                      <button
                        onClick={() => credit(doc.id)}
                        disabled={busy === doc.id || creditReason.trim().length < 4}
                        className={`${primaryAction} justify-center disabled:opacity-60`}
                      >
                        {busy === doc.id ? "Issuing the credit note..." : "Issue the credit note"}
                      </button>
                    </div>
                    <p className="mt-2 text-[12.5px] font-medium text-slate-grey">
                      Leave the amount blank to credit the whole invoice. The
                      reason is kept on the record and shows on the credit note.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </Surface>
      )}
    </div>
  );
}

// The design's table, from 1024px: number, who, issued, due, status, amount.
const DOC_COLS = "lg:grid lg:grid-cols-[130px_minmax(0,1fr)_100px_100px_170px_120px] lg:items-center lg:gap-4";

// What the customer still owes, and whether it is late, said the way the
// design says it: "12 days overdue", "Part paid", "Paid".
function statusChip(doc: DocumentRow, overdue: boolean): { text: string; cls: string } {
  if (!doc.number) return { text: "Draft", cls: "bg-neutral-100 text-neutral-700" };
  const late = doc.dueDate ? Math.floor((Date.now() - new Date(`${doc.dueDate}T23:59:59`).getTime()) / 86400000) + 1 : 0;
  switch (doc.status) {
    case "paid":
      return { text: "Paid", cls: "bg-success-tint text-success-ink" };
    case "credited":
      return { text: "Credited", cls: "bg-neutral-100 text-neutral-700" };
    case "refunded":
      return { text: "Refunded", cls: "bg-neutral-100 text-neutral-700" };
    case "cancelled":
      return { text: "Cancelled", cls: "bg-neutral-100 text-neutral-700" };
    case "expired":
      return { text: "Expired", cls: "bg-neutral-100 text-neutral-700" };
    case "accepted":
    case "approved":
      return { text: "Accepted", cls: "bg-success-tint text-success-ink" };
    case "pending_approval":
      return { text: "Waiting for approval", cls: "bg-gold-100 text-gold-700" };
    case "change_requested":
      return { text: "Change asked for", cls: "bg-gold-100 text-gold-700" };
  }
  if (overdue && late > 0) {
    return { text: `${late} day${late === 1 ? "" : "s"} overdue`, cls: late > 30 ? "bg-danger-tint text-danger-ink" : "bg-gold-100 text-gold-700" };
  }
  if (doc.status === "partially_paid") {
    return { text: doc.outstanding ? `Part paid, ${formatGHS(doc.outstanding)} to go` : "Part paid", cls: "bg-teal-50 text-teal-800" };
  }
  if (doc.status === "viewed") return { text: "Seen by them", cls: "bg-info-light text-info-ink" };
  if (doc.type === "receipt") return { text: "Issued", cls: "bg-neutral-100 text-neutral-700" };
  return { text: "Sent", cls: "bg-info-light text-info-ink" };
}

function shortDay(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
