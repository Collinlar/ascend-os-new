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
      "id, business_id, customer_id, type, status, number, currency_code, subtotal, tax_total, total, lines, branding, issued_at, due_date, issued_snapshot, reason, business:business_id(name), customer:customer_id(display_name, phone_e164, organisation_name), supplier:supplier_id(name, phone_e164)"
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
  const supplier = doc.supplier as unknown as {
    name: string;
    phone_e164: string | null;
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

  // Branding is read from the frozen snapshot for an issued document, so a
  // business that rebrands next year does not silently repaint the
  // invoices it already sent. A draft has no snapshot, so it shows what the
  // business looks like today.
  const snapshotBranding = (snapshot?.branding ?? null) as Record<string, unknown> | null;
  let branding = snapshotBranding;
  if (!branding || Object.keys(branding).length === 0) {
    const live = await liveLook(doc.business_id);
    // A draft shows today's look with the note written on it (Modules R1).
    const own = (doc.branding ?? {}) as Record<string, unknown>;
    branding = { ...(live ?? {}), ...(own.note ? { note: own.note } : {}) };
  }

  const address =
    (branding?.address_line as string) ||
    [location?.address, location?.city].filter(Boolean).join(", ");

  const pdfDoc: PdfDocument = {
    type: doc.type,
    number: (snapshot?.number as string) ?? doc.number,
    issuedAt: (snapshot?.issued_at as string) ?? doc.issued_at,
    dueDate: (snapshot?.due_date as string) ?? doc.due_date,
    currencyCode: (snapshot?.currency_code as string) ?? doc.currency_code ?? "GHS",
    businessName: (branding?.trading_name as string) || business?.name || "",
    businessAddress: address || null,
    businessPhone: (branding?.phone as string) ?? null,
    // On a purchase order the party is the supplier the business is
    // ordering from, so that is whose name belongs in the address block.
    customerName:
      supplier?.name ?? customer?.organisation_name ?? customer?.display_name ?? null,
    customerPhone: supplier?.phone_e164 ?? customer?.phone_e164 ?? null,
    lines: toLines(snapshot?.lines ?? doc.lines),
    subtotal: Number(snapshot?.subtotal ?? doc.subtotal ?? 0),
    taxTotal: Number(snapshot?.tax_total ?? doc.tax_total ?? 0),
    total: Number(snapshot?.total ?? doc.total ?? 0),
    amountPaid: showsPayment ? paid : null,
    status: doc.status,
    reason: doc.reason,
    footerNote: (branding?.footer_note as string) ?? null,
    note: (branding?.note as string) ?? null,
    accentColour: (branding?.accent_colour as string) ?? null,
    template: lookTemplate(branding?.template),
    businessEmail: (branding?.email as string) ?? null,
    tin: (branding?.tin as string) ?? null,
    logo: await fetchLogo((branding?.logo_url as string) ?? null),
    signatureAreas: branding?.signature_areas === false ? false : true,
    verifyUrl: options.verifyUrl ?? null,
  };

  return {
    bytes: renderDocumentPdf(pdfDoc),
    filename: `${(pdfDoc.number ?? pdfDoc.type).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`,
  };
}

/** The look's columns as stored, for drafts and samples. */
export async function liveLook(businessId: string): Promise<Record<string, unknown> | null> {
  const db = supabaseServer();
  const full = await db
    .from("document_branding")
    .select("trading_name, address_line, phone, email, tin, footer_note, accent_colour, template, logo_url, signature_areas")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!full.error) return (full.data ?? null) as Record<string, unknown> | null;
  // Before 0142 the look's newer columns do not exist yet.
  const { data } = await db
    .from("document_branding")
    .select("trading_name, address_line, phone, email, footer_note, accent_colour")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data ?? null) as Record<string, unknown> | null;
}

export function lookTemplate(value: unknown): "classic" | "modern" | "compact" {
  return value === "modern" || value === "compact" ? value : "classic";
}

// A logo is only ever read from Ascend's own storage, never from an address
// a request could supply, and a slow or missing one leaves the logo off
// rather than holding the document up.
export async function fetchLogo(url: string | null): Promise<Uint8Array | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength < 600_000 ? bytes : null;
  } catch {
    return null;
  }
}
