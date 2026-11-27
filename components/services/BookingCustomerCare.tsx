"use client";

// The customer's side of a booking, for the owner (round 4, S2): send them
// their booking link, return a deposit they are owed, and read what they
// said about the visit.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction } from "@/components/shell/Page";
import { formatGHS } from "@/lib/money";

export default function BookingCustomerCare({
  bookingId,
  customerFirst,
  customerPhone,
  businessName,
  serviceName,
  depositToReturn,
  depositReturned,
  returnedHow,
  cancelledByCustomer,
  rating,
}: {
  bookingId: string;
  customerFirst: string;
  customerPhone: string | null;
  businessName: string;
  serviceName: string;
  depositToReturn: number | null;
  depositReturned: boolean;
  returnedHow: string | null;
  cancelledByCustomer: boolean;
  rating: { stars: number; comment: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [method, setMethod] = useState("mobile_money");

  async function call(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(`/api/services/bookings/${bookingId}/customer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That did not go through. Tap again.");
        return null;
      }
      return data;
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    // Open the tab now, while the tap still counts, and point it at
    // WhatsApp once the link is made.
    const tab = customerPhone ? window.open("about:blank", "_blank") : null;
    const data = await call({ action: "share_link" }, "share");
    if (!data?.path) {
      tab?.close();
      return;
    }
    const url = `${window.location.origin}${data.path}`;
    if (tab && customerPhone) {
      const text = `Hello ${customerFirst}, this is ${businessName}. Here is your ${serviceName} booking. You can see it, move it or cancel it here: ${url}`;
      tab.location.href = `https://wa.me/${customerPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
    } else {
      await navigator.clipboard?.writeText(url).catch(() => null);
      setCopied(url);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {depositToReturn && depositToReturn > 0 ? (
        depositReturned ? (
          <p className="text-[13.5px] text-ink">
            {formatGHS(depositToReturn)} deposit returned{returnedHow ? ` by ${returnedHow.replace("_", " ")}` : ""}.
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-[14px] bg-gold-light px-3.5 py-3">
            <strong className="text-[13.5px] text-gold-ink">Deposit to return: {formatGHS(depositToReturn)}</strong>
            <span className="text-[12.5px] text-ink">
              {cancelledByCustomer ? `${customerFirst} cancelled inside your free window.` : "This booking was cancelled."} Return it, then mark it here so Money follows.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="How you returned it" className="min-h-[40px] rounded-control border border-line bg-white px-2 text-[14px] text-ink">
                <option value="mobile_money">By MoMo</option>
                <option value="cash">In cash</option>
                <option value="bank_transfer">By bank transfer</option>
              </select>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  if (await call({ action: "return_deposit", method }, "return")) router.refresh();
                }}
                className={`${secondaryAction} min-h-[40px]`}
              >
                {busy === "return" ? "Saving" : `I returned ${formatGHS(depositToReturn)}`}
              </button>
            </div>
          </div>
        )
      ) : null}

      {rating && (
        <div className="flex flex-col gap-1">
          <span className="text-[13.5px] font-bold text-ink" aria-label={`${rating.stars} out of 5 stars`}>
            {"★".repeat(rating.stars)}
            <span className="text-neutral-500">{"★".repeat(5 - rating.stars)}</span> from {customerFirst}
          </span>
          {rating.comment && <span className="text-[13px] text-neutral-700">&ldquo;{rating.comment}&rdquo;</span>}
          <span className="text-[12px] text-neutral-600">Only your business sees this.</span>
        </div>
      )}

      <button type="button" disabled={busy !== null} onClick={share} className={`${secondaryAction} min-h-[40px] justify-center`}>
        {busy === "share" ? "Making the link" : customerPhone ? `Send ${customerFirst} their booking link` : "Copy their booking link"}
      </button>
      {copied && <p className="break-all text-[12.5px] text-neutral-700">Copied: {copied}</p>}
      <span className="text-[12px] text-neutral-600">They can see the booking there, and move or cancel it inside your free window.</span>
      {error && <p role="alert" className="text-[13px] text-danger-ink">{error}</p>}
    </div>
  );
}
