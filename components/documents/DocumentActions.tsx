"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { Toast, useToast } from "@/components/shell/Toast";

// What can be done to one document from its page (Modules M3): record a
// payment the customer made outside a pay link, send a draft out, turn a
// quotation into an invoice, and give money back with a credit note.

const field =
  "w-full min-h-[44px] rounded-control border-[1.5px] border-neutral-200 bg-white px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none";

async function post(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/documents/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "We could not reach Ascend just now. Check your connection and tap again." } };
  }
}

const METHODS: Array<[string, string]> = [
  ["mobile_money", "MoMo"],
  ["cash", "Cash"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
];

export function RecordPayment({ documentId, balance, customerFirst }: { documentId: string; balance: number; customerFirst: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState("mobile_money");
  const [reference, setReference] = useState("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
  const [paidOn, setPaidOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt, so a retried tap is the same payment.
  const key = useMemo(() => `${documentId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, [documentId, open]);

  async function save() {
    const n = parseFloat(amount);
    if (!(n > 0)) return setError("Enter how much they paid, in GHS.");
    if (n > balance + 0.005) return setError(`That is more than is left. ${formatGHS(balance)} is still owed.`);
    setBusy(true);
    setError(null);
    const r = await post(documentId, { action: "record_payment", amount: n, method, reference, paidOn, clientRef: key });
    setBusy(false);
    if (!r.ok) return setError((r.data.error as string) ?? "That did not go through. Tap again.");
    const receipt = r.data.receipt as { number: string | null } | null;
    const left = Number(r.data.outstanding ?? 0);
    toast.show(
      `${formatGHS(n)} recorded${receipt?.number ? `, receipt ${receipt.number} made` : ""}. ${left > 0.005 ? `${formatGHS(left)} still owed.` : "Paid in full."}`
    );
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${secondaryAction} min-h-[40px] justify-center`}>
          Record a payment
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-panel border border-line-brand p-3">
          <span className="text-[13px] font-semibold text-ink">What {customerFirst} paid you</span>
          <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
            Amount, GHS
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <div role="radiogroup" aria-label="How they paid" className="grid grid-cols-2 gap-1.5">
            {METHODS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={method === k}
                onClick={() => setMethod(k)}
                className={`tap flex min-h-[40px] items-center justify-center rounded-[10px] border-[1.5px] text-[13px] font-semibold ${
                  method === k ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {method !== "cash" && (
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "mobile_money" ? "MoMo transaction ID, if you have it" : "Reference, if you have it"}
              aria-label="Reference"
              className={field}
            />
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-600">
            Paid on
            <input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className={field} />
          </label>
          {error && (
            <p role="alert" className="text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}>
              {busy ? "Recording it..." : `Record ${parseFloat(amount) > 0 ? formatGHS(parseFloat(amount)) : "it"}`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={secondaryAction}>
              Not now
            </button>
          </div>
          <span className="text-xs leading-relaxed text-neutral-600">
            Only for money that reached you outside Ascend. A receipt is made for it and the invoice updates.
          </span>
        </div>
      )}
      <Toast message={toast.message} />
    </div>
  );
}

const CONVERT: Record<string, string> = {
  proforma: "Make a proforma",
  invoice: "Make the invoice",
};

export function DocumentButtons({
  documentId,
  issued,
  type,
  conversions,
  creditable,
}: {
  documentId: string;
  issued: boolean;
  type: string;
  /** Where this document can go next (quotation to invoice, and so on). */
  conversions: string[];
  /** An issued invoice with something left to credit. */
  creditable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crediting, setCrediting] = useState(false);
  const [reason, setReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");

  async function act(key: string, body: Record<string, unknown>, done: (d: Record<string, unknown>) => void) {
    setBusy(key);
    setError(null);
    const r = await post(documentId, body);
    setBusy(null);
    if (!r.ok) return setError((r.data.error as string) ?? "That did not go through. Tap again.");
    done(r.data);
  }

  const shown = conversions.filter((c) => CONVERT[c]);
  if (issued && shown.length === 0 && !creditable) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {!issued && (
        <button
          type="button"
          onClick={() => act("issue", { action: "issue" }, () => { toast.show("Sent out. Its number and contents are fixed now."); router.refresh(); })}
          disabled={busy !== null}
          className={`${primaryAction} min-h-[40px] justify-center disabled:opacity-60`}
        >
          <Icon name="send" size={15} />
          {busy === "issue" ? "Sending it out..." : `Send this ${type === "purchase_order" ? "order" : type.replace("_", " ")} out`}
        </button>
      )}
      {shown.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => act(c, { action: "convert", toType: c }, (d) => (d.documentId ? router.push(`/documents/${d.documentId}`) : router.refresh()))}
          disabled={busy !== null}
          className={`${c === "invoice" ? primaryAction : secondaryAction} min-h-[40px] justify-center disabled:opacity-60`}
        >
          {busy === c ? "Making it..." : CONVERT[c]}
        </button>
      ))}
      {creditable && !crediting && (
        <button type="button" onClick={() => setCrediting(true)} className={`${secondaryAction} min-h-[40px] justify-center`}>
          Give money back
        </button>
      )}
      {creditable && crediting && (
        <div className="flex flex-col gap-2 rounded-panel border border-line-brand p-3">
          <span className="text-[13px] font-semibold text-ink">A credit note</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you giving this back?" aria-label="Reason for the credit note" className={field} />
          <input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} inputMode="decimal" placeholder="Amount, or leave blank for all of it" aria-label="Amount to credit" className={field} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null || reason.trim().length < 4}
              onClick={() =>
                act("credit", { action: "credit", reason, ...(creditAmount.trim() ? { amount: parseFloat(creditAmount) } : {}) }, (d) => {
                  setCrediting(false);
                  toast.show(`${d.number} issued for ${formatGHS(Number(d.credited ?? 0))}.`);
                  router.refresh();
                })
              }
              className={`${primaryAction} flex-1 justify-center disabled:opacity-60`}
            >
              {busy === "credit" ? "Issuing it..." : "Issue the credit note"}
            </button>
            <button type="button" onClick={() => setCrediting(false)} className={secondaryAction}>
              Not now
            </button>
          </div>
          <span className="text-xs text-neutral-600">The reason is kept on the record and shows on the credit note.</span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
