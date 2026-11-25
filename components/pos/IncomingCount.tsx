"use client";

import { useState } from "react";
import type { IncomingTransfer } from "@/lib/pos/incoming";

// Counting in goods from another place, at the till (0131). Blind: a box
// per product, never the number sent. Whatever did not arrive is written
// off as lost on the way once the office receives the count.

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function IncomingCount({
  transfer,
  onSave,
  onClose,
}: {
  transfer: IncomingTransfer;
  onSave: (received: Record<string, string>, note: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [got, setGot] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(await onSave(got, note));
    setBusy(false);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Count in goods from ${transfer.from}`} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-md sm:rounded-[20px]">
        <h2 className="font-heading text-lg font-bold text-ink-heading">Goods from {transfer.from}</h2>
        <p className="text-[13px] text-neutral-600">Count what is in the box and type it here.{transfer.note ? ` “${transfer.note}”` : ""}</p>
        <div className="mt-4 overflow-hidden rounded-control border border-line-brand">
          {transfer.lines.map((l, i) => (
            <label key={l.itemId} className={`flex min-h-[52px] items-center justify-between gap-3 px-3 py-1.5 ${i ? "border-t border-neutral-100" : ""}`}>
              <span className="min-w-0 text-[14px] font-semibold text-ink">{l.item}</span>
              <input
                aria-label={`How many ${l.item} arrived`}
                value={got[l.itemId] ?? ""}
                onChange={(e) => { setGot((g) => ({ ...g, [l.itemId]: numeric(e.target.value) })); setError(null); }}
                inputMode="decimal"
                placeholder="How many"
                className="num h-11 w-28 flex-none rounded-control border-[1.5px] border-line-brand bg-white px-3 text-right text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-[13px] font-semibold text-neutral-700">
          Anything wrong with it?
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A torn bag, a broken carton"
            className="mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="tap min-h-[48px] flex-1 rounded-control border-[1.5px] border-line-brand text-[14px] font-semibold text-ink">
            Not now
          </button>
          <button type="button" onClick={save} disabled={busy} className="tap min-h-[48px] flex-[2] rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
            {busy ? "Counting it in..." : "Save what arrived"}
          </button>
        </div>
      </div>
    </div>
  );
}
