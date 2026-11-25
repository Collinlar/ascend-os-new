"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { formatGHS } from "@/lib/money";
import { orderMessage, whatsappLink } from "@/lib/inventory/order-message";

// Order stock (Advanced Inventory A2). The order becomes a numbered
// purchase order the owner can send to the supplier on WhatsApp. Nothing
// moves on the shelf or in the money until the goods arrive.

interface Line {
  key: string;
  itemId: string;
  quantity: string;
  unitCost: string;
}

const blank = (): Line => ({ key: crypto.randomUUID(), itemId: "", quantity: "", unitCost: "" });
const numeric = (v: string) => v.replace(/[^\d.]/g, "");
const NEW = "__new__";

export interface OrderDraft {
  supplierId: string | null;
  placeId: string;
  lines: { itemId: string; quantity: number | null; unitCost: number | null }[];
}

const draftLines = (d: OrderDraft): Line[] =>
  d.lines.map((l) => ({ key: crypto.randomUUID(), itemId: l.itemId, quantity: l.quantity === null ? "" : String(l.quantity), unitCost: l.unitCost === null ? "" : String(l.unitCost) }));

export default function PlaceOrder({
  businessId,
  businessName,
  places,
  items,
  suppliers,
  draft,
}: {
  businessId: string;
  businessName: string;
  places: { id: string; name: string }[];
  items: { id: string; name: string; averageCost: number | null }[];
  suppliers: { id: string; name: string; phone: string | null }[];
  draft?: OrderDraft;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // A draft for products with no usual supplier starts with nobody picked,
  // so the order cannot go to the first name on the list by accident.
  const startSupplier = (d?: OrderDraft) => (d ? d.supplierId ?? "" : suppliers[0]?.id ?? NEW);
  const [supplierId, setSupplierId] = useState(startSupplier(draft));
  const [newName, setNewName] = useState("");
  const [placeId, setPlaceId] = useState(draft?.placeId ?? places[0]?.id ?? "");
  const [expectedOn, setExpectedOn] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>(() => (draft ? draftLines(draft) : [blank()]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; documentId: string; text: string; phone: string | null; supplier: string } | null>(null);
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const total = useMemo(() => lines.reduce((n, l) => (l.unitCost !== "" && Number(l.quantity) > 0 ? n + Number(l.quantity) * Number(l.unitCost) : n), 0), [lines]);

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function pickItem(key: string, itemId: string) {
    const avg = items.find((i) => i.id === itemId)?.averageCost ?? null;
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, itemId, unitCost: l.unitCost || (avg !== null ? String(Math.round(avg * 100) / 100) : "") } : l)));
    setError(null);
  }

  async function place() {
    setError(null);
    if (supplierId === "") return setError("Pick who you are ordering from.");
    const isNew = supplierId === NEW;
    if (isNew && !newName.trim()) return setError("Say who you are ordering from.");
    const filled = lines.filter((l) => l.itemId || l.quantity || l.unitCost);
    if (filled.length === 0) return setError("Add at least one product to the order.");
    const seen = new Set<string>();
    for (const l of filled) {
      const name = items.find((i) => i.id === l.itemId)?.name;
      if (!l.itemId) return setError("Pick the product on every line, or clear the empty one.");
      if (seen.has(l.itemId)) return setError(`${name} is on two lines. Put it on one line with the full number.`);
      seen.add(l.itemId);
      if (!(Number(l.quantity) > 0)) return setError(`Say how many ${name ?? "of that product"} you want.`);
    }
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          locationId: placeId,
          clientRef,
          supplierId: isNew ? undefined : supplierId,
          supplierName: isNew ? newName.trim() : undefined,
          expectedOn: expectedOn || undefined,
          note: note.trim(),
          lines: filled.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: l.unitCost === "" ? null : Number(l.unitCost) })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not place that order just now. Your lines are still here. Tap again.");
        return;
      }
      const sup = isNew ? { name: newName.trim(), phone: null } : suppliers.find((s) => s.id === supplierId)!;
      setDone({
        number: body.number,
        documentId: body.document_id,
        supplier: sup.name,
        phone: sup.phone,
        text: orderMessage({
          businessName,
          number: body.number,
          place: places.find((p) => p.id === placeId)?.name ?? "",
          expectedOn: expectedOn || null,
          lines: filled.map((l) => ({ item: items.find((i) => i.id === l.itemId)?.name ?? "", quantity: Number(l.quantity) })),
        }),
      });
      setLines([blank()]);
      setNote("");
      setExpectedOn("");
      setNewName("");
      setClientRef(crypto.randomUUID());
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. The order is not placed yet. Check your connection and tap again.");
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
          if (draft) {
            setLines(draftLines(draft));
            setSupplierId(startSupplier(draft));
            setPlaceId(draft.placeId);
          }
        }}
        className={secondaryAction}
      >
        {draft ? "Draft this order" : "Order stock"}
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Order stock" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-lg sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-ink-heading">Order stock</h2>
            <p className="text-[13px] text-neutral-600">What you want from a supplier. Nothing changes on your shelf until it arrives.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
            <Icon name="close" size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-control bg-teal-50 px-3 py-2.5 text-[14px] font-semibold text-teal-800">
              Order {done.number} placed with {done.supplier}.
            </p>
            {done.phone ? (
              <a href={whatsappLink(done.phone, done.text)} target="_blank" rel="noreferrer" className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover">
                Send it to {done.supplier} on WhatsApp
              </a>
            ) : (
              <p className="text-[13px] text-neutral-600">Add {done.supplier}&rsquo;s WhatsApp number on the Suppliers tab to send orders straight to them.</p>
            )}
            <a href={`/api/documents/${done.documentId}/pdf`} target="_blank" rel="noreferrer" className="tap flex min-h-[44px] items-center justify-center rounded-control border-[1.5px] border-line-brand px-4 text-[14px] font-semibold text-ink">
              Download the order
            </a>
            <button type="button" onClick={() => setDone(null)} className="tap min-h-[44px] text-[13.5px] font-semibold text-teal-800">
              Order something else
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="text-[13px] font-semibold text-neutral-700">
              Who are you ordering from?
              <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setError(null); }} className={field}>
                {supplierId === "" && <option value="">Pick who</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW}>Someone new</option>
              </select>
            </label>
            {supplierId === NEW && (
              <label className="text-[13px] font-semibold text-neutral-700">
                What are they called?
                <input value={newName} onChange={(e) => { setNewName(e.target.value); setError(null); }} placeholder="Makola Wholesale" className={field} />
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {places.length > 1 && (
                <label className="text-[13px] font-semibold text-neutral-700">
                  Deliver to
                  <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={field}>
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-[13px] font-semibold text-neutral-700">
                When do you expect it?
                <input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} className={field} />
              </label>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-[13px] font-semibold text-neutral-700">What you want</legend>
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-control border border-line-brand p-3">
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Product on line ${i + 1}`}
                      value={l.itemId}
                      onChange={(e) => pickItem(l.key, e.target.value)}
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
                      Price each, GHS
                      <input value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: numeric(e.target.value) })} inputMode="decimal" placeholder="If you know it" className={`num ${field}`} />
                    </label>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border-[1.5px] border-dashed border-line-brand text-[13.5px] font-semibold text-teal-800">
                <Icon name="plus" size={15} />
                Add another product
              </button>
            </fieldset>

            {total > 0 && (
              <p className="flex items-baseline justify-between text-[14px] text-neutral-700">
                <span>Expected cost</span>
                <span className="num font-heading text-[18px] font-extrabold text-ink-heading">{formatGHS(total)}</span>
              </p>
            )}

            <label className="text-[13px] font-semibold text-neutral-700">
              Anything to tell them?
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deliver before Friday" className={field} />
            </label>

            {error && (
              <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
                {error}
              </p>
            )}

            <button type="button" onClick={place} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
              {busy ? "Writing up your order..." : "Place this order"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
