import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, primaryAction, secondaryAction } from "@/components/shell/Page";
import { ModulePage } from "@/components/shell/Module";
import { Icon } from "@/components/shell/icons";
import { MODULES } from "@/lib/nav/modules";
import type { DocumentType } from "@/lib/domains/types";
import { formatGHS } from "@/lib/money";
import DocumentWorkspace, { type CatalogueOption } from "@/components/documents/DocumentWorkspace";
import BrandingPanel, { type Branding } from "@/components/documents/BrandingPanel";
import NeedsYouToday from "@/components/documents/NeedsYouToday";
import { loadDocumentsWorkspace, type DocFigures, type ListDoc, type NeedsYou } from "@/lib/documents/workspace";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Ascend Documents (Modules M3): the shared commercial document layer, and a
// standalone entry product. Every document with where it came from and what
// is left on it; the four figures; what needs the owner today; and the
// documents Ascend can make. Drafts are editable; issued documents are the
// record.

async function load(): Promise<{
  businessId: string;
  docs: ListDoc[];
  figures: DocFigures;
  needs: NeedsYou;
  catalogue: CatalogueOption[];
  branding: Branding | null;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;
    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    // The catalogue the merchant already keeps, loaded with the page: a
    // Ghanaian SME's list is small enough to hold, and a picker that waits on
    // the network every keystroke is a picker nobody uses.
    const [ws, { data: items }, { data: brand }] = await Promise.all([
      loadDocumentsWorkspace(membership.business_id),
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
    ]);

    return {
      businessId: membership.business_id,
      ...ws,
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
    };
  } catch {
    return null;
  }
}

// What "New ..." in the module bar, or the Create grid, may open.
const NEW_TYPES = new Set(["invoice", "quotation", "receipt", "purchase_order"]);

const CREATE: Array<[DocumentType, string]> = [
  ["quotation", "Quotation"],
  ["invoice", "Invoice"],
  ["receipt", "Receipt"],
  ["purchase_order", "Purchase order"],
];

export default async function Documents({
  searchParams,
}: {
  searchParams: { q?: string; new?: string };
}) {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/documents");

  const data = await load();
  const query = (searchParams.q ?? "").trim();
  const f = data?.figures;
  const monthName = new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Accra", month: "long" });

  return (
    <ModulePage
      identity={MODULES.documents}
      search={
        data && data.docs.length > 0
          ? { action: "/documents", placeholder: "Search by number, name or where it came from", defaultValue: query }
          : undefined
      }
      action={
        data ? (
          <>
            <Link href="/documents?new=quotation" className={secondaryAction}>
              New quotation
            </Link>
            <Link href="/documents?new=invoice" className={primaryAction}>
              <Icon name="plus" size={16} />
              New invoice
            </Link>
          </>
        ) : undefined
      }
    >
      {data === null || !f ? (
        <EmptyState
          title="Sign in to see your documents."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label="Outstanding"
              value={formatGHS(f.outstanding)}
              sub={f.openCount ? `${f.openCount} open invoice${f.openCount === 1 ? "" : "s"}` : "Nothing owed to you"}
            />
            <Figure
              label="Overdue"
              value={formatGHS(f.overdue)}
              sub={f.overdueCount ? `${f.overdueCount} invoice${f.overdueCount === 1 ? "" : "s"}, oldest ${f.oldestOverdueDays} day${f.oldestOverdueDays === 1 ? "" : "s"}` : "None past the due date"}
              tone={f.overdueCount ? "bad" : undefined}
            />
            <Figure
              label={`Collected in ${monthName}`}
              value={formatGHS(f.collectedThisMonth)}
              sub={
                f.paymentsThisMonth === 0
                  ? "No payments on documents yet"
                  : f.viaPayLinks > 0
                    ? `${f.viaPayLinks}% through pay links`
                    : `${f.paymentsThisMonth} payment${f.paymentsThisMonth === 1 ? "" : "s"}`
              }
            />
            <Figure
              label="Average days to payment"
              value={f.avgDaysToPay === null ? "Not yet" : `${f.avgDaysToPay} day${f.avgDaysToPay === 1 ? "" : "s"}`}
              sub={f.avgDaysToPay === null ? "Once an invoice is paid in full" : `Over ${f.paidInvoices90} invoice${f.paidInvoices90 === 1 ? "" : "s"}, last 90 days`}
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <DocumentWorkspace
                businessId={data.businessId}
                documents={data.docs}
                catalogue={data.catalogue}
                query={query}
                startCreating={NEW_TYPES.has(searchParams.new ?? "") ? (searchParams.new as DocumentType) : null}
              />
            </div>
            <div className="flex flex-col gap-4">
              <NeedsYouToday needs={data.needs} />
              <section className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <h2 className="font-heading text-base font-bold text-ink-heading">Make a document</h2>
                <div className="grid grid-cols-2 gap-2">
                  {CREATE.map(([t, label]) => (
                    <Link
                      key={t}
                      href={`/documents?new=${t}`}
                      className="tap flex min-h-[44px] items-center justify-center rounded-control border border-neutral-200 px-2 text-center text-[13px] font-semibold text-neutral-700 hover:border-teal-brand"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                <span className="text-xs leading-relaxed text-neutral-600">
                  Customers, products and prices fill in from what Ascend already has. A credit note starts from its invoice.
                </span>
              </section>
              <BrandingPanel businessId={data.businessId} branding={data.branding} />
            </div>
          </div>
        </div>
      )}
    </ModulePage>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className={`num font-heading text-[22px] font-extrabold ${tone === "bad" ? "text-danger-ink" : "text-ink-heading"}`}>{value}</span>
      <span className={`text-xs ${tone === "bad" ? "text-danger-ink" : "text-neutral-600"}`}>{sub}</span>
    </div>
  );
}
