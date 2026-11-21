"use client";

// What the till has to tell the cashier before anything else: sales the
// office refused, a device running out of room, and the last error. Shared
// by both layouts, on their light ground.

import type { Till } from "@/lib/pos/useTill";
import type { RefundDecision } from "@/lib/pos/refunds";
import { formatGHS } from "@/lib/money";

// What the counter has to do about a refund decided in Work.
function decisionText(d: RefundDecision): string {
  const who = d.customerName ? ` (${d.customerName})` : "";
  if (d.status === "rejected") return `The owner turned down the refund on ${d.receipt}${who}. Tell the customer.`;
  if (d.cash > 0) return `Refund approved on ${d.receipt}${who}. Hand ${formatGHS(d.cash)} back to the customer from the drawer.`;
  if (d.method === "credit") return `Refund approved on ${d.receipt}${who}. It was on credit, so nothing is handed back: it comes off what they owe.`;
  const by = d.method === "mobile_money" ? "MoMo" : d.method === "card" ? "card" : "the way they paid";
  return `Refund approved on ${d.receipt}${who}. The owner returns ${formatGHS(d.total)} by ${by}. Nothing comes out of the drawer.`;
}

export default function TillNotices({ till }: { till: Till }) {
  const { stuck, storage, error, decisions, stockNote } = till;
  return (
    <>
      {/* What the stock rule said about the last thing added (I2). */}
      {stockNote && (
        <div
          role={stockNote.refused ? "alert" : "status"}
          className={`flex flex-none items-center gap-3 border-b px-3.5 py-2.5 text-[13.5px] ${
            stockNote.refused ? "border-danger/30 bg-danger-tint text-danger-ink" : "border-gold-500/40 bg-gold-100 text-gold-700"
          }`}
        >
          <p className="min-w-0 flex-1 font-semibold">{stockNote.text}</p>
          <button onClick={till.clearStockNote} className="tap flex flex-none items-center rounded-control border-[1.5px] border-current px-3 text-[13px] font-bold">
            Got it
          </button>
        </div>
      )}
      {/* Refunds decided in Work. One that comes out of the drawer is the
          loudest thing on the till until the cashier says it is done. */}
      {decisions.map((d) => {
        const handBack = d.status === "approved" && d.cash > 0;
        return (
          <div
            key={d.approvalId}
            role="status"
            className={`flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b px-3.5 py-2.5 text-[13.5px] ${
              handBack ? "border-gold-500/40 bg-gold-100 text-gold-700" : "border-neutral-200 bg-white text-ink"
            }`}
          >
            <p className="min-w-0 flex-1 font-semibold">{decisionText(d)}</p>
            <button
              onClick={() => (handBack ? till.handBack(d) : till.gotIt(d))}
              className={`tap flex flex-none items-center rounded-control px-3.5 text-[13px] font-bold ${
                handBack ? "bg-gold-700 text-white" : "border-[1.5px] border-neutral-200 text-ink"
              }`}
            >
              {handBack ? `I have handed back ${formatGHS(d.cash)}` : "Got it"}
            </button>
          </div>
        );
      })}

      {/* Sales the server refused. They are safe on this till, but nothing
          used to say they existed, so a merchant saw a number that never
          fell and had nothing to do about it. */}
      {stuck.length > 0 && (
        <div className="flex-none border-b border-gold-500/40 bg-gold-100 px-3.5 py-2.5 text-[13px] text-gold-700">
          <p className="font-bold">
            {stuck.length} thing{stuck.length === 1 ? "" : "s"} the office is not taking.
          </p>
          <p className="mt-0.5">
            {stuck[0].lastError?.includes("receipt_number") || stuck[0].lastError?.includes("duplicate key")
              ? "Their receipt numbers were already used. The office can give them new ones once this till is updated."
              : (stuck[0].lastError ?? "The office did not say why.")}
          </p>
          {/* The exact words the server used, so a merchant on the phone to
              support can read them out. */}
          <p className="mono mt-0.5 text-[11px]">
            {stuck[0].kind} · tried {stuck[0].tries} times · {stuck[0].lastError ?? "no reason given"}
          </p>
          <button onClick={till.resendStuck} className="tap mt-1.5 rounded-control bg-gold-700 px-3.5 text-[13px] font-bold text-white">
            Try sending them again
          </button>
        </div>
      )}

      {storage?.critical && (
        <p className="flex-none bg-gold-500 px-3.5 py-2 text-[13px] font-bold text-ink">
          This till is almost full. Send your sales and call support today.
        </p>
      )}

      {error && <p className="flex-none bg-danger-tint px-3.5 py-2 text-[13px] font-semibold text-danger-ink">{error}</p>}
    </>
  );
}
