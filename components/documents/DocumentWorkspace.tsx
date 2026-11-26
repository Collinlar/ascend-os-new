"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatGHS } from "@/lib/money";
import { EmptyState, Panel as Surface } from "@/components/shell/Page";
import { StatusPill, Tag, type Tone } from "@/components/shell/Parts";
import Pills from "@/components/shell/Pills";

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

const TYPE_LABEL: Record<string, string> = {
  quotation: "Quote",
  proforma: "Proforma",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
  purchase_order: "Purchase order",
  delivery_note: "Delivery note",
};

export default function DocumentWorkspace({
  businessId,
  documents,
  query = "",
}: {
  businessId: string;
  documents: DocumentRow[];
  /** What the module bar's search asked for (?q=). */
  query?: string;
}) {
  // Finding one document among hundreds. A filing cabinet nobody can search
  // is a pile.
  const [shelf, setShelf] = useState<"all" | "owed" | "invoice" | "receipt" | "quotation" | "purchase_order" | "credit_note">("all");

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
  return (
    <div className="space-y-6">
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
