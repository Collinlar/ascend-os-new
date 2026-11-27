// What "How documents look" needs (Modules R2): the saved look, the
// business's details to fall back on, the next number for each kind, and
// lines for the samples.

import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { sampleLines, type SampleLine } from "./sample";
import type { Template } from "@/components/documents/DocumentPreview";

export const NUMBERED_KINDS: Array<{ type: string; label: string; standard: string }> = [
  { type: "invoice", label: "Invoices", standard: "INV" },
  { type: "quotation", label: "Quotations", standard: "QUO" },
  { type: "proforma", label: "Proformas", standard: "PRO" },
  { type: "receipt", label: "Receipts", standard: "RCP" },
  { type: "purchase_order", label: "Purchase orders", standard: "PO" },
  { type: "delivery_note", label: "Delivery notes", standard: "DN" },
  { type: "credit_note", label: "Credit notes", standard: "CRN" },
];

export interface LookData {
  businessId: string;
  businessName: string;
  place: string;
  look: {
    tradingName: string;
    addressLine: string;
    phone: string;
    email: string;
    tin: string;
    footerNote: string;
    accentColour: string | null;
    template: Template;
    logoUrl: string | null;
    signatureAreas: boolean;
    numberPrefixes: Record<string, string>;
    numberYear: boolean;
  };
  /** The next number each kind would take with the saved numbering. */
  next: Record<string, number>;
  sample: SampleLine[];
  /** False until migration 0142 has run: the new settings cannot be saved. */
  ready: boolean;
  /** Documents Plus is on (round 3, P4). True before 0149, when nothing is locked. */
  plus: boolean;
  /** What Documents Plus costs, when it can be bought. */
  plusPrice: number | null;
}

export async function loadLook(businessId: string): Promise<LookData> {
  const db = supabaseServer();
  const full = await db
    .from("document_branding")
    .select("trading_name, address_line, phone, email, tin, footer_note, accent_colour, template, logo_url, signature_areas, number_prefixes, number_year")
    .eq("business_id", businessId)
    .maybeSingle();
  // Before 0142 the new columns do not exist; show what there is.
  const ready = !full.error;
  const row = (ready
    ? full.data
    : (await db.from("document_branding").select("trading_name, address_line, phone, email, footer_note, accent_colour").eq("business_id", businessId).maybeSingle()).data) as Record<string, unknown> | null;

  const [biz, place, seq, sample, plus, price] = await Promise.all([
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
    db.from("location").select("address, city").eq("business_id", businessId).eq("active", true).order("created_at").limit(1).maybeSingle(),
    db.from("document_sequence").select("type, period_key, last_number").eq("business_id", businessId),
    sampleLines(businessId),
    db.rpc("has_documents_plus", { p_business: businessId }).then((r) => (r.error ? true : r.data === true), () => true),
    db.from("price_book_entry").select("amount").eq("sku", "documents_plus_12m").eq("active", true).maybeSingle().then((r) => (r.error || !r.data ? null : Number(r.data.amount)), () => null),
  ]);

  const numberYear = row?.number_year === false ? false : true;
  const period = numberYear ? String(new Date().getFullYear()) : "all";
  const next: Record<string, number> = {};
  for (const k of NUMBERED_KINDS) {
    const found = (seq.data ?? []).find((s) => s.type === k.type && s.period_key === period);
    next[k.type] = Number(found?.last_number ?? 0) + 1;
  }
  const template = row?.template === "modern" || row?.template === "compact" ? row.template : "classic";

  return {
    businessId,
    businessName: (biz.data?.name as string) ?? "Your business",
    place: [place.data?.address, place.data?.city].filter(Boolean).join(", "),
    look: {
      tradingName: (row?.trading_name as string) ?? "",
      addressLine: (row?.address_line as string) ?? "",
      phone: (row?.phone as string) ?? "",
      email: (row?.email as string) ?? "",
      tin: (row?.tin as string) ?? "",
      footerNote: (row?.footer_note as string) ?? "",
      accentColour: (row?.accent_colour as string) ?? null,
      template,
      logoUrl: (row?.logo_url as string) ?? null,
      signatureAreas: row?.signature_areas === false ? false : true,
      numberPrefixes: (row?.number_prefixes as Record<string, string>) ?? {},
      numberYear,
    },
    next,
    sample,
    ready,
    plus,
    plusPrice: price,
  };
}
