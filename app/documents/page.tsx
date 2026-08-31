import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
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
    <PageShell>
      <PageHeader
        title="Your documents"
        intro="Invoices, receipts and statements, kept where a bank or a buyer can check them. Once you send one out it keeps its number and cannot be quietly changed."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to see your documents."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <DocumentWorkspace businessId={data.businessId} documents={data.documents} />
      )}
    </PageShell>
  );
}
