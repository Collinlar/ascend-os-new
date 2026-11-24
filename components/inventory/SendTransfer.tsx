"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

// Move stock (Advanced Inventory A1): goods leave one place now and arrive
// at the other when someone there says what came. Carrying it yourself, the
// owner can mark it arrived in the same step.

interface Line {
  key: string;
  itemId: string;
  quantity: string;
}

const blank = (): Line => ({ key: crypto.randomUUID(), itemId: "", quantity: "" });
const numeric = (v: string) => v.replace(/[^\d.]/g, "");
const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-GH") : n.toLocaleString("en-GH", { maximumFractionDigits: 3 }));

export default function SendTransfer({
  businessId,
  places,
  items,
}: {
  businessId: string;
  places: { id: string; name: string }[];
  items: { id: string; name: string; onHand: Record<string, number> }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(places[0]?.id ?? "");
  const [toId, setToId] = useState(places[1]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [note, setNote] = useState("");
  const [arrived, setArrived] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // One key per transfer, kept across retries, so a second tap on a bad
  // connection never sends the same goods twice.
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? "";

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function pickFrom(id: string) {
    setFromId(id);
    if (id === toId) setToId(places.find((p) => p.id !== id)?.id ?? "");
    setError(null);
  }

  async function send() {
    setError(null);
    const filled = lines.filter((l) => l.itemId || l.quantity);
    if (!fromId || !toId || fromId === toId) return setError("Pick where it leaves from and where it is going.");
    if (filled.length === 0) return setError("Add at least one product to send.");
    const seen = new Set<string>();
    for (const l of filled) {
      const name = items.find((i) => i.id === l.itemId)?.name;
      if (!l.itemId) return setError("Pick the product on every line, or clear the empty one.");
      if (seen.has(l.itemId)) return setError(`${name} is on two lines. Put it on one line with the full number.`);
      seen.add(l.itemId);
      if (!(Number(l.quantity) > 0)) return setError(`Say how many ${name ?? "of that product"} you are sending.`);
    }
    if (arrived === null) return setError("Say whether it is on the way or already there.");

    setBusy(true);
    try {
      const res = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: fromId,
          toLocationId: toId,
          clientRef,
          note: note.trim(),
          arrived,
          lines: filled.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not send that just now. Nothing has moved. Tap again in a moment.");
        return;
      }
      const n = filled.length;
      setDone(
        arrived
          ? `${n} ${n === 1 ? "product" : "products"} moved from ${placeName(fromId)} to ${placeName(toId)}.`
          : `${n} ${n === 1 ? "product is" : "products are"} on the way to ${placeName(toId)}. Someone there says what arrived.`
      );
      setLines([blank()]);
      setNote("");
      setArrived(null);
      setClientRef(crypto.randomUUID());
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Nothing has moved yet. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";
  const chip = (on: boolean) =>
    `tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold ${on ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"}`;

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setDone(null); }} className={secondaryAction}>
        Move stock
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Move stock" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-lg sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink-heading">Move stock</h2>
            <p className="text-[13px] text-neutral-600">From one of your places to another.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
            <Icon name="close" size={18} />
          </button>
        </div>

        {done && <p className="mb-4 rounded-control bg-teal-50 px-3 py-2.5 text-[13.5px] font-semibold text-teal-800">{done}</p>}

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-neutral-700">
              Leaving from
              <select value={fromId} onChange={(e) => pickFrom(e.target.value)} className={field}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] font-semibold text-neutral-700">
              Going to
              <select value={toId} onChange={(e) => { setToId(e.target.value); setError(null); }} className={field}>
                {places
                  .filter((p) => p.id !== fromId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-neutral-700">What is going</legend>
            {lines.map((l, i) => {
              const item = items.find((it) => it.id === l.itemId);
              const there = item ? item.onHand[fromId] ?? 0 : null;
              const over = there !== null && Number(l.quantity) > there;
              return (
                <div key={l.key} className="rounded-control border border-line-brand p-3">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Product on line ${i + 1}`}
                      value={l.itemId}
                      onChange={(e) => setLine(l.key, { itemId: e.target.value })}
                      className="h-11 min-w-0 flex-1 rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink focus:border-teal focus:outline-none"
                    >
                      <option value="">Pick a product</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`How many on line ${i + 1}`}
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: numeric(e.target.value) })}
                      inputMode="decimal"
                      placeholder="How many"
                      className="num h-11 w-28 flex-none rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none"
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} className="tap flex h-11 w-11 flex-none items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                  {there !== null && (
                    <p className={`mt-1.5 text-[12.5px] ${over ? "font-semibold text-gold-700" : "text-neutral-600"}`}>
                      {over
                        ? `Ascend shows only ${qty(there)} at ${placeName(fromId)}. You can still send it; count the shelf there after.`
                        : `${qty(there)} at ${placeName(fromId)}`}
                    </p>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border-[1.5px] border-dashed border-line-brand text-[13.5px] font-semibold text-teal-800">
              <Icon name="plus" size={15} />
              Add another product
            </button>
          </fieldset>

          <label className="text-[13px] font-semibold text-neutral-700">
            Anything to know?
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is carrying it, which car" className={field} />
          </label>

          <fieldset>
            <legend className="text-[13px] font-semibold text-neutral-700">Is it there yet?</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" aria-pressed={arrived === false} onClick={() => { setArrived(false); setError(null); }} className={chip(arrived === false)}>
                On the way
              </button>
              <button type="button" aria-pressed={arrived === true} onClick={() => { setArrived(true); setError(null); }} className={chip(arrived === true)}>
                Already there, I took it
              </button>
            </div>
            {arrived === false && toId && (
              <p className="mt-2 text-[12.5px] text-neutral-600">
                Someone at {placeName(toId)} counts what arrives. Anything missing is written off as lost on the way.
              </p>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
              {error}
            </p>
          )}

          <button type="button" onClick={send} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
            {busy ? "Sending it on its way..." : arrived ? "Move this stock" : "Send this stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
