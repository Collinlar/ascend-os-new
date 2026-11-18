import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import DocumentWorkspace, {
  type CatalogueOption,
  type DocumentRow,
  type OwedSummary,
} from "@/components/documents/DocumentWorkspace";
import BrandingPanel, { type Branding } from "@/components/documents/BrandingPanel";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Ascend Documents: the shared commercial document layer, and a standalone
// entry product. Drafts are editable; issued documents are the record.

async function load(): Promise<{
  businessId: string;
  owed: OwedSummary;
  documents: DocumentRow[];
  catalogue: CatalogueOption[];
  branding: Branding | null;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    // The catalogue the merchant already keeps. Loaded with the page rather
    // than searched over the network, because a Ghanaian SME's list is
    // small enough to hold and a picker that waits on a request every
    // keystroke is a picker nobody uses on a slow connection.
    const [{ data }, { data: items }, { data: brand }, { data: owed }] = await Promise.all([
      db
        .from("document")
        .select("id, type, status, number, total, currency_code, due_date, created_at, issued_at, customer:customer_id(display_name), supplier:supplier_id(name)")
        .eq("business_id", membership.business_id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("catalogue_item")
        .select("id, name, kind, base_price")
        .eq("business_id", membership.business_id)
        .eq("active", true)
        .order("name")
        .limit(300),
      db
        .from("document_branding")
        .select("trading_name, address_line, phone, footer_note, accent_colour")
        .eq("business_id", membership.business_id)
        .maybeSingle(),
      // What is really still owed on each invoice, after payments and
      // credits (Financial Foundation, 0102), not its face value.
      db.rpc("receivables_aging", { p_business: membership.business_id }),
    ]);
    const outstandingBy = new Map<string, number>();
    const summary = { total: 0, count: 0, overdueCount: 0, overdueTotal: 0 };
    for (const r of (owed ?? []) as Array<{ document_number: string | null; origin_type: string; outstanding: number; days_overdue: number | null }>) {
      if (r.document_number) outstandingBy.set(r.document_number, (outstandingBy.get(r.document_number) ?? 0) + Number(r.outstanding));
      if (r.origin_type !== "document") continue;
      summary.total += Number(r.outstanding);
      summary.count += 1;
      if ((r.days_overdue ?? 0) > 0) {
        summary.overdueCount += 1;
        summary.overdueTotal += Number(r.outstanding);
      }
    }

    return {
      businessId: membership.business_id,
      owed: summary,
      branding: brand
        ? {
            tradingName: brand.trading_name,
            addressLine: brand.address_line,
            phone: brand.phone,
            footerNote: brand.footer_note,
            accentColour: brand.accent_colour,
          }
        : null,
      catalogue: (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        kind: i.kind,
        basePrice: i.base_price === null ? null : Number(i.base_price),
      })),
      documents: (data ?? []).map((d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        number: d.number,
        total: d.total === null ? null : Number(d.total),
        dueDate: d.due_date,
        createdAt: d.created_at,
        issuedAt: (d.issued_at as string | null) ?? null,
        outstanding: d.number ? outstandingBy.get(d.number) ?? null : null,
        // A purchase order names the supplier it went to. Same column on
        // the row, because from the merchant's side both answer "who".
        customerName:
          (d.supplier as unknown as { name: string } | null)?.name ??
          (d.customer as unknown as { display_name: string } | null)?.display_name ??
          null,
      })),
    };
  } catch {
    return null;
  }
}

export default async function Documents() {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/documents");

  const data = await load();

  return (
    <PageShell>
      <PageHeader
        title="Documents"
        intro="Quotations, invoices and receipts. Once one is sent out it keeps its number and cannot be quietly changed."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to see your documents."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <>
          <BrandingPanel businessId={data.businessId} branding={data.branding} />
          <DocumentWorkspace
            businessId={data.businessId}
            documents={data.documents}
            catalogue={data.catalogue}
            owed={data.owed}
          />
        </>
      )}
    </PageShell>
  );
}
