import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";
import { formatGHS } from "@/lib/money";
import { lookUpDocumentLink, readTwice } from "@/lib/documents/customer-link";
import PayButton from "@/components/documents/PayButton";
import ReportProblem from "@/components/risk/ReportProblem";

export const dynamic = "force-dynamic";

// Customer view of an issued document, opened from a WhatsApp link with no
// account and no download (CHN-004, DOC-007).
//
// Everything shown comes from issued_snapshot, the frozen version. If the
// merchant later changes their catalogue, branding or the customer record,
// what the customer received still reads exactly as it did.

interface Snapshot {
  number: string;
  type: string;
  issued_at: string;
  total: number;
  subtotal: number;
  currency_code?: string;
  due_date: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

const METHOD: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank transfer",
  card: "Card",
  payment_link: "Pay link",
};

// Online payment is on only where the provider is set up. Until then the
// page says how to pay the business directly, never a button that fails.
const ONLINE_PAYMENTS = Boolean(process.env.PAYSTACK_SECRET_KEY);

const TYPE_LABEL: Record<string, string> = {
  quotation: "Quote",
  proforma: "Proforma invoice",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
};

type Loaded =
  | {
      state: "ready";
      businessName: string;
      status: string;
      snapshot: Snapshot;
      owed: { paid: number; credited: number; outstanding: number };
      /** Ascend has verified who runs the business (Modules M6b). */
      verified: boolean;
      customerName: string | null;
      /** How to reach the business, from its document branding. */
      businessPhone: string | null;
      receipts: Array<{ number: string; method: string; amount: number; at: string }>;
    }
  | { state: "gone" }
  | { state: "unreachable" };

// A link that does not exist, was revoked or expired is "gone". A database
// we could not reach is "unreachable", and says so, rather than telling the
// customer their invoice does not exist (lib/documents/customer-link.ts).
async function load(token: string): Promise<Loaded> {
  try {
    const link = await lookUpDocumentLink(token);
    if (link.state !== "ready") return { state: link.state };
    const access = link.access;
    const db = supabaseServer();

    const { data: doc, error: docError } = await readTwice(() =>
      db
        .from("document")
        .select("id, business_id, type, status, issued_snapshot, business:business_id(name, identity_verification), customer:customer_id(display_name)")
        .eq("id", access.document_id)
        .maybeSingle()
    );
    if (docError) return { state: "unreachable" };
    if (!doc?.issued_snapshot) return { state: "gone" };

    // Record that the customer opened it (DOC-008). Best effort: a failed
    // write must never stop the customer seeing their own document.
    void db
      .from("document_access_token")
      .update({
        view_count: (access.view_count ?? 0) + 1,
        first_viewed_at: new Date().toISOString(),
      })
      .eq("token_hash", hashAccessToken(token))
      .then(() => {});

    // What is still owed after payments, refunds and credit notes (0086).
    // Without it the page would show the face value, which is wrong for a
    // credited invoice, so a failure here is "unreachable" too.
    const { data: amounts, error: amountsError } = await readTwice(() =>
      db.rpc("document_amounts", { p_document: doc.id })
    );
    const row = Array.isArray(amounts) ? amounts[0] : null;
    if (amountsError || !row) return { state: "unreachable" };

    // What a customer needs beside the balance: who they are paying, how to
    // reach them, and a receipt for each payment already made. Read on their
    // own, so the document still opens if one of them does not.
    const [branding, pays] = await Promise.all([
      db.from("document_branding").select("phone").eq("business_id", doc.business_id as string).maybeSingle(),
      db
        .from("payment")
        .select("id, amount, method, occurred_at")
        .eq("source_entity_type", "document")
        .eq("source_entity_id", doc.id)
        .eq("status", "confirmed")
        .is("reversal_of", null)
        .order("occurred_at"),
    ]);
    const payRows = pays.data ?? [];
    const receiptNo = new Map<string, string>();
    if (payRows.length) {
      const { data: rc } = await db.from("document").select("number, payment_id").in("payment_id", payRows.map((p) => p.id as string));
      for (const r of rc ?? []) if (r.number) receiptNo.set(r.payment_id as string, r.number as string);
    }
    const business = doc.business as unknown as { name: string; identity_verification: string | null } | null;

    return {
      state: "ready",
      businessName: business?.name ?? "The business",
      status: doc.status as string,
      snapshot: doc.issued_snapshot as unknown as Snapshot,
      owed: { paid: Number(row.paid), credited: Number(row.credited), outstanding: Number(row.outstanding) },
      verified: business?.identity_verification === "verified",
      customerName: (doc.customer as unknown as { display_name: string | null } | null)?.display_name ?? null,
      businessPhone: (branding.data?.phone as string | null) ?? null,
      receipts: payRows.map((p) => ({
        number: receiptNo.get(p.id as string) ?? "",
        method: METHOD[p.method as string] ?? (p.method as string),
        amount: Number(p.amount),
        at: p.occurred_at as string,
      })),
    };
  } catch {
    return { state: "unreachable" };
  }
}

function Unreachable({ token }: { token: string }) {
  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-lg rounded-[24px] border border-line-brand bg-white px-6 py-8 shadow-[0_18px_40px_rgba(2,60,55,0.06)] sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">We could not open this just now</p>
        <h1 className="mt-1.5 font-heading text-[22px] font-extrabold text-ink-heading">
          The connection dropped for a moment.
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          Nothing is wrong with your document or your link. Give it a few seconds and open it
          again.
        </p>
        <a
          href={`/d/${token}`}
          className="tap mt-6 flex h-12 items-center justify-center rounded-control bg-teal text-[15px] font-bold text-white hover:bg-teal-hover"
        >
          Open it again
        </a>
      </div>
    </main>
  );
}

export default async function CustomerDocument({
  params,
}: {
  params: { token: string };
}) {
  const data = await load(params.token);
  if (data.state === "gone") notFound();
  if (data.state === "unreachable") return <Unreachable token={params.token} />;

  const { snapshot, businessName, status, owed, verified, customerName, businessPhone, receipts } = data;
  const toPay = owed.outstanding;
  const label = TYPE_LABEL[snapshot.type] ?? snapshot.type;
  const isBill = snapshot.type === "invoice" || snapshot.type === "proforma";
  const paidInFull = snapshot.type === "receipt" || status === "paid" || (isBill && toPay <= 0.005 && owed.paid > 0);
  const longDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "long", year: "numeric" });
  const initials = businessName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";
  const pill =
    paidInFull ? { text: "Paid in full", cls: "bg-success-tint text-success-ink" }
    : status === "credited" ? { text: "Credited", cls: "bg-neutral-100 text-neutral-700" }
    : owed.paid > 0.005 && isBill ? { text: "Part paid", cls: "bg-info-light text-info-ink" }
    : null;
  const whatsapp = businessPhone ? `https://wa.me/${businessPhone.replace(/[^\d]/g, "").replace(/^0/, "233")}?text=${encodeURIComponent(`Hello, about ${label.toLowerCase()} ${snapshot.number}.`)}` : null;

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:py-8">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {/* Who this is from, and whether Ascend has checked them. */}
        <div className="flex items-center gap-3 px-1">
          <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-teal font-heading text-[15px] font-extrabold text-white">
            {initials}
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="truncate font-heading text-[17px] text-ink-heading">{businessName}</strong>
            {verified ? (
              <span className="flex items-center gap-1 text-[12.5px] font-semibold text-teal-800">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Verified business
              </span>
            ) : (
              <span className="text-[12.5px] text-neutral-600">Sent through AscendSME</span>
            )}
          </span>
        </div>

        <div className="rounded-[24px] border border-line-brand bg-white px-5 py-6 shadow-[0_18px_40px_rgba(2,60,55,0.06)] sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-neutral-600">
              {label} <span className="mono font-medium text-ink">{snapshot.number}</span>
            </span>
            {pill && <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${pill.cls}`}>{pill.text}</span>}
          </div>

          {isBill && !paidInFull && status !== "credited" ? (
            <div className="mt-4 flex flex-col gap-1">
              <span className="text-[13px] text-neutral-600">Balance to pay</span>
              <span className="num font-heading text-[36px] font-extrabold leading-none tracking-[-0.02em] text-ink-heading">{formatGHS(toPay)}</span>
              <span className="text-[13px] text-neutral-600">
                {[snapshot.due_date ? `Due ${longDay(snapshot.due_date)}` : null, customerName ? `for ${customerName}` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-1">
              <span className="text-[13px] text-neutral-600">{paidInFull ? "Paid, thank you" : "Total"}</span>
              <span className="num font-heading text-[36px] font-extrabold leading-none tracking-[-0.02em] text-ink-heading">{formatGHS(snapshot.total)}</span>
              <span className="text-[13px] text-neutral-600">{longDay(snapshot.issued_at)}{customerName ? ` · for ${customerName}` : ""}</span>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-1.5 border-t border-neutral-100 pt-4 text-[14px]">
            {(snapshot.lines ?? []).slice(0, 3).map((line, i) => (
              <span key={i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-neutral-600">
                  {line.description}
                  {line.quantity !== 1 ? ` × ${line.quantity}` : ""}
                </span>
                <span className="num text-ink">{formatGHS(line.line_total)}</span>
              </span>
            ))}
            {(snapshot.lines ?? []).length > 3 && (
              <span className="text-[13px] text-neutral-600">And {(snapshot.lines ?? []).length - 3} more</span>
            )}
            {isBill && owed.paid > 0.005 && (
              <span className="flex justify-between gap-3">
                <span className="text-neutral-600">Already paid</span>
                <span className="num text-ink">− {formatGHS(owed.paid)}</span>
              </span>
            )}
            {isBill && owed.credited > 0.005 && (
              <span className="flex justify-between gap-3">
                <span className="text-neutral-600">Credited by {businessName}</span>
                <span className="num text-ink">− {formatGHS(owed.credited)}</span>
              </span>
            )}
          </div>

          {/* The whole document, for anyone who wants to check it line by line. */}
          <details className="mt-4">
            <summary className="tap flex min-h-[44px] cursor-pointer list-none items-center text-[14px] font-bold text-teal-dark">See the full {label.toLowerCase()}</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-neutral-600">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(snapshot.lines ?? []).map((line, i) => (
                  <tr key={i} className="border-b border-neutral-200">
                    <td className="py-3 text-ink">{line.description}</td>
                    <td className="py-3 text-right text-neutral-600">{line.quantity}</td>
                    <td className="num py-3 text-right font-semibold text-ink">{formatGHS(line.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex justify-between text-[15px] font-bold text-ink-heading">
              <span>Total</span>
              <span className="num">{formatGHS(snapshot.total)}</span>
            </p>
            <p className="mt-1 text-[13px] text-neutral-600">Issued {longDay(snapshot.issued_at)}</p>
          </details>
        </div>

        {receipts.length > 0 && (
          <div className="rounded-[20px] border border-line-brand bg-white px-5 py-4">
            <p className="font-heading text-[15px] font-bold text-ink-heading">{paidInFull ? "How it was paid" : "Paid so far"}</p>
            {receipts.map((r, i) => (
              <span key={i} className="mt-2 flex justify-between gap-3 text-[13.5px]">
                <span className="text-neutral-600">
                  {r.method}, {longDay(r.at)}
                  {r.number ? ` · receipt ${r.number}` : ""}
                </span>
                <span className="num font-semibold text-ink">{formatGHS(r.amount)}</span>
              </span>
            ))}
          </div>
        )}

        {status === "credited" && (
          <p className="rounded-control bg-teal-50 px-4 py-3 text-[14px] font-semibold text-teal-800">
            {businessName} has credited this in full. Nothing is owed.
          </p>
        )}

        {isBill && !paidInFull && status !== "credited" && toPay > 0.005 && (
          ONLINE_PAYMENTS && owed.paid <= 0.005 ? (
            <PayButton token={params.token} amount={toPay} />
          ) : (
            <div className="rounded-[20px] border border-line-brand bg-white px-5 py-4">
              <p className="font-heading text-[15px] font-bold text-ink-heading">How to pay</p>
              <p className="mt-1 text-[14px] leading-relaxed text-neutral-700">
                Pay {businessName} directly, by Mobile Money, cash or transfer. They record it, and this page shows it as paid with your receipt.
              </p>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="tap mt-3 flex h-12 items-center justify-center rounded-control bg-teal text-[15px] font-bold text-white hover:bg-teal-hover">
                  Ask {businessName} how to pay
                </a>
              )}
            </div>
          )
        )}

        {/* A customer needs a copy they can keep, forward to a bank, or
            show at a counter. The same link authorises it, so there is
            nothing to sign in to. */}
        <a
          href={`/d/${params.token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap mt-6 flex h-12 items-center justify-center rounded-control border-[1.5px] border-line-brand text-[14.5px] font-bold text-teal-800 hover:bg-teal-50"
        >
          Save a copy
        </a>

        <ReportProblem source="invoice" token={params.token} businessName={businessName} />

        <p className="mt-2 text-center text-xs text-neutral-600">
          Sent through AscendSME. Ascend never holds your money.
        </p>
      </div>
    </main>
  );
}
