"use client";

// The customer's side of an order, for the owner (round 2, R5): send them
// their tracking link, and answer what they reported. An order problem
// reaches the shop first; if it is not sorted in 48 hours, Ascend's risk
// desk reads it (decision 7).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryAction, primaryAction } from "@/components/shell/Page";
import { StatusPill } from "@/components/shell/Parts";

export interface OwnerReportView {
  id: string;
  issue: string;
  status: string;
  detail: string | null;
  photos: string[];
  sentAt: string;
  escalateAt: string | null;
  shopReply: string | null;
}

export default function OrderCustomerCare({
  orderId,
  orderRef,
  customerFirst,
  customerPhone,
  reports,
}: {
  orderId: string;
  orderRef: string;
  customerFirst: string;
  customerPhone: string | null;
  reports: OwnerReportView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  // A link to copy, when there is no WhatsApp number to send it to.
  const [copied, setCopied] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(`/api/shop/orders/${orderId}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not go through. Tap again.");
        return null;
      }
      return out;
    } catch {
      setError("We could not reach Ascend just now. Tap again in a moment.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  // A fresh private link, sent from the owner's own WhatsApp.
  async function shareLink() {
    // Opened first so the browser does not block it as a popup.
    const tab = customerPhone ? window.open("about:blank", "_blank") : null;
    const out = await call({ action: "share_link" }, "share");
    if (!out?.path) {
      tab?.close();
      return;
    }
    const url = `${window.location.origin}${out.path}`;
    const text = `Hello ${customerFirst}, you can follow your order ${orderRef} here: ${url}`;
    if (tab && customerPhone) {
      tab.location.href = `https://wa.me/${customerPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Shown below to copy by hand.
      }
      setCopied(url);
    }
  }

  async function reply(reportId: string, sorted: boolean) {
    const out = await call({ action: "reply", reportId, reply: replies[reportId] ?? "", sorted }, `${reportId}:${sorted}`);
    if (out) {
      setReplies((prev) => ({ ...prev, [reportId]: "" }));
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-bold text-ink-heading">The customer&rsquo;s side</h2>
        <button type="button" onClick={shareLink} disabled={busy !== null} className={`${secondaryAction} min-h-[40px] disabled:opacity-60`}>
          {busy === "share" ? "Making the link..." : `Send ${customerFirst} the tracking link`}
        </button>
      </div>
      <p className="text-[12.5px] text-neutral-600">
        A private page where {customerFirst} sees the order as it moves, what was paid and the receipt, and can tell you if something is wrong.
      </p>

      {copied && (
        <p className="break-all rounded-control bg-teal-50 px-3 py-2 text-[13px] text-teal-800" role="status">
          No WhatsApp number on this order, so the link is copied. Paste it to them: {copied}
        </p>
      )}

      {reports.length === 0 ? (
        <p className="text-[13px] text-neutral-600">No problems reported on this order.</p>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-[14px] border border-neutral-100 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-ink">{r.issue}</span>
              <StatusPill tone={r.status === "with_shop" ? "warn" : r.status === "sorted_by_shop" ? "ok" : "bad"}>
                {r.status === "with_shop" ? "Waiting for you" : r.status === "sorted_by_shop" ? "You sorted it" : "With Ascend"}
              </StatusPill>
            </div>
            <span className="text-xs text-neutral-600">Reported {r.sentAt}</span>
            {r.detail && <p className="text-[13px] text-ink">{r.detail}</p>}
            {r.photos.length > 0 && (
              <div className="flex gap-2">
                {r.photos.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-[10px] object-cover" />
                  </a>
                ))}
              </div>
            )}
            {r.shopReply && (
              <p className="rounded-[10px] bg-teal-50 px-3 py-2 text-[13px] text-ink">
                <span className="font-semibold text-teal-800">You replied: </span>
                {r.shopReply}
              </p>
            )}
            {r.status === "with_shop" ? (
              <>
                <p className="text-xs font-semibold text-gold-700">
                  Sort it by {r.escalateAt ?? "48 hours after it was sent"}, or Ascend&rsquo;s risk desk reads it.
                </p>
                <textarea
                  value={replies[r.id] ?? ""}
                  onChange={(e) => setReplies((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  rows={2}
                  maxLength={600}
                  placeholder={`What did you do for ${customerFirst}? A swap, a refund, a new delivery time.`}
                  aria-label="Your reply to the customer"
                  className="w-full resize-y rounded-control border border-neutral-200 px-3 py-2.5 text-base text-ink placeholder:text-neutral-500 focus:border-teal focus:outline-none sm:text-[13.5px]"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => reply(r.id, true)} disabled={busy !== null} className={`${primaryAction} min-h-[40px] disabled:opacity-60`}>
                    {busy === `${r.id}:true` ? "Saving..." : "Reply and mark sorted"}
                  </button>
                  <button type="button" onClick={() => reply(r.id, false)} disabled={busy !== null} className={`${secondaryAction} min-h-[40px] disabled:opacity-60`}>
                    {busy === `${r.id}:false` ? "Saving..." : "Reply, still working on it"}
                  </button>
                </div>
                <span className="text-xs text-neutral-600">{customerFirst} sees your reply on their order page. They can still send it to Ascend if it is not sorted.</span>
              </>
            ) : r.status === "open" ? (
              <p className="text-xs text-neutral-600">Ascend&rsquo;s risk desk is reading this. They may ask you about it.</p>
            ) : null}
          </div>
        ))
      )}
      {error && (
        <p role="alert" className="rounded-control bg-danger-tint px-3 py-2 text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </section>
  );
}
