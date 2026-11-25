"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A product's low mark place by place (Advanced Inventory A4). Empty means
// the place uses the product's own mark, said in the box.

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function PlaceLowMarks({
  businessId,
  itemId,
  itemName,
  productMark,
  places,
}: {
  businessId: string;
  itemId: string;
  itemName: string;
  productMark: number | null;
  places: { id: string; name: string; mark: number | null }[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(places.map((p) => [p.id, p.mark === null ? "" : String(p.mark)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/place-marks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, itemId, marks: places.map((p) => ({ locationId: p.id, lowAt: marks[p.id] ?? "" })) }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save those marks just now. Tap again in a moment.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-[18px] border border-line-brand bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">Low mark at each place</p>
      <p className="mt-1 text-[13px] text-neutral-600">
        Leave a place empty to use {productMark === null ? "no mark there" : `the mark above, ${productMark}`}.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {places.map((p) => (
          <label key={p.id} className="text-[13px] font-semibold text-neutral-700">
            {p.name}
            <input
              value={marks[p.id] ?? ""}
              onChange={(e) => { setMarks((m) => ({ ...m, [p.id]: numeric(e.target.value) })); setSaved(false); setError(null); }}
              inputMode="decimal"
              placeholder={productMark === null ? "No mark" : `Same, ${productMark}`}
              className="num mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="tap min-h-[44px] rounded-control border-[1.5px] border-teal px-4 text-[14px] font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-60">
          {busy ? "Saving the marks..." : "Save the marks for each place"}
        </button>
        {saved && <span className="text-[13px] font-semibold text-teal-800">Saved. Each place reorders {itemName} at its own mark.</span>}
      </div>
    </div>
  );
}
