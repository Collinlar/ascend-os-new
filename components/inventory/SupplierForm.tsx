"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

// Add a supplier, or change one (Advanced Inventory A2). Terms are free
// text on purpose (0054): "end of month", "on delivery", "when the
// container lands".

export interface SupplierFields {
  id?: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  paymentTerms: string | null;
  notes: string | null;
}

export default function SupplierForm({ businessId, supplier }: { businessId: string; supplier?: SupplierFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contactName ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [terms, setTerms] = useState(supplier?.paymentTerms ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("What is the supplier called?");
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/supplier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, supplierId: supplier?.id, name: name.trim(), contactName: contact.trim(), phone: phone.trim(), paymentTerms: terms.trim(), notes: notes.trim() }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "We could not save that supplier just now. Tap again in a moment.");
        return;
      }
      setOpen(false);
      if (!supplier) {
        setName("");
        setContact("");
        setPhone("");
        setTerms("");
        setNotes("");
      }
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
    return supplier ? (
      <button type="button" onClick={() => setOpen(true)} className="tap min-h-[44px] rounded-control px-3 text-[13.5px] font-semibold text-teal-800 hover:bg-teal-50">
        Change details
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className={secondaryAction}>
        Add a supplier
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={supplier ? `Change ${supplier.name}` : "Add a supplier"} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pb-6 pt-5 sm:max-w-lg sm:rounded-[20px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-ink-heading">{supplier ? supplier.name : "Add a supplier"}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="tap -mr-2 flex h-11 w-11 items-center justify-center rounded-control text-neutral-600 hover:bg-neutral-100">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-[13px] font-semibold text-neutral-700">
            What are they called?
            <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Makola Wholesale" className={field} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-neutral-700">
              Who do you deal with there?
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Auntie Esi" className={field} />
            </label>
            <label className="text-[13px] font-semibold text-neutral-700">
              Their WhatsApp number
              <input value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} inputMode="tel" placeholder="024 123 4567" className={field} />
            </label>
          </div>
          <label className="text-[13px] font-semibold text-neutral-700">
            When do you pay them?
            <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="End of month, on delivery" className={field} />
          </label>
          <label className="text-[13px] font-semibold text-neutral-700">
            Anything else to remember?
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Closed on Sundays" className={field} />
          </label>
          {error && (
            <p role="alert" className="rounded-control bg-danger-tint px-3 py-2.5 text-[13.5px] text-danger-ink">
              {error}
            </p>
          )}
          <button type="button" onClick={save} disabled={busy} className="tap flex min-h-[48px] items-center justify-center rounded-control bg-teal px-4 text-[15px] font-bold text-white hover:bg-teal-hover disabled:opacity-60">
            {busy ? "Saving their details..." : "Save this supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}
