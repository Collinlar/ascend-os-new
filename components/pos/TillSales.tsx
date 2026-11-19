"use client";

// The sales this till made today and yesterday, from its own records, so it
// works with no network. Each says whether it has reached the office. Open
// one to see it, print its receipt again, or ask the owner to refund it.

import { useEffect, useState } from "react";
import { formatGHS } from "@/lib/money";
import { clock } from "@/lib/pos/cash";
import { paidBy, receiptFor, recentSales, sentToOffice } from "@/lib/pos/refunds";
import type { LocalSale } from "@/lib/pos/db";
import TillSheet from "@/components/pos/TillSheet";
import type { Till } from "@/lib/pos/useTill";

type Row = { sale: LocalSale; sent: boolean };

export default function TillSales({ till, onClose }: { till: Till; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<LocalSale | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const sales = await recentSales();
    setRows(await Promise.all(sales.map(async (sale) => ({ sale, sent: await sentToOffice(sale) }))));
  }

  useEffect(() => {
    load().catch(() => setRows([]));
  }, []);

  async function ask() {
    if (!open) return;
    setBusy(true);
    const result = await till.askRefund(open, reason);
    setBusy(false);
    if (!result.ok) return setNote(result.error);
    setOpen(result.sale);
    setAsking(false);
    setReason("");
    setNote("Asked. The owner decides in Work, and the customer gets their money once it is approved.");
    load().catch(() => {});
  }

  const total = (rows ?? []).reduce((n, r) => n + r.sale.total, 0);

  if (open) {
    const p = open.payments[0];
    return (
      <TillSheet title={`Sale ${open.receiptNumber}`} onClose={onClose}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <button
            onClick={() => {
              setOpen(null);
              setAsking(false);
              setNote(null);
            }}
            className="tap -mt-2 mb-1 flex items-center text-[13.5px] font-semibold text-teal-700"
          >
            Back to today&apos;s sales
          </button>
          <p className="text-[13px] text-neutral-600">
            {clock(open.occurredAt)} · {paidBy(open)}
            {p?.providerReference ? ` ${p.providerReference}` : ""}
            {open.customerName ? ` · ${open.customerName}` : ""}
          </p>
          <div className="mt-3 rounded-control border border-line-brand">
            {open.lines.map((l, i) => (
              <div key={i} className={`flex justify-between gap-3 px-3 py-2 text-[14px] ${i ? "border-t border-neutral-100" : ""}`}>
                <span>
                  {l.quantity} × {l.description}
                </span>
                <span className="num font-semibold">{formatGHS(l.lineTotal)}</span>
              </div>
            ))}
            {!!open.discountTotal && (
              <div className="flex justify-between border-t border-neutral-100 px-3 py-2 text-[14px] text-danger-ink">
                <span>Discount</span>
                <span className="num font-semibold">−{formatGHS(open.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-100 px-3 py-2.5 font-heading text-[16px] font-extrabold text-ink-heading">
              <span>Total</span>
              <span className="num">{formatGHS(open.total)}</span>
            </div>
          </div>

          {open.refund && (
            <p className="mt-3 rounded-control bg-gold-100 px-3 py-2.5 text-[13.5px] text-gold-700">
              <strong>Refund asked</strong> at {clock(open.refund.askedAt)}: {open.refund.reason}
            </p>
          )}
          {note && <p className="mt-3 text-[13.5px] font-semibold text-ink">{note}</p>}

          {asking ? (
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor="refundWhy" className="text-[13.5px] font-semibold text-ink">
                Why is the customer getting their money back?
              </label>
              <textarea
                id="refundWhy"
                autoFocus
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="The milk was past its date. They brought it back unopened."
                className="rounded-control border-[1.5px] border-line-brand px-3 py-2.5 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
              />
              <p className="text-[12.5px] text-neutral-600">
                Do not hand over any money yet. The owner or a manager decides in Work, then the refund is made.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAsking(false)}
                  className="tap flex h-12 flex-1 items-center justify-center rounded-control border-[1.5px] border-neutral-200 text-[14px] font-bold text-ink"
                >
                  Leave it
                </button>
                <button
                  onClick={ask}
                  disabled={busy}
                  className="tap flex h-12 flex-[2] items-center justify-center rounded-control bg-teal text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Saving the request..." : "Ask the owner to refund"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => till.printReceipt(receiptFor(open, till.device?.businessName ?? till.device?.label ?? "Ascend POS", till.cashier?.displayName))}
                className="tap flex h-12 flex-1 items-center justify-center rounded-control border-[1.5px] border-neutral-200 text-[14px] font-bold text-ink"
              >
                Print the receipt again
              </button>
              {!open.refund && (
                <button
                  onClick={() => {
                    setAsking(true);
                    setNote(null);
                  }}
                  className="tap flex h-12 flex-1 items-center justify-center rounded-control border-[1.5px] border-danger-soft text-[14px] font-bold text-danger-ink"
                >
                  The customer wants a refund
                </button>
              )}
            </div>
          )}
        </div>
      </TillSheet>
    );
  }

  return (
    <TillSheet title="Sales on this till" onClose={onClose}>
      <div className="flex flex-none items-baseline justify-between border-b border-neutral-100 px-4 py-2.5">
        <span className="text-[13px] text-neutral-600">
          {rows ? `${rows.length} sale${rows.length === 1 ? "" : "s"} today and yesterday` : "Reading this till's sales..."}
        </span>
        <span className="num font-heading text-[16px] font-extrabold text-ink-heading">{formatGHS(total)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows?.length === 0 && <p className="px-4 py-10 text-center text-[14px] text-neutral-600">No sales on this till yet today.</p>}
        {rows?.map(({ sale, sent }) => (
          <button
            key={sale.clientRef}
            onClick={() => setOpen(sale)}
            className="tap flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left hover:bg-teal-50"
          >
            <span className="num w-11 flex-none text-[13px] text-neutral-600">{clock(sale.occurredAt)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold text-ink">
                {sale.lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.description}`).join(", ")}
              </span>
              <span className="truncate text-[12px] text-neutral-600">
                {sale.receiptNumber} · {paidBy(sale)}
                {sale.customerName ? ` · ${sale.customerName}` : ""}
              </span>
            </span>
            <span className="flex flex-none flex-col items-end gap-1">
              <span className="num text-[14px] font-bold text-ink">{formatGHS(sale.total)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  sale.refund ? "bg-gold-100 text-gold-700" : sent ? "bg-success-tint text-success-ink" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                {sale.refund ? "Refund asked" : sent ? "Sent" : "Waiting to send"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </TillSheet>
  );
}
