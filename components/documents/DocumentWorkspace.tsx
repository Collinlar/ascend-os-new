"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";

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
        <button
          onClick={() => setCreating(true)}
          className="tap w-full bg-teal px-5 py-3.5 font-medium text-white"
        >
          Create a document
        </button>
      ) : (
        <div className="border border-line bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {(["invoice", "quotation", "receipt"] as DocumentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`tap border px-3 py-2 text-sm font-medium ${
                  type === t
                    ? "border-teal bg-teal-light text-teal-dark"
                    : "border-line text-mid-grey"
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
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              inputMode="tel"
              placeholder="Their WhatsApp number"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
            />
          </div>

          <div className="mt-4 space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <input
                  value={line.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="What are you charging for?"
                  className="col-span-3 border border-line px-3 py-2.5 text-sm text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
                />
                <input
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  inputMode="decimal"
                  placeholder="Qty"
                  className="border border-line px-2 py-2.5 text-sm text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
                />
                <input
                  value={line.unitPrice}
                  onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  placeholder="Price"
                  className="col-span-2 border border-line px-2 py-2.5 text-sm text-ink placeholder:text-mid-grey focus:border-teal focus:outline-none"
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
              className="tap px-3 py-3 text-sm font-medium text-mid-grey"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {documents.length === 0 && (
          <div className="border border-line bg-white px-5 py-10 text-center">
            <p className="font-medium text-ink">No documents yet.</p>
            <p className="mt-2 text-sm text-mid-grey">
              Your first invoice takes about a minute.
            </p>
          </div>
        )}

        {documents.map((doc) => {
          const conversions = doc.number
            ? (DOCUMENT_CONVERSIONS[doc.type as DocumentType] ?? [])
            : [];
          return (
            <div key={doc.id} className="border border-line bg-white px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {doc.number ?? `${TYPE_LABEL[doc.type] ?? doc.type} draft`}
                  </p>
                  <p className="text-xs text-mid-grey">
                    {doc.customerName ?? "No customer"}
                    {doc.number ? " · sent out" : " · not sent yet"}
                  </p>
                </div>
                <p className="font-semibold text-ink">
                  {doc.total === null ? "" : formatGHS(doc.total)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!doc.number && (
                  <button
                    onClick={() => act(doc.id, "issue")}
                    disabled={busy === doc.id}
                    className="tap bg-teal px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy === doc.id ? "Sending..." : "Send it out"}
                  </button>
                )}
                {conversions.map((target) => (
                  <button
                    key={target}
                    onClick={() => act(doc.id, "convert", target)}
                    disabled={busy === doc.id}
                    className="tap border border-line px-3 py-2 text-sm font-medium text-teal-dark disabled:opacity-60"
                  >
                    {CONVERT_LABEL[target] ?? `Convert to ${target}`}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
