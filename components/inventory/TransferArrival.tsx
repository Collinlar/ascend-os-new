"use client";

import { useState } from "react";
import { formatGHS } from "@/lib/money";

// Say what arrived (Advanced Inventory A1). Blind on purpose, like a stock
// count: the person receiving sees each product and a box, never how many
// were sent, so the number they type is what is in the box.

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function TransferArrival({
  businessId,
  transfer,
}: {
  businessId: string;
  transfer: { id: string; from: string; toId: string; lines: { itemId: string; item: string }[] };
}) {
  const [got, setGot] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function save() {
    setError(null);
    const empty = transfer.lines.find((l) => (got[l.itemId] ?? "") === "");
    if (empty) return setError(`Say how many ${empty.item} arrived. Zero is fine if none came.`);
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/transfer/arrived", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: transfer.toId,
          transferId: transfer.id,
          note: note.trim(),
          lines: transfer.lines.map((l) => ({ itemId: l.itemId, received: Number(got[l.itemId]) })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save what arrived just now. Your numbers are still here. Tap again.");
        return;
      }
      if (body.unchanged) {
        setDone("Someone already said what arrived for this one.");
      } else if (Number(body.missing_lines) > 0) {
        setDone(
          `Saved. ${body.missing_lines} ${Number(body.missing_lines) === 1 ? "product came" : "products came"} short` +
            (Number(body.missing_value) > 0 ? `, ${formatGHS(Number(body.missing_value))} written off as lost on the way.` : ", written off as lost on the way.")
        );
      } else {
        setDone("Saved. Everything that was sent arrived.");
      }
      // No refresh: it would drop this card from the list before anyone read
      // the confirmation. The next visit shows only what is still coming.
    } catch {
      setError("We could not reach Ascend just now. Nothing is saved yet. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="rounded-control bg-teal-50 px-3 py-2.5 text-[13.5px] font-semibold text-teal-800">{done}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-control border border-line-brand">
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
      <label className="text-[13px] font-semibold text-neutral-700">
        Anything wrong with it?
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A torn bag, a broken carton"
          className="mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
        {busy ? "Counting it in..." : `Save what came from ${transfer.from}`}
      </button>
    </div>
  );
}
