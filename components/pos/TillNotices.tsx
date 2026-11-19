"use client";

// What the till has to tell the cashier before anything else: sales the
// office refused, a device running out of room, and the last error. Shared
// by both layouts, on their light ground.

import type { Till } from "@/lib/pos/useTill";

export default function TillNotices({ till }: { till: Till }) {
  const { stuck, storage, error } = till;
  return (
    <>
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
