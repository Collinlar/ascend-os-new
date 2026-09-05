"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";

export interface DocumentRow {
  id: string;
  type: string;
  status: string;
  number: string | null;
  total: number | null;
  dueDate: string | null;
  createdAt: string;
  customerName: string | null;
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

// Three letters on the spine, the way a filing cabinet labels one.
const SPINE: Record<string, string> = {
  quotation: "QTE",
  proforma: "PRO",
  invoice: "INV",
  receipt: "RCT",
  credit_note: "CRN",
  purchase_order: "PO",
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
}: {
  businessId: string;
  documents: DocumentRow[];
  catalogue: CatalogueOption[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<DocumentType>("invoice");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
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
            : { customerName, customerPhone }),
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

  // The two figures a merchant actually opens this screen for.
  const owedTotal = useMemo(
    () =>
      documents
        .filter((d) => d.type === "invoice" && OWED.has(d.status))
        .reduce((sum, d) => sum + (d.total ?? 0), 0),
    [documents]
  );
  const owedCount = useMemo(
    () => documents.filter((d) => d.type === "invoice" && OWED.has(d.status)).length,
    [documents]
  );
  const overdueCount = useMemo(
    () => documents.filter((d) => d.status === "overdue").length,
    [documents]
  );

  const SHELVES: Array<[typeof shelf, string]> = [
    ["all", "Everything"],
    ["owed", "Not paid yet"],
    ["invoice", "Invoices"],
    ["receipt", "Receipts"],
    ["quotation", "Quotes"],
    ["purchase_order", "Purchase orders"],
  ];

  return (
    <div className="space-y-6">
      {note && (
        <p className="border border-teal bg-teal-light px-4 py-3 text-sm font-medium text-teal-dark">
          {note}
        </p>
      )}

      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}

      {!creating ? (
        // A button, not a banner. Making a document is one thing this
        // screen can do, not the screen's whole reason for existing: the
        // list of what has already been issued is.
        <div className="mb-3.5 flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className="tap flex items-center rounded-[13px] bg-teal px-[22px] font-bold text-white shadow-action hover:bg-teal-hover"
          >
            Create a document
          </button>
        </div>
      ) : (
        <div className="mb-3.5 rounded-[18px] border border-line-soft bg-white p-5 shadow-lift">
          <div className="flex flex-wrap gap-2">
            {(["invoice", "quotation", "receipt", "purchase_order"] as DocumentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`tap border px-3 py-2 text-sm font-medium ${
                  type === t
                    ? "border-teal bg-teal-light text-teal-dark"
                    : "border-line text-ink-muted"
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
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              inputMode="tel"
              placeholder={
                type === "purchase_order" ? "Their phone number" : "Their WhatsApp number"
              }
              aria-label={type === "purchase_order" ? "Supplier phone" : "Customer WhatsApp number"}
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
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
                className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
              />
              {matches.length > 0 && (
                <div className="mt-2 divide-y divide-line-soft border border-line-soft">
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
                  <span className="col-span-3 flex items-center justify-between gap-2 border border-teal-light bg-teal-light px-3 py-2.5 text-sm font-semibold text-teal-dark">
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
                    className="col-span-3 border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                  />
                )}
                <input
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  inputMode="decimal"
                  placeholder="Qty"
                  className="border border-line px-2 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                />
                <input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="Price"
                  className="col-span-2 border border-line px-2 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
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

          <p className="mt-4 text-right text-lg font-semibold text-ink">
            {formatGHS(total)}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => create(true)}
              disabled={busy === "create"}
              className="tap flex-1 bg-teal px-4 py-3 font-medium text-white disabled:opacity-60"
            >
              {busy === "create" ? "Saving..." : `Send this ${TYPE_LABEL[type].toLowerCase()} out`}
            </button>
            <button
              onClick={() => create(false)}
              disabled={busy === "create"}
              className="tap border border-line px-4 py-3 font-medium text-ink disabled:opacity-60"
            >
              Save as draft
            </button>
            <button
              onClick={() => setCreating(false)}
              className="tap px-3 py-3 text-sm font-medium text-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <>
          {owedTotal > 0 && (
            <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[18px] border border-line-soft bg-white px-[22px] py-4 shadow-lift">
              <span className="num text-2xl font-extrabold tracking-[-0.02em] text-ink">
                {formatGHS(owedTotal)}
              </span>
              <span className="text-sm font-medium text-slate-grey">
                owed to you across {owedCount}{" "}
                {owedCount === 1 ? "invoice" : "invoices"}
                {overdueCount > 0 && (
                  <>
                    {", "}
                    <span className="font-bold text-gold-ink">
                      {overdueCount} past the due date
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          <div className="mb-3.5 space-y-2.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, customer or kind"
              aria-label="Search your documents"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <div className="scr -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
              {SHELVES.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setShelf(key)}
                  className={`tap flex flex-none items-center whitespace-nowrap rounded-chip border px-4 text-[13px] font-bold ${
                    shelf === key
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink-slate"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
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

            return (
              <div
                key={doc.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-[22px] py-[15px] ${
                  i < visible.length - 1 ? "border-b border-[#EEF3F7]" : ""
                }`}
              >
                {/* The spine of a filed document, so a long list can be
                    read by shape before it is read by name. */}
                <span
                  aria-hidden
                  className="flex h-12 w-10 flex-none items-end justify-center rounded-lg border border-line bg-light-grey pb-[7px]"
                >
                  <span className="mono text-[8.5px] font-medium tracking-[0.04em] text-slate-grey">
                    {SPINE[doc.type] ?? "DOC"}
                  </span>
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug text-ink sm:truncate">
                    {doc.number ?? `${TYPE_LABEL[doc.type] ?? doc.type} draft`}
                    {doc.customerName && ` · ${doc.customerName}`}
                  </p>
                  <p className="text-[12.5px] font-medium text-slate-grey">
                    {sent ? "Sent out" : "Not sent yet"}
                    {doc.total !== null && ` · ${formatGHS(doc.total)}`}
                  </p>
                </div>

                <span
                  className={`flex-none rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold ${
                    overdue
                      ? "bg-gold-tint text-gold-ink"
                      : sent
                        ? "bg-light-grey text-slate-grey"
                        : "bg-teal-light text-teal-dark"
                  }`}
                >
                  {overdue ? "Overdue" : sent ? "Filed" : "Draft"}
                </span>

                <div className="flex w-full flex-none flex-wrap justify-end gap-2 sm:w-auto">
                  {!doc.number && (
                    <button
                      onClick={() => act(doc.id, "issue")}
                      disabled={busy === doc.id}
                      className="tap flex items-center rounded-chip bg-teal-light px-4 text-[13px] font-bold text-teal-dark hover:bg-teal-pale disabled:opacity-60"
                    >
                      {busy === doc.id ? "Sending..." : "Send it out"}
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
                      className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                    >
                      Open the PDF
                    </a>
                  )}
                  {conversions.map((target) => (
                    <button
                      key={target}
                      onClick={() => act(doc.id, "convert", target)}
                      disabled={busy === doc.id}
                      className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey disabled:opacity-60"
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
                      className="tap flex items-center rounded-chip border border-line px-4 text-[13px] font-bold text-ink-slate hover:bg-light-grey"
                    >
                      Give money back
                    </button>
                  )}
                </div>

                {crediting === doc.id && (
                  <div className="w-full border-t border-line-soft pt-4">
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
                        className="tap flex items-center justify-center rounded-chip bg-teal px-5 text-[13px] font-bold text-white hover:bg-teal-hover disabled:opacity-60"
                      >
                        {busy === doc.id ? "Issuing..." : "Issue the credit note"}
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
