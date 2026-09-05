import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { renderDocumentPdf, type PdfDocument, type PdfLine } from "./pdf";

// Turns a stored document into the bytes a customer can keep.
//
// The source of truth is issued_snapshot, not the live row. That is the
// entire point of freezing it at issue: what the customer received must
// still be what they see months later, even if the catalogue was repriced,
// the branding changed or the customer record was corrected (DOC-004,
// DOC-AUD-*). A draft has no snapshot yet, so it renders from the live row
// and says so on its face.

interface SnapshotLine {
  description?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
}

function toLines(raw: unknown): PdfLine[] {
  if (!Array.isArray(raw)) return [];
  return (raw as SnapshotLine[]).map((l) => ({
    description: l.description ?? "",
    quantity: Number(l.quantity ?? 0),
    unitPrice: Number(l.unit_price ?? 0),
    lineTotal: Number(l.line_total ?? 0),
  }));
}

export async function buildDocumentPdf(
  documentId: string,
  options: { verifyUrl?: string | null } = {}
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const db = supabaseServer();

  const { data: doc } = await db
    .from("document")
    // One literal, deliberately: supabase-js infers the row type from the
    // select string, and a concatenated one is just `string` to the
    // compiler, which loses every column type.
    .select(
      "id, business_id, customer_id, type, status, number, currency_code, subtotal, tax_total, total, lines, issued_at, due_date, issued_snapshot, reason, business:business_id(name), customer:customer_id(display_name, phone_e164, organisation_name)"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return null;

  const snapshot = doc.issued_snapshot as Record<string, unknown> | null;
  const business = doc.business as unknown as { name: string } | null;
  const customer = doc.customer as unknown as {
    display_name: string;
    phone_e164: string | null;
    organisation_name: string | null;
  } | null;

  // Where the business trades, for the letterhead. The first active
  // location is the one a customer would recognise.
  const { data: location } = await db
    .from("location")
    .select("address, city")
    .eq("business_id", doc.business_id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  // What has actually been paid against this document, so an invoice can
  // show a balance rather than only a total.
  const { data: payments } = await db
    .from("payment")
    .select("amount")
    .eq("source_entity_type", "document")
    .eq("source_entity_id", doc.id)
    .eq("status", "confirmed");

  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Only an invoice carries a balance. A receipt is the acknowledgement of
  // a payment that already happened, so printing "Balance due" on one is
  // nonsense, and doubly so for a POS receipt, whose payment is recorded
  // against the sale rather than against this document and would read as
  // nothing paid at all.
  const showsPayment = doc.type === "invoice";

  const address = [location?.address, location?.city].filter(Boolean).join(", ");

  const pdfDoc: PdfDocument = {
    type: doc.type,
    number: (snapshot?.number as string) ?? doc.number,
    issuedAt: (snapshot?.issued_at as string) ?? doc.issued_at,
    dueDate: (snapshot?.due_date as string) ?? doc.due_date,
    currencyCode: (snapshot?.currency_code as string) ?? doc.currency_code ?? "GHS",
    businessName: business?.name ?? "",
    businessAddress: address || null,
    businessPhone: null,
    customerName: customer?.organisation_name || customer?.display_name || null,
    customerPhone: customer?.phone_e164 ?? null,
    lines: toLines(snapshot?.lines ?? doc.lines),
    subtotal: Number(snapshot?.subtotal ?? doc.subtotal ?? 0),
    taxTotal: Number(snapshot?.tax_total ?? doc.tax_total ?? 0),
    total: Number(snapshot?.total ?? doc.total ?? 0),
    amountPaid: showsPayment ? paid : null,
    status: doc.status,
    reason: doc.reason,
    verifyUrl: options.verifyUrl ?? null,
  };

  return {
    bytes: renderDocumentPdf(pdfDoc),
    filename: `${(pdfDoc.number ?? pdfDoc.type).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`,
  };
}
