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
  description: string;
  quantity: string;
  unitPrice: string;
}

// Three letters on the spine, the way a filing cabinet labels one.
const SPINE: Record<string, string> = {
  quotation: "QTE",
  proforma: "PRO",
  invoice: "INV",
  receipt: "RCT",
  credit_note: "CRN",
};

const TYPE_LABEL: Record<string, string> = {
  quotation: "Quote",
  proforma: "Proforma",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
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
}: {
  businessId: string;
  documents: DocumentRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<DocumentType>("invoice");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: "1", unitPrice: "" },
  ]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          customerName,
          customerPhone,
          issueNow,
          lines: lines.map((l) => ({
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
      setLines([{ description: "", quantity: "1", unitPrice: "" }]);
      setCustomerName("");
      setCustomerPhone("");
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

  return (
    <div className="space-y-6">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-dark">
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
            {(["invoice", "quotation", "receipt"] as DocumentType[]).map((t) => (
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Who is this for?"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              inputMode="tel"
              placeholder="Their WhatsApp number"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
          </div>

          <div className="mt-4 space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <input
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="What are you charging for?"
                  className="col-span-3 border border-line px-3 py-2.5 text-sm text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
                />
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
              onClick={() =>
                setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "" }])
              }
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

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet."
          detail="Your first invoice takes about a minute."
        />
      ) : (
        <Surface>
          {documents.map((doc, i) => {
            const conversions = doc.number
              ? (DOCUMENT_CONVERSIONS[doc.type as DocumentType] ?? [])
              : [];
            const sent = Boolean(doc.number);
            const overdue =
              sent &&
              doc.dueDate !== null &&
              doc.status !== "paid" &&
              new Date(doc.dueDate) < new Date();

            return (
              <div
                key={doc.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-[22px] py-[15px] ${
                  i < documents.length - 1 ? "border-b border-[#EEF3F7]" : ""
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
                </div>
              </div>
            );
          })}
        </Surface>
      )}
    </div>
  );
}
