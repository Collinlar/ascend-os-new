"use client";

// "Something wrong with this order?" on the customer's order page (round
// 2, R5, decision 7). The shop sees an order problem first and usually
// replies within a day; if it is not sorted in 48 hours, Ascend steps in.
// The customer can send it on sooner with "Still not sorted".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_ISSUES } from "@/lib/shop/order-issues";

export interface OrderReportView {
  id: string;
  issue: string;
  status: string;
  detail: string | null;
  photos: string[];
  sentAt: string;
  escalateAt: string | null;
  shopReply: string | null;
}

export default function OrderHelp({
  token,
  businessName,
  reports,
  returnsLine,
}: {
  token: string;
  businessName: string;
  reports: OrderReportView[];
  returnsLine: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ withShop: boolean } | null>(null);
  const chosen = ORDER_ISSUES.find((i) => i.key === issue);

  // Each photo becomes a JPEG of at most 1280px, so it is small on a
  // Ghanaian data bundle and the shop can still see the damage.
  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = 3 - photos.length;
    const made: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      if (!/^image\//.test(file.type)) continue;
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
          img.src = url;
        });
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        made.push(c.toDataURL("image/jpeg", 0.8));
      } catch {
        setError("One photo could not be read. Try taking it again.");
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    setPhotos((prev) => [...prev, ...made].slice(0, 3));
  }

  async function send() {
    if (!chosen) return setError("Pick what happened, then send.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/order-link/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, issue: chosen.key, detail, photos: photos.map((p) => p.split(",")[1]) }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not go through. Tap send again.");
        return;
      }
      setSent({ withShop: Boolean(out.withShop) });
      router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Check your connection and tap send again.");
    } finally {
      setBusy(false);
    }
  }

  async function escalate(reportId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/order-link/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reportId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) setError(out.error ?? "That did not go through. Tap again.");
      else router.refresh();
    } catch {
      setError("We could not reach Ascend just now. Tap again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.map((r) => (
        <div key={r.id} className="rounded-panel border border-line bg-white p-4">
          <p className="text-[14px] font-bold text-ink">{r.issue}</p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-grey">Sent {r.sentAt}</p>
          {r.detail && <p className="mt-2 text-[13px] font-medium text-ink-muted">{r.detail}</p>}
          {r.photos.length > 0 && (
            <div className="mt-2 flex gap-2">
              {r.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Photo ${i + 1} you sent`} width={64} height={64} className="h-16 w-16 rounded-control object-cover" />
              ))}
            </div>
          )}
          {r.shopReply && (
            <div className="mt-3 rounded-control bg-teal-light px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-dark">{businessName} replied</p>
              <p className="mt-0.5 text-[13px] font-medium text-ink">{r.shopReply}</p>
            </div>
          )}
          <p className="mt-3 text-[12.5px] font-semibold text-ink-muted">
            {r.status === "with_shop"
              ? `With ${businessName}. If it is not sorted by ${r.escalateAt ?? "48 hours from sending"}, Ascend will review it.`
              : r.status === "sorted_by_shop"
                ? `${businessName} says this is sorted.`
                : r.status === "open"
                  ? "Ascend is reviewing it. Replies come to your WhatsApp."
                  : "Ascend has reviewed it."}
          </p>
          {(r.status === "with_shop" || r.status === "sorted_by_shop") && (
            <button
              type="button"
              onClick={() => escalate(r.id)}
              disabled={busy}
              className="tap mt-2 inline-flex min-h-[44px] items-center rounded-control border border-line px-4 text-[13px] font-bold text-ink disabled:opacity-60"
            >
              Still not sorted, send to Ascend
            </button>
          )}
        </div>
      ))}

      {sent ? (
        <div className="rounded-panel bg-teal-light p-4" role="status">
          <p className="text-[14px] font-bold text-teal-dark">{sent.withShop ? `Sent to ${businessName}` : "Sent to Ascend"}</p>
          <p className="mt-1 text-[13px] font-medium text-ink-muted">
            {sent.withShop
              ? "Replies come to your WhatsApp. If the shop has not helped within 48 hours, Ascend will review it."
              : "A person at Ascend reads every report. Replies come to your WhatsApp."}
          </p>
        </div>
      ) : !open ? (
        <div className="rounded-panel border border-line bg-white p-4">
          <button type="button" onClick={() => setOpen(true)} className="tap flex min-h-[44px] w-full items-center text-left text-[14px] font-bold text-ink">
            Something wrong with this order?
          </button>
          {returnsLine && <p className="text-[12.5px] font-medium text-slate-grey">{returnsLine}</p>}
        </div>
      ) : (
        <section aria-labelledby="order-help" className="rounded-panel border border-line bg-white p-4">
          <h2 id="order-help" className="text-[15px] font-extrabold text-ink">What happened?</h2>
          <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="What happened">
            {ORDER_ISSUES.map((i) => (
              <button
                key={i.key}
                type="button"
                role="radio"
                aria-checked={issue === i.key}
                onClick={() => setIssue(i.key)}
                className={`tap flex min-h-[44px] items-center gap-3 rounded-control border-[1.5px] px-3 text-left text-[13.5px] font-semibold ${
                  issue === i.key ? "border-teal bg-teal-light text-teal-dark" : "border-line bg-white text-ink"
                }`}
              >
                <span aria-hidden className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 ${issue === i.key ? "border-teal" : "border-line-stronger"}`}>
                  {issue === i.key && <span className="h-2 w-2 rounded-full bg-teal" />}
                </span>
                {i.label}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-xs font-bold text-ink-muted" htmlFor="order-help-detail">
            Tell us more
          </label>
          <textarea
            id="order-help-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="What did you get, and what should have come?"
            className="mt-2 w-full resize-none rounded-control border border-line-strong bg-surface px-3 py-2.5 text-base font-medium text-ink outline-none placeholder:text-slate-grey focus:border-teal"
          />
          {chosen?.shopFirst !== false && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((p, i) => (
                  <span key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt={`Photo ${i + 1}`} width={64} height={64} className="h-16 w-16 rounded-control object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className="tap absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {photos.length < 3 && (
                  <label className="tap inline-flex min-h-[44px] cursor-pointer items-center rounded-control border border-dashed border-line-stronger px-4 text-[13px] font-bold text-teal-dark">
                    Add photos
                    <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                  </label>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px] font-medium text-slate-grey">Up to 3. A photo of the damage helps the shop sort it fast.</p>
            </div>
          )}
          <p className="mt-3 rounded-control bg-surface px-3 py-2.5 text-[12.5px] font-medium leading-snug text-ink-muted">
            {chosen?.shopFirst === false
              ? "This goes to Ascend, not the shop. A person reads every report."
              : `${businessName} sees this first and usually replies within a day. If it is not sorted in 48 hours, Ascend steps in.`}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="tap mt-3 flex min-h-[48px] w-full items-center justify-center rounded-panel bg-navy-deep font-bold text-white disabled:opacity-60"
          >
            {busy ? "Sending..." : chosen?.shopFirst === false ? "Send to Ascend" : "Send to the shop"}
          </button>
        </section>
      )}
      {error && !open && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
