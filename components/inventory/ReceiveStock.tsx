"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { formatGHS } from "@/lib/money";

// Receive stock (Inventory Core I1): what came in, from whom, at what cost,
// and whether it is paid. Paid deliveries record the money out under "Stock
// and goods for resale" at the same moment, so the shelf and the cash agree
// without typing it twice (decision 2).
//
// Against an order (Advanced Inventory A2, 0132): the supplier and place
// come from the order and the lines start as what is still to come, at the
// price ordered. Change any line to what actually arrived.

type Method = "cash" | "mobile_money" | "bank_transfer" | "card";
const METHODS: [Method, string][] = [
  ["cash", "Cash"],
  ["mobile_money", "MoMo"],
  ["bank_transfer", "Bank"],
  ["card", "Card"],
];

interface Line {
  key: string;
  itemId: string;
  quantity: string;
  unitCost: string;
}

const blank = (): Line => ({ key: crypto.randomUUID(), itemId: "", quantity: "", unitCost: "" });

export interface ReceivableOrder {
  id: string;
  number: string | null;
  supplier: string;
  placeId: string;
  place: string;
  lines: { itemId: string; remaining: number; unitCost: number | null }[];
}

const fromOrder = (order: ReceivableOrder): Line[] =>
  order.lines
    .filter((l) => l.remaining > 0)
    .map((l) => ({ key: crypto.randomUUID(), itemId: l.itemId, quantity: String(l.remaining), unitCost: l.unitCost === null ? "" : String(l.unitCost) }));
const numeric = (v: string) => v.replace(/[^\d.]/g, "");

export default function ReceiveStock({
  businessId,
  places,
  items,
  order,
  supplierNames,
}: {
  businessId: string;
  places: { id: string; name: string }[];
  items: { id: string; name: string; averageCost: number | null }[];
  order?: ReceivableOrder;
  supplierNames?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [placeId, setPlaceId] = useState(order?.placeId ?? places[0]?.id ?? "");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>(() => (order ? fromOrder(order) : [blank()]));
  const [paid, setPaid] = useState<boolean | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // One key per delivery, kept across retries, so a tap on a bad connection
  // never counts the same goods in twice.
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const total = useMemo(
    () =>
      lines.reduce((n, l) => {
        const q = Number(l.quantity), c = Number(l.unitCost);
        return l.unitCost !== "" && Number.isFinite(q) && Number.isFinite(c) ? n + q * c : n;
      }, 0),
    [lines]
  );
  const anyCost = lines.some((l) => l.unitCost !== "");

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function startOver() {
    setSupplier("");
    setReference("");
    setLines([blank()]);
    setPaid(null);
    setMethod(null);
    setError(null);
    setClientRef(crypto.randomUUID());
  }

  async function save() {
    setError(null);
    const filled = lines.filter((l) => l.itemId || l.quantity || l.unitCost);
    if (filled.length === 0) return setError("Add at least one product that came in.");
    for (const l of filled) {
      const name = items.find((i) => i.id === l.itemId)?.name;
      if (!l.itemId) return setError("Pick the product on every line, or clear the empty one.");
      if (!(Number(l.quantity) > 0)) return setError(`Say how many ${name ?? "of that product"} came in.`);
    }
    if (paid === null) return setError("Say whether you have paid for this delivery.");
    if (paid && !method) return setError("Say how you paid: cash, MoMo, bank or card.");
    if (paid && total <= 0) return setError("Add what you paid for at least one line, so we know how much money went out.");

    setBusy(true);
    try {
      const res = await fetch("/api/inventory/receive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: placeId,
          supplierName: order ? "" : supplier.trim(),
          purchaseOrderId: order?.id,
          reference: reference.trim(),
          paid,
          paymentMethod: paid ? method : undefined,
          clientRef,
          lines: filled.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: l.unitCost === "" ? null : Number(l.unitCost) })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save that delivery just now. Tap again in a moment.");
        return;
      }
      const count = filled.length;
      const from = order ? order.supplier : supplier.trim();
      setDone(
        `${count} ${count === 1 ? "product" : "products"} received${from ? ` from ${from}` : ""}.` +
          (order ? (body.order_status === "received" ? " The order has all arrived." : " The rest of the order is still expected.") : "") +
          (paid ? ` ${formatGHS(Number(body.total_cost ?? total))} recorded as money out.` : body.total_cost ? " Not paid yet, so no money out recorded." : "")
      );
      startOver();
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Your delivery is not saved yet. Check your connection and tap again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 h-11 w-full rounded-control border-[1.5px] border-line-brand bg-white px-3 text-[16px] text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";
  const chip = (on: boolean) =>
    `tap min-h-[44px] rounded-chip px-3.5 text-[13.5px] font-semibold ${on ? "bg-teal text-white" : "border-[1.5px] border-line-brand bg-white text-ink"}`;

  if (!open) {
    return order ? (
      <button type="button" onClick={() => { setOpen(true); setDone(null); setLines(fromOrder(order)); setError(null); }} className={secondaryAction}>
        Receive this order
      </button>
    ) : (
      <button type="button" onClick={() => { setOpen(true); setDone(null); }} className={primaryAction}>
        <Icon name="plus" size={16} />
        Receive stock
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Receive stock" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-lg sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink-heading">{order ? `Receive ${order.number ?? "this order"}` : "Receive stock"}</h2>
            <p className="text-[13px] text-neutral-600">
              {order ? `From ${order.supplier}, at ${order.place}. Change any line to what actually came.` : "What came in, and what you paid for it."}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
            <Icon name="close" size={18} />
          </button>
        </div>

        {done && <p className="mb-4 rounded-control bg-teal-50 px-3 py-2.5 text-[13.5px] font-semibold text-teal-800">{done}</p>}

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!order && (
              <label className="text-[13px] font-semibold text-neutral-700">
                Who supplied it?
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)} list={supplierNames?.length ? "receive-suppliers" : undefined} placeholder="Melcom, Makola wholesaler" className={field} />
                {supplierNames?.length ? (
                  <datalist id="receive-suppliers">
                    {supplierNames.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                ) : null}
              </label>
            )}
            <label className="text-[13px] font-semibold text-neutral-700">
              Their invoice or waybill number
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="If there is one" className={field} />
            </label>
          </div>

          {places.length > 1 && !order && (
            <label className="text-[13px] font-semibold text-neutral-700">
              Where did it arrive?
              <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={field}>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-neutral-700">What came in</legend>
            {lines.map((l, i) => {
              const avg = items.find((it) => it.id === l.itemId)?.averageCost ?? null;
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
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`} className="tap flex h-11 w-11 flex-none items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[12.5px] font-semibold text-neutral-700">
                      How many
                      <input value={l.quantity} onChange={(e) => setLine(l.key, { quantity: numeric(e.target.value) })} inputMode="decimal" placeholder="0" className={`num ${field}`} />
                    </label>
                    <label className="text-[12.5px] font-semibold text-neutral-700">
                      Cost each, GHS
                      <input value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: numeric(e.target.value) })} inputMode="decimal" placeholder="Optional" className={`num ${field}`} />
                    </label>
                  </div>
                  {avg !== null && <p className="mt-1.5 text-[12px] text-neutral-600">Last average cost {formatGHS(avg)}</p>}
                </div>
              );
            })}
            <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border-[1.5px] border-dashed border-line-brand text-[13.5px] font-semibold text-teal-800">
              <Icon name="plus" size={15} />
              Add another product
            </button>
          </fieldset>

          {anyCost && (
            <p className="flex items-baseline justify-between text-[14px] text-neutral-700">
              <span>Cost of this delivery</span>
              <span className="num font-heading text-[18px] font-extrabold text-ink-heading">{formatGHS(total)}</span>
            </p>
          )}

          <fieldset>
            <legend className="text-[13px] font-semibold text-neutral-700">Have you paid for it?</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button type="button" aria-pressed={paid === true} onClick={() => { setPaid(true); setError(null); }} className={chip(paid === true)}>
                Yes, paid
              </button>
              <button type="button" aria-pressed={paid === false} onClick={() => { setPaid(false); setMethod(null); setError(null); }} className={chip(paid === false)}>
                Not yet
              </button>
            </div>
            {paid && (
              <div className="mt-3">
                <p className="text-[12.5px] font-semibold text-neutral-700">How did you pay?</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {METHODS.map(([m, label]) => (
                    <button key={m} type="button" aria-pressed={method === m} onClick={() => { setMethod(m); setError(null); }} className={chip(method === m)}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-neutral-600">We record it as money out under Stock and goods for resale.</p>
              </div>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
              {error}
            </p>
          )}

          <button type="button" onClick={save} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
            {busy ? "Counting it in..." : "Save this delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}
