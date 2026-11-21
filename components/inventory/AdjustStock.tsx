"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

// Adjust stock (v3 Inventory, "Adjust stock"): damaged or lost, or a count
// of the shelf. Goods coming in go through Receive stock, which keeps the
// supplier and the cost. Each one is a movement through
// /api/catalogue/stock, never an overwrite, so the figure stays explainable.

type Kind = "damage_loss" | "count_correction";

const KINDS: [Kind, string][] = [
  ["damage_loss", "Damaged or lost"],
  ["count_correction", "I counted the shelf"],
];

export interface AdjustItem {
  id: string;
  name: string;
  /** On hand at each place, keyed by place id. */
  onHand: Record<string, number>;
}

export default function AdjustStock({
  businessId,
  places,
  items,
  startWith,
}: {
  businessId: string;
  places: { id: string; name: string }[];
  items: AdjustItem[];
  startWith?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState(startWith ?? "");
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("count_correction");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const item = items.find((i) => i.id === itemId);
  const recorded = item ? item.onHand[placeId] ?? 0 : null;

  function reset() {
    setAmount("");
    setReason("");
    setError(null);
  }

  async function save() {
    setError(null);
    if (!item) return setError("Pick the product first.");
    const n = Number(amount);
    if (amount === "" || !Number.isFinite(n) || (kind === "damage_loss" && n <= 0) || n < 0) {
      return setError(kind === "count_correction" ? "Enter what you counted. Zero is fine if the shelf is empty." : "Enter how many.");
    }
    if (reason.trim() === "") {
      return setError("Say what happened. This note explains the change later.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/catalogue/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: placeId,
          itemId: item.id,
          kind,
          quantity: kind === "count_correction" ? undefined : n,
          countedQuantity: kind === "count_correction" ? n : undefined,
          reason: reason.trim(),
          clientRef: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "That did not save. Tap again in a moment.");
        return;
      }
      setDone(
        body.no_change
          ? `${item.name}: your count matches the record, nothing to change.`
          : kind === "damage_loss"
              ? `${item.name}: ${n} written off.`
              : `${item.name}: now ${n} on the shelf.`
      );
      reset();
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(null);
        }}
        className={secondaryAction}
      >
        Adjust stock
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Adjust stock" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-md sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink-heading">Adjust stock</h2>
            <p className="text-[13px] text-neutral-600">Every change is kept with who made it and why.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
            <Icon name="close" size={18} />
          </button>
        </div>

        {done && <p className="mb-4 rounded-control bg-teal-50 px-3 py-2.5 text-[13.5px] font-semibold text-teal-800">{done}</p>}

        <div className="flex flex-col gap-4">
          <label className="text-[13px] font-semibold text-neutral-700">
            Which product?
            <select value={itemId} onChange={(e) => { setItemId(e.target.value); setDone(null); }} className={field}>
              <option value="">Pick a product</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          {places.length > 1 && (
            <label className="text-[13px] font-semibold text-neutral-700">
              Where?
              <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={field}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="text-[13px] font-semibold text-neutral-700">What happened?</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {KINDS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => { setKind(k); setError(null); }}
                  className={`tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold ${
                    kind === k ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="text-[13px] font-semibold text-neutral-700">
            {kind === "count_correction" ? "How many are on the shelf?" : "How many?"}
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder={kind === "count_correction" ? "Your count" : "Quantity"}
              className={`num ${field}`}
            />
            {kind === "count_correction" && recorded !== null && (
              <span className="mt-1 block text-[12.5px] font-normal text-neutral-600">
                The record says {recorded}. We keep both, so the difference stays visible.
              </span>
            )}
          </label>

          <label className="text-[13px] font-semibold text-neutral-700">
            Why?
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Broken in transit, expired, miscounted" className={field} />
          </label>

          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
              {error}
            </p>
          )}

          <button type="button" onClick={save} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
            {busy ? "Saving the change..." : "Save this change"}
          </button>
        </div>
      </div>
    </div>
  );
}
