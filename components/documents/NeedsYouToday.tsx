"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";
import type { NeedsYou } from "@/lib/documents/workspace";
import { primaryAction, secondaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { sendReminder } from "./RemindButton";

// Documents, Needs you today (Modules M3): invoices past their date with
// something still owed, quotations a customer accepted that have no invoice
// yet, and drafts nobody sent. Each with the one thing that clears it.

const TYPE: Record<string, string> = {
  quotation: "quotation",
  invoice: "invoice",
  receipt: "receipt",
  purchase_order: "purchase order",
};

export default function NeedsYouToday({ needs }: { needs: NeedsYou }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Array<{ number: string | null; link: string }>>([]);
  const reachable = needs.overdue.filter((o) => o.reachable);
  const overdueTotal = needs.overdue.reduce((n, o) => n + o.outstanding, 0);

  async function remindAll() {
    setBusy(true);
    setSaid(null);
    setFallback([]);
    let sent = 0;
    let why: string | null = null;
    const own: Array<{ number: string | null; link: string }> = [];
    for (const o of reachable) {
      const r = await sendReminder(o.id);
      if (r.sent) sent += 1;
      else {
        why = why ?? r.error ?? r.why ?? null;
        if (r.ownWhatsApp) own.push({ number: o.number, link: r.ownWhatsApp });
      }
    }
    setBusy(false);
    setFallback(own);
    setSaid(
      sent === reachable.length
        ? `${sent} reminder${sent === 1 ? "" : "s"} on the way.`
        : sent > 0
          ? `${sent} sent. The rest did not go: ${why ?? "try again in a moment."}`
          : (why ?? "None of them went. Try again in a moment.")
    );
    if (sent > 0) router.refresh();
  }

  const nothing = needs.overdue.length === 0 && needs.accepted.length === 0 && needs.drafts.length === 0;

  return (
    <section aria-labelledby="needs" className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <h2 id="needs" className="font-heading text-base font-bold text-ink-heading">
        Needs you today
      </h2>
      {nothing && <p className="text-sm text-neutral-600">Nothing is late, nothing accepted is waiting for an invoice, no drafts left unsent.</p>}

      {needs.overdue.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-danger-tint text-danger-ink">
              <Icon name="alert" size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold text-ink">
                {needs.overdue.length} invoice{needs.overdue.length === 1 ? "" : "s"} past the due date
              </span>
              <span className="text-xs text-neutral-600">
                {formatGHS(overdueTotal)} still owed
                {needs.overdue[0].customer ? `, the oldest ${needs.overdue[0].customer}'s` : ""}
              </span>
            </span>
          </div>
          {needs.overdue.slice(0, 4).map((o) => (
            <Link key={o.id} href={`/documents/${o.id}`} className="tap flex min-h-[40px] items-center justify-between gap-2 rounded-[10px] bg-neutral-100 px-3 text-[12.5px] hover:bg-teal-50">
              <span className="min-w-0 truncate">
                <span className="mono font-semibold text-ink">{o.number}</span>
                <span className="text-neutral-600"> · {o.customer ?? "No name"}</span>
              </span>
              <span className="num flex-none font-semibold text-danger-ink">{o.daysOverdue}d</span>
            </Link>
          ))}
          {reachable.length > 0 ? (
            <button type="button" onClick={remindAll} disabled={busy} className={`${primaryAction} min-h-[40px] justify-center disabled:opacity-60`}>
              <Icon name="send" size={15} />
              {busy ? "Sending the reminders..." : `Send ${reachable.length} reminder${reachable.length === 1 ? "" : "s"}`}
            </button>
          ) : (
            <p className="text-xs text-neutral-600">None of them has a WhatsApp number or email to remind.</p>
          )}
          {said && (
            <p role="status" className="text-xs font-semibold text-gold-700">
              {said}
            </p>
          )}
          {fallback.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-neutral-600">Send them from your own WhatsApp instead:</span>
              {fallback.map((f) => (
                <a key={f.link} href={f.link} target="_blank" rel="noopener noreferrer" className="tap flex min-h-[36px] items-center text-[12.5px] font-bold text-teal-dark underline">
                  Remind about {f.number}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {needs.accepted.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
          {needs.accepted.slice(0, 3).map((q) => (
            <div key={q.id} className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-teal-50 text-teal-700">
                <Icon name="check" size={16} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[13.5px] font-semibold text-ink">{q.customer ?? "A customer"} accepted {q.number}</span>
                <span className="text-xs text-neutral-600">{q.total !== null ? `${formatGHS(q.total)}, ` : ""}no invoice yet</span>
                <Link href={`/documents/${q.id}`} className={`${secondaryAction} min-h-[40px] self-start`}>
                  Make the invoice
                  <Icon name="chev" size={15} />
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}

      {needs.drafts.length > 0 && (
        <div className="flex items-start gap-2.5 border-t border-neutral-100 pt-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-neutral-100 text-neutral-600">
            <Icon name="file" size={16} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13.5px] font-semibold text-ink">
              {needs.drafts.length} draft{needs.drafts.length === 1 ? "" : "s"} not sent out
            </span>
            <Link href={`/documents/${needs.drafts[0].id}`} className="text-xs font-semibold text-teal-dark underline">
              Finish the {TYPE[needs.drafts[0].type] ?? "draft"}
              {needs.drafts[0].customer ? ` for ${needs.drafts[0].customer}` : ""}
            </Link>
          </span>
        </div>
      )}
    </section>
  );
}
