import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, secondaryAction } from "@/components/shell/Page";
import { StatusPill, Tag, Timeline, type Tone } from "@/components/shell/Parts";
import { Icon } from "@/components/shell/icons";
import { DocumentButtons, RecordPayment } from "@/components/documents/DocumentActions";
import RemindButton from "@/components/documents/RemindButton";
import { MODULES } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { formatGHS } from "@/lib/money";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";
import { loadDocumentDetail, methodLabel, typeLabel, type DocumentDetail } from "@/lib/documents/detail";

export const dynamic = "force-dynamic";

// One document (Modules M3): the document as the customer sees it, and
// beside it what has happened to it. For an invoice: what was paid, how, and
// by whom; what is left; the reminders; and the evidence trail, read from
// the records themselves.

const ACCRA = "Africa/Accra";
const longDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "long", year: "numeric" });
const shortWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// +233 24 555 0187 reads as the number people say: 024 555 0187.
const localPhone = (e164: string) =>
  e164.startsWith("+233") && e164.length === 13 ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;
const amount = (n: number) => n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SOURCE: Record<string, string> = {
  sale: "From a till sale",
  shop_order: "From a shop order",
  service_booking: "From a booking",
  project: "From a job",
};

function state(d: DocumentDetail): { text: string; tone: Tone } {
  if (!d.number) return { text: "Draft", tone: "mute" };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
  switch (d.status) {
    case "paid":
      return { text: "Paid in full", tone: "ok" };
    case "partially_paid":
      return { text: "Part paid", tone: "info" };
    case "credited":
      return { text: "Credited", tone: "mute" };
    case "refunded":
      return { text: "Refunded", tone: "mute" };
    case "cancelled":
      return { text: "Cancelled", tone: "mute" };
    case "accepted":
    case "approved":
      return { text: "Accepted", tone: "ok" };
    case "expired":
      return { text: "Expired", tone: "mute" };
  }
  if (d.type === "invoice" && d.dueDate && d.dueDate < today && d.amounts.outstanding > 0.005) {
    const days = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${d.dueDate}T00:00:00Z`).getTime()) / 864e5);
    return { text: `${days} day${days === 1 ? "" : "s"} overdue`, tone: days > 30 ? "bad" : "warn" };
  }
  if (d.status === "viewed" || d.views.first) return { text: "Seen by them", tone: "info" };
  return { text: d.type === "receipt" || d.type === "credit_note" ? "Issued" : "Sent", tone: "info" };
}

function dueText(d: DocumentDetail): { text: string; tone: Tone } | null {
  if (d.type !== "invoice" || !d.number || d.amounts.outstanding <= 0.005 || !d.dueDate) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
  const days = Math.round((new Date(`${d.dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 864e5);
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, tone: "bad" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "warn" };
}

export default async function DocumentPage({ params }: { params: { id: string } }) {
  await checkPageAccess("/documents");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return (
      <ModulePage identity={MODULES.documents}>
        <EmptyState title="Sign in to see this document." detail="We send a code to the WhatsApp number your business is set up with." />
      </ModulePage>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const d = await loadDocumentDetail(workspace.businessId, params.id).catch(() => null);
  if (!d) notFound();

  const st = state(d);
  const due = dueText(d);
  const isInvoice = d.type === "invoice";
  const open = isInvoice && Boolean(d.number) && d.amounts.outstanding > 0.005 && !["cancelled", "refunded", "credited"].includes(d.status);
  const paidPct = d.total > 0 ? Math.min(100, Math.round(((d.amounts.paid + d.amounts.credited) / d.total) * 100)) : 0;
  const first = (d.party.name ?? "the customer").split(/\s+/)[0];
  const reachable = d.party.kind === "customer" && Boolean(d.party.phone || d.party.email);
  const conversions = d.number ? (DOCUMENT_CONVERSIONS[d.type as DocumentType] ?? []).filter((c) => c === "invoice" || c === "proforma") : [];
  // A quotation already turned into an invoice is not offered again.
  const alreadyInvoiced = d.related.some((r) => r.relation === "became" && (r.type === "invoice" || r.type === "proforma"));
  const creditable = isInvoice && Boolean(d.number) && d.amounts.paid + d.amounts.credited < d.total - 0.005 && !["cancelled", "refunded"].includes(d.status);
  const name = d.branding.tradingName ?? d.businessName;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";

  return (
    <ModulePage identity={MODULES.documents} title={d.number ?? `${typeLabel(d.type)} draft`}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Link href="/documents" className={`${secondaryAction} min-h-[40px]`}>
                <Icon name="back" size={15} />
                All documents
              </Link>
              {d.sourceType && SOURCE[d.sourceType] && <Tag>{SOURCE[d.sourceType]}</Tag>}
              {d.paidInvoice && (
                <Link href={`/documents/${d.paidInvoice.id}`} className="tap">
                  <Tag>Paid against {d.paidInvoice.number}</Tag>
                </Link>
              )}
              {d.party.name && <Tag>{d.party.kind === "supplier" ? "Supplier" : "Customer"}: {d.party.name}</Tag>}
            </span>
            {d.number && (
              <a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noopener noreferrer" className={`${secondaryAction} min-h-[40px]`}>
                Download the PDF
              </a>
            )}
          </div>

          {/* The document, as the customer sees it. */}
          <article className="flex flex-col gap-6 rounded-[8px] bg-white px-5 py-7 text-[13px] text-ink shadow-[0_18px_40px_rgba(2,91,84,0.10)] sm:px-10 sm:py-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <span className="flex items-start gap-3">
                <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-teal font-heading text-[15px] font-extrabold text-white">
                  {initials}
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[15px]">{name}</strong>
                  {d.branding.addressLine && <span className="text-neutral-600">{d.branding.addressLine}</span>}
                  {d.branding.phone && <span className="text-neutral-600">{d.branding.phone}</span>}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="font-heading text-[22px] font-extrabold uppercase tracking-[0.04em]">{typeLabel(d.type)}</span>
                <strong className="mono">{d.number ?? "Draft, no number yet"}</strong>
                <StatusPill tone={st.tone}>{st.text}</StatusPill>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Fact label={d.party.kind === "supplier" ? "Order to" : "Bill to"} value={d.party.name ?? "No name given"} sub={d.party.phone ? localPhone(d.party.phone) : d.party.email ?? undefined} />
              <Fact label="Issued" value={d.issuedAt ? longDay(d.issuedAt) : "Not yet"} />
              {d.type === "quotation" ? (
                <Fact label="Good until" value={d.validUntil ? longDay(d.validUntil) : "No end date"} />
              ) : (
                <Fact label="Due" value={d.dueDate ? longDay(d.dueDate) : isInvoice ? "No date set" : "Not applicable"} />
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px] sm:text-[13px]">
                <thead>
                  <tr>
                    <th className="border-b-[1.5px] border-ink pb-2 text-left text-[11.5px] font-semibold">Description</th>
                    <th className="border-b-[1.5px] border-ink pb-2 text-center text-[11.5px] font-semibold">Qty</th>
                    <th className="border-b-[1.5px] border-ink pb-2 text-right text-[11.5px] font-semibold">Price</th>
                    <th className="border-b-[1.5px] border-ink pb-2 text-right text-[11.5px] font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border-b border-neutral-100 py-2.5">{l.description}</td>
                      <td className="num border-b border-neutral-100 text-center">{l.quantity}</td>
                      <td className="num border-b border-neutral-100 text-right">{amount(l.unitPrice)}</td>
                      <td className="num border-b border-neutral-100 text-right">{amount(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="flex w-full max-w-[280px] flex-col gap-1.5">
                <Row k="Subtotal" v={amount(d.subtotal)} />
                {d.taxTotal > 0 && <Row k="Tax" v={amount(d.taxTotal)} />}
                {isInvoice && d.amounts.paid > 0 && <Row k="Paid" v={`− ${amount(d.amounts.paid)}`} />}
                {isInvoice && d.amounts.credited > 0 && <Row k="Credited" v={`− ${amount(d.amounts.credited)}`} />}
                <span className="mt-1 flex justify-between border-t-[1.5px] border-ink pt-2 font-heading text-[17px] font-extrabold">
                  <span>{isInvoice && d.number ? "Balance due" : "Total"}</span>
                  <span className="num">GHS {amount(isInvoice && d.number ? d.amounts.outstanding : d.total)}</span>
                </span>
              </div>
            </div>
            {d.branding.footerNote && <p className="text-[11.5px] leading-relaxed text-neutral-600">{d.branding.footerNote}</p>}
          </article>
        </div>

        <div className="flex flex-col gap-4">
          {isInvoice && d.number && (
            <Card title="Payment" aside={due ? <StatusPill tone={due.tone}>{due.text}</StatusPill> : d.status === "paid" ? <StatusPill tone="ok">Paid</StatusPill> : undefined}>
              <div className="grid grid-cols-3 gap-2">
                <Tile label="Total" value={amount(d.total)} />
                <Tile label="Received" value={amount(d.amounts.paid)} tone="ok" />
                <Tile label="Balance" value={amount(d.amounts.outstanding)} />
              </div>
              <span aria-hidden className="flex h-2 overflow-hidden rounded-full bg-neutral-100">
                <span className="rounded-full bg-gradient-to-r from-teal-500 to-teal-700" style={{ width: `${paidPct}%` }} />
              </span>
              <div className="flex flex-col">
                <span className="pb-1 text-xs font-semibold text-neutral-600">Payments received</span>
                {d.payments.length === 0 ? (
                  <span className="border-t border-neutral-100 py-2.5 text-[13px] text-neutral-600">Nothing paid yet.</span>
                ) : (
                  d.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 border-t border-neutral-100 py-2.5">
                      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-teal-50 text-teal-700">
                        <Icon name="money" size={15} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="text-[13px] font-semibold text-ink">
                          {methodLabel(p.method)}
                          {p.reference ? <span className="font-normal text-neutral-600"> · {p.reference}</span> : null}
                        </span>
                        <span className="truncate text-xs text-neutral-600">
                          {shortWhen(p.at)} · {p.verification === "provider_confirmed" ? "confirmed by the provider" : `recorded by ${p.byName ?? "you"}`}
                          {p.receipt?.number ? (
                            <>
                              {" · "}
                              <Link href={`/documents/${p.receipt.id}`} className="font-semibold text-teal-dark underline">
                                {p.receipt.number}
                              </Link>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <strong className="num flex-none text-[13px] text-success-ink">{formatGHS(p.amount)}</strong>
                    </div>
                  ))
                )}
              </div>
              {open && (
                <div className="flex flex-col gap-2">
                  {reachable && <RemindButton documentId={d.id} primary label={`Remind ${first} to pay`} />}
                  <RecordPayment documentId={d.id} balance={d.amounts.outstanding} customerFirst={first} />
                </div>
              )}
              {d.status === "paid" && (
                <p className="flex items-center gap-2 rounded-panel bg-success-tint px-3 py-2.5 text-[13px] font-semibold text-success-ink">
                  <Icon name="check" size={16} />
                  Paid in full{d.payments.some((p) => p.receipt) ? ", with a receipt for each payment." : "."}
                </p>
              )}
            </Card>
          )}

          {isInvoice && d.number && (
            <Card title="Reminders">
              {d.reminders.length === 0 ? (
                <span className="text-[13px] text-neutral-600">None sent yet.</span>
              ) : (
                d.reminders.map((r) => (
                  <span key={r.sequence} className="flex items-center justify-between text-[13px]">
                    <span>Reminder {r.sequence}</span>
                    <StatusPill tone={r.status && ["failed", "blocked_no_balance", "blocked_no_consent"].includes(r.status) ? "bad" : "ok"}>
                      {r.status && ["failed", "blocked_no_balance", "blocked_no_consent"].includes(r.status) ? "Did not go" : `Sent ${shortWhen(r.sentAt)}`}
                    </StatusPill>
                  </span>
                ))
              )}
              <span className="text-xs leading-relaxed text-neutral-600">
                While it is overdue, Ascend reminds {first} once a week, six times at most. You can also send one now.
              </span>
            </Card>
          )}

          {(d.related.length > 0 || !d.number || (conversions.length > 0 && !alreadyInvoiced) || creditable) && (
            <Card title={d.number ? "Next steps and linked documents" : "This is a draft"}>
              {!d.number && <span className="text-[13px] text-neutral-600">It has no number yet and can still change. Sending it out fixes it.</span>}
              {d.related.map((r) => (
                <Link key={r.id} href={`/documents/${r.id}`} className="tap flex min-h-[40px] items-center justify-between gap-2 rounded-[10px] bg-neutral-100 px-3 text-[13px] hover:bg-teal-50">
                  <span className="min-w-0 truncate">
                    <span className="text-neutral-600">{r.relation === "came_from" ? "Made from " : r.type === "credit_note" ? "Credited by " : "Became "}</span>
                    <strong className="mono">{r.number ?? `${typeLabel(r.type).toLowerCase()} draft`}</strong>
                  </span>
                  {r.total !== null && <span className="num flex-none text-neutral-600">{formatGHS(Math.abs(r.total))}</span>}
                </Link>
              ))}
              <DocumentButtons documentId={d.id} issued={Boolean(d.number)} type={d.type} conversions={alreadyInvoiced ? [] : conversions} creditable={creditable} />
            </Card>
          )}

          <Card title="Evidence trail">
            <Timeline
              entries={d.trail.map((t) => ({
                id: t.id,
                title: t.title,
                detail: [shortWhen(t.at), t.detail].filter(Boolean).join(". "),
                tone: t.tone,
              }))}
            />
            <span className="text-xs leading-relaxed text-neutral-600">
              Read from the records themselves. Once issued, a document keeps its number and cannot be quietly changed.
            </span>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold text-ink-heading">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className="truncate">{value}</strong>
      {sub && <span className="truncate text-neutral-600">{sub}</span>}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between">
      <span className="text-neutral-600">{k}</span>
      <span className="num">{v}</span>
    </span>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <span className={`flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5 ${tone === "ok" ? "bg-success-tint" : "bg-neutral-100"}`}>
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className={`num font-heading text-[15px] ${tone === "ok" ? "text-success-ink" : "text-ink"}`}>{value}</strong>
    </span>
  );
}
