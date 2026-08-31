import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";
import { formatGHS } from "@/lib/money";
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

async function load(token: string) {
  try {
    const db = supabaseServer();
    const { data: access } = await db
      .from("document_access_token")
      .select("document_id, business_id, expires_at, revoked_at, view_count")
      .eq("token_hash", hashAccessToken(token))
      .maybeSingle();

    if (!access || access.revoked_at) return null;
    if (access.expires_at && new Date(access.expires_at) < new Date()) return null;

    const { data: doc } = await db
      .from("document")
      .select("id, type, status, issued_snapshot, business:business_id(name)")
      .eq("id", access.document_id)
      .maybeSingle();
    if (!doc?.issued_snapshot) return null;

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

    return {
      businessName:
        (doc.business as unknown as { name: string } | null)?.name ?? "The business",
      status: doc.status as string,
      snapshot: doc.issued_snapshot as unknown as Snapshot,
    };
  } catch {
    return null;
  }
}

export default async function CustomerDocument({
  params,
}: {
  params: { token: string };
}) {
  const data = await load(params.token);
  if (!data) notFound();

  const { snapshot, businessName, status } = data;
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
        ) : status === "partially_paid" ? (
          <p className="mt-6 bg-gold-light px-4 py-3 text-sm text-gold-ink">
            Part of this has been paid. Talk to {businessName} about the balance.
          </p>
        ) : (
          <PayButton token={params.token} amount={snapshot.total} />
        )}

        <p className="mt-8 text-center text-xs text-ink-muted">
          Sent through AscendSME
        </p>
      </div>
    </main>
  );
}
