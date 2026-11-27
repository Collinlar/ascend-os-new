"use client";

// Recording money paid to Ascend (round 3, P4), and a business's Account
// Manager. Each form says what it will do before it does it.

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "min-h-[44px] w-full rounded-control border border-line bg-white px-3 text-base text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none sm:text-sm";
const button = "tap inline-flex min-h-[44px] items-center justify-center rounded-control bg-teal px-4 text-sm font-bold text-white disabled:opacity-60";

async function post(body: Record<string, unknown>) {
  try {
    const r = await fetch("/api/admin/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "We could not reach the server. Try again." } };
  }
}

function PaidWith({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input} aria-label="How they paid">
      <option value="bank_transfer">Bank transfer</option>
      <option value="momo">MoMo</option>
      <option value="cash">Cash</option>
      <option value="card">Card</option>
    </select>
  );
}

export function RecordPayment({ orderId, amount, reference }: { orderId: string; amount: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paidWith, setPaidWith] = useState("bank_transfer");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className={button} onClick={() => setOpen(true)}>
        Record the money
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-[13px] text-ink">
        Record {amount} received for {reference}. It switches on for the business straight away.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PaidWith value={paidWith} onChange={setPaidWith} />
        <input className={input} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank or MoMo reference" aria-label="Bank or MoMo reference" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await post({ action: "record_payment", orderId, paidWith, reference: ref });
            setBusy(false);
            if (!r.ok) return setError(r.data.error ?? "That did not go through.");
            router.refresh();
          }}
        >
          {busy ? "Recording" : `Yes, ${amount} arrived`}
        </button>
        <button type="button" className="tap min-h-[44px] px-2 text-[13px] font-semibold text-ink-muted" onClick={() => setOpen(false)}>
          Not yet
        </button>
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}

export function RecordTopUp({ businesses }: { businesses: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidWith, setPaidWith] = useState("bank_transfer");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className={input} aria-label="Which business">
        <option value="">Which business paid?</option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount in GHS" aria-label="Amount in GHS" />
        <PaidWith value={paidWith} onChange={setPaidWith} />
        <input className={input} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank or MoMo reference" aria-label="Bank or MoMo reference" />
      </div>
      <button
        type="button"
        className={`${button} self-start`}
        disabled={busy || !businessId || !amount}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await post({ action: "record_payment", businessId, amount: Number(amount), paidWith, reference: ref });
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.data.error ?? "That did not go through." });
          setMsg({ ok: true, text: `GHS ${amount} added to their Balance. Receipt ${r.data.reference}.` });
          setAmount("");
          setRef("");
          router.refresh();
        }}
      >
        {busy ? "Adding it" : "Add to their Balance"}
      </button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-[13px] ${msg.ok ? "text-success-ink" : "text-danger-ink"}`}>{msg.text}</p>}
    </div>
  );
}

export function ManagerForm({ businessId, current }: { businessId: string; current: { name: string; whatsapp: string } | null }) {
  const router = useRouter();
  const [name, setName] = useState(current?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(current?.whatsapp ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (action: "set_manager" | "remove_manager") => {
    setBusy(true);
    setError(null);
    const r = await post({ action, businessId, name, whatsapp });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "That did not go through.");
    if (action === "remove_manager") {
      setName("");
      setWhatsapp("");
    }
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name, like Ama K." aria-label="Account Manager name" />
        <input className={input} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Their WhatsApp, +233..." aria-label="Account Manager WhatsApp" inputMode="tel" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => send("set_manager")}>
          {current ? "Save the Account Manager" : "Assign the Account Manager"}
        </button>
        {current && (
          <button type="button" className="tap min-h-[44px] px-2 text-[13px] font-semibold text-ink-muted" disabled={busy} onClick={() => send("remove_manager")}>
            Remove them
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
