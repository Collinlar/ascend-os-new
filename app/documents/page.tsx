import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import DocumentWorkspace, {
  type DocumentRow,
} from "@/components/documents/DocumentWorkspace";

export const dynamic = "force-dynamic";

// Ascend Documents: the shared commercial document layer, and a standalone
// entry product. Drafts are editable; issued documents are the record.

async function load(): Promise<{
  businessId: string;
  documents: DocumentRow[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data } = await db
      .from("document")
      .select("id, type, status, number, total, currency_code, due_date, created_at, customer:customer_id(display_name)")
      .eq("business_id", membership.business_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      businessId: membership.business_id,
      documents: (data ?? []).map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        number: d.number,
        total: d.total === null ? null : Number(d.total),
        dueDate: d.due_date,
        createdAt: d.created_at,
        customerName:
          (d.customer as unknown as { display_name: string } | null)?.display_name ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export default async function Documents() {
  const data = await load();

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Your documents</h1>
          <p className="text-sm text-mid-grey">
            Quotes, invoices and receipts. Once you send one out, it keeps its
            number and cannot be quietly changed.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to see your documents.
          </p>
        ) : (
          <DocumentWorkspace businessId={data.businessId} documents={data.documents} />
        )}
      </div>
    </main>
  );
}
