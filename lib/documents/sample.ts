// Sample documents in the business's own look (Modules R2): its name,
// details and catalogue, a made-up customer, and nothing stored. Used by
// the preview on "How documents look" and by the sample PDF.

import "server-only";

import { supabaseServer } from "@/lib/supabase";
import type { PdfDocument } from "./pdf";
import { fetchLogo, liveLook, lookTemplate } from "./build-pdf";

export const SAMPLE_TYPES = ["invoice", "quotation", "receipt", "purchase_order", "delivery_note", "credit_note"] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export interface SampleLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

/** The lines a sample shows: the business's own priced items when it has
 *  them, so the sample looks like their documents and not anyone's. */
export async function sampleLines(businessId: string): Promise<SampleLine[]> {
  const { data } = await supabaseServer()
    .from("catalogue_item")
    .select("name, base_price")
    .eq("business_id", businessId)
    .eq("active", true)
    .not("base_price", "is", null)
    .gt("base_price", 0)
    .order("created_at")
    .limit(3);
  const own = (data ?? []).map((i, k) => ({ description: i.name as string, quantity: k === 1 ? 2 : 1, unitPrice: Number(i.base_price) }));
  if (own.length >= 2) return own;
  return [
    { description: "Wash and treatment", quantity: 1, unitPrice: 150 },
    { description: "Shea butter hair mask", quantity: 2, unitPrice: 85 },
    { description: "Home service travel, East Legon", quantity: 1, unitPrice: 120 },
  ];
}

export async function samplePdfDocument(businessId: string, type: SampleType): Promise<PdfDocument> {
  const db = supabaseServer();
  const [look, biz, place, lines, numbering] = await Promise.all([
    liveLook(businessId),
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
    db.from("location").select("address, city").eq("business_id", businessId).eq("active", true).order("created_at").limit(1).maybeSingle(),
    sampleLines(businessId),
    // Before 0142 these columns do not exist, and the standard numbering shows.
    db.from("document_branding").select("number_prefixes, number_year").eq("business_id", businessId).maybeSingle(),
  ]);
  const year = new Date().getFullYear();
  const standard: Record<SampleType, string> = { invoice: "INV", quotation: "QUO", receipt: "RCP", purchase_order: "PO", delivery_note: "DN", credit_note: "CRN" };
  const own = (numbering.data?.number_prefixes ?? {}) as Record<string, string>;
  const prefix = /^[A-Z]{2,6}$/.test(own[type] ?? "") ? own[type] : standard[type];
  const withYear = numbering.data?.number_year !== false;
  const priced = type !== "delivery_note";
  const docLines = lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: priced ? l.unitPrice : 0,
    lineTotal: priced ? l.quantity * l.unitPrice : 0,
  }));
  const total = docLines.reduce((s, l) => s + l.lineTotal, 0);
  const today = new Date().toISOString();
  const later = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  return {
    type,
    number: `${prefix}-${withYear ? `${year}-` : ""}0001`,
    issuedAt: today,
    dueDate: type === "invoice" || type === "purchase_order" ? later : null,
    currencyCode: "GHS",
    businessName: (look?.trading_name as string) || (biz.data?.name as string) || "Your business",
    businessAddress: (look?.address_line as string) || [place.data?.address, place.data?.city].filter(Boolean).join(", ") || null,
    businessPhone: (look?.phone as string) ?? null,
    businessEmail: (look?.email as string) ?? null,
    tin: (look?.tin as string) ?? null,
    customerName: type === "purchase_order" ? "Kantanka Beauty Supply" : "Efua Asamoah",
    customerPhone: "024 555 0187",
    lines: docLines,
    subtotal: total,
    taxTotal: 0,
    total,
    amountPaid: type === "invoice" ? 0 : null,
    status: type === "receipt" ? "issued" : "sent",
    reason: type === "credit_note" ? "Two jars damaged in delivery" : null,
    footerNote: (look?.footer_note as string) ?? null,
    note: "This is a sample. Nothing was sent.",
    accentColour: (look?.accent_colour as string) ?? null,
    template: lookTemplate(look?.template),
    logo: await fetchLogo((look?.logo_url as string) ?? null),
    signatureAreas: look?.signature_areas === false ? false : true,
    verifyUrl: null,
  };
}
