import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import NewDocument, { type NewType } from "@/components/documents/NewDocument";
import { MODULES } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { loadNewDocument } from "@/lib/documents/new";

export const dynamic = "force-dynamic";

// New document (round 2, R1): pick the kind, start from a sale, booking,
// Shop order or a past document, pick the customer, add what is sold, set
// the dates, and see what the customer receives before it goes.

const TYPES: NewType[] = ["quotation", "invoice", "proforma", "receipt", "purchase_order", "delivery_note", "credit_note"];
const FROM = new Set(["sale", "shop_order", "service_booking", "invoice", "copy"]);

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: { type?: string; from?: string; customer?: string };
}) {
  await checkPageAccess("/documents");
  const workspace = await currentWorkspace().catch(() => null);
  const data = workspace ? await loadNewDocument(workspace.businessId).catch(() => null) : null;

  // ?from=sale:<id> fills the form from that sale; the page checks it is
  // one of this business's own before using it.
  const [fromKind, fromId] = (searchParams.from ?? "").split(":");
  const from = FROM.has(fromKind) && /^[0-9a-f-]{36}$/i.test(fromId ?? "") ? { kind: fromKind, id: fromId } : null;
  const type = TYPES.includes(searchParams.type as NewType) ? (searchParams.type as NewType) : "invoice";

  return (
    <ModulePage identity={MODULES.documents} title="New document">
      {data === null ? (
        <EmptyState
          title="Sign in to make a document."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <NewDocument
          data={data}
          initialType={type}
          initialFrom={from}
          initialCustomer={/^[0-9a-f-]{36}$/i.test(searchParams.customer ?? "") ? searchParams.customer! : null}
        />
      )}
    </ModulePage>
  );
}
