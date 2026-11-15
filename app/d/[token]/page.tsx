import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";
import { formatGHS } from "@/lib/money";
import { lookUpDocumentLink, readTwice } from "@/lib/documents/customer-link";
import PayButton from "@/components/documents/PayButton";

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
      owed: { credited: number; outstanding: number };
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
        .select("id, type, status, issued_snapshot, business:business_id(name)")
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

    return {
      state: "ready",
      businessName:
        (doc.business as unknown as { name: string } | null)?.name ?? "The business",
      status: doc.status as string,
      snapshot: doc.issued_snapshot as unknown as Snapshot,
      owed: { credited: Number(row.credited), outstanding: Number(row.outstanding) },
    };
  } catch {
    return { state: "unreachable" };
  }
}

function Unreachable({ token }: { token: string }) {
  return (
    <main className="min-h-screen bg-light-grey py-8">
      <div className="mx-auto max-w-lg bg-white px-6 py-8">
        <p className="text-sm text-ink-muted">We could not open this just now</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">
          The connection dropped for a moment.
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Nothing is wrong with your document or your link. Give it a few seconds and open it
          again.
        </p>
        <a
          href={`/d/${token}`}
          className="tap mt-6 flex items-center justify-center bg-teal text-sm font-semibold text-white hover:bg-teal-dark"
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

  const { snapshot, businessName, status, owed } = data;
  const toPay = owed.outstanding;
  const label = TYPE_LABEL[snapshot.type] ?? snapshot.type;

  return (
    <main className="min-h-screen bg-light-grey py-8">
      <div className="mx-auto max-w-lg bg-white px-6 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-ink-muted">{label}</p>
            <h1 className="text-xl font-semibold text-ink">{businessName}</h1>
          </div>
          <p className="text-sm font-medium text-ink">{snapshot.number}</p>
        </div>

        <p className="mt-1 text-sm text-ink-muted">
          {new Date(snapshot.issued_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {snapshot.due_date && ` · due ${new Date(snapshot.due_date).toLocaleDateString("en-GB")}`}
        </p>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(snapshot.lines ?? []).map((line, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-3 text-ink">{line.description}</td>
                <td className="py-3 text-right text-ink-muted">{line.quantity}</td>
                <td className="py-3 text-right text-ink">{formatGHS(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex items-baseline justify-between">
          <p className="font-medium text-ink">Total</p>
          <p className="text-2xl font-semibold text-ink">{formatGHS(snapshot.total)}</p>
        </div>

        {snapshot.type === "receipt" || status === "paid" ? (
          <p className="mt-6 bg-teal-light px-4 py-3 text-sm text-teal-dark">
            Paid. Thank you.
          </p>
        ) : status === "credited" ? (
          <p className="mt-6 bg-teal-light px-4 py-3 text-sm text-teal-dark">
            {businessName} has credited this in full. Nothing is owed.
          </p>
        ) : status === "partially_paid" ? (
          <p className="mt-6 bg-gold-light px-4 py-3 text-sm text-gold-ink">
            Part of this has been paid
            {owed.outstanding > 0 ? `, and ${formatGHS(owed.outstanding)} is still owed` : ""}.
            {" "}Talk to {businessName} about the balance.
          </p>
        ) : toPay > 0 ? (
          <>
            {owed.credited > 0 && (
              <p className="mt-6 bg-info-light px-4 py-3 text-sm text-ink">
                {businessName} has credited {formatGHS(owed.credited)} against this.
                You owe {formatGHS(owed.outstanding)}.
              </p>
            )}
            <PayButton token={params.token} amount={toPay} />
          </>
        ) : null}

        {/* A customer needs a copy they can keep, forward to a bank, or
            show at a counter. The same link authorises it, so there is
            nothing to sign in to. */}
        <a
          href={`/d/${params.token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap mt-6 flex items-center justify-center border border-line text-sm font-semibold text-ink hover:bg-light-grey"
        >
          Save a copy
        </a>

        <p className="mt-8 text-center text-xs text-ink-muted">
          Sent through AscendSME
        </p>
      </div>
    </main>
  );
}
