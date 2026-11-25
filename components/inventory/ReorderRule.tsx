"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A product's reorder rule (Advanced Inventory A3). The low mark is the
// same one Inventory and Home already use; the rule adds how many to order
// and who from. Nothing orders itself: the Orders tab suggests, the owner
// places.

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function ReorderRule({
  businessId,
  itemId,
  itemName,
  lowAt,
  reorderQuantity,
  supplierId,
  suppliers,
}: {
  businessId: string;
  itemId: string;
  itemName: string;
  lowAt: number | null;
  reorderQuantity: number | null;
  supplierId: string | null;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [low, setLow] = useState(lowAt === null ? "" : String(lowAt));
  const [qty, setQty] = useState(reorderQuantity === null ? "" : String(reorderQuantity));
  const [sup, setSup] = useState(supplierId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    if (qty !== "" && low === "") return setError("Say how low it gets before you reorder.");
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/reorder-rule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, itemId, lowAt: low, reorderQuantity: qty, supplierId: sup }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save that rule just now. Tap again in a moment.");
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

  const field =
    "mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  return (
    <div className="mb-4 rounded-[18px] border border-line-brand bg-white px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">When to reorder</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="text-[13px] font-semibold text-neutral-700">
          When it gets down to
          <input value={low} onChange={(e) => { setLow(numeric(e.target.value)); setSaved(false); }} inputMode="decimal" placeholder="5" className={`num ${field}`} />
        </label>
        <label className="text-[13px] font-semibold text-neutral-700">
          Order this many
          <input value={qty} onChange={(e) => { setQty(numeric(e.target.value)); setSaved(false); }} inputMode="decimal" placeholder="You decide each time" className={`num ${field}`} />
        </label>
        <label className="text-[13px] font-semibold text-neutral-700">
          From
          <select value={sup} onChange={(e) => { setSup(e.target.value); setSaved(false); }} className={field}>
            <option value="">No usual supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="tap min-h-[44px] rounded-control bg-teal px-4 text-[14px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
          {busy ? "Saving the rule..." : "Save when to reorder"}
        </button>
        {saved && (
          <span className="text-[13px] font-semibold text-teal-800">
            {low === "" ? `${itemName} will not be suggested for reordering.` : `Saved. ${itemName} shows on the Orders tab when it gets down to ${low}.`}
          </span>
        )}
      </div>
    </div>
  );
}
