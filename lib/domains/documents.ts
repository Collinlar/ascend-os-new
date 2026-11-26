// Documents domain service. Drafts are freely editable; issuing freezes the
// content and assigns the business's next number. Everything downstream
// (receivables, evidence, customer statements) keys off the issued record.

import { supabaseServer } from "@/lib/supabase";
import { createDocumentLink, documentUrl, queueMessage } from "@/lib/messaging/send";
import { formatGHS } from "@/lib/money";
import type { DocumentType, UUID } from "./types";

export interface DocumentLine {
  /** The catalogue item this line sells, where there is one. A line typed
   *  by hand has none, which is allowed: a business charges for things its
   *  catalogue has never heard of. Where it is set, the document can be
   *  joined back to what was actually sold, which is what keeps Documents
   *  in the same world as POS, Shop and Services (DOC-LIN-004). */
  itemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DraftInput {
  businessId: UUID;
  /** Purchase orders only. The schema refuses a document that names both. */
  supplierId?: UUID;
  customerId?: UUID;
  type: DocumentType;
  lines: DocumentLine[];
  dueDate?: string;
  createdBy?: UUID;
  /** Quotations: until when the price stands. */
  validUntil?: string;
  /** What it was made from: a till sale, a Shop order or a booking (Modules R1). */
  source?: { type: "sale" | "shop_order" | "service_booking"; id: UUID } | null;
  /** The document it was made from, for a delivery note from an invoice. */
  convertedFrom?: UUID | null;
  /** This document's own note, printed on it. */
  note?: string | null;
}

export function totalsFor(lines: DocumentLine[]): {
  subtotal: number;
  total: number;
} {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const rounded = Math.round(subtotal * 100) / 100;
  return { subtotal: rounded, total: rounded };
}

export async function createDraft(input: DraftInput): Promise<UUID> {
  const db = supabaseServer();
  const { subtotal, total } = totalsFor(input.lines);

  // The business's look as it is today, with this document's note, kept on
  // the document. Issuing freezes it into the snapshot, so a later rebrand
  // never repaints what was sent (DOC-004).
  const { data: look } = await db
    .from("document_branding")
    .select("trading_name, address_line, phone, footer_note, accent_colour")
    .eq("business_id", input.businessId)
    .maybeSingle();
  const note = (input.note ?? "").trim();
  const branding = { ...(look ?? {}), ...(note ? { note: note.slice(0, 400) } : {}) };

  const { data, error } = await db
    .from("document")
    .insert({
      business_id: input.businessId,
      customer_id: input.customerId ?? null,
      supplier_id: input.supplierId ?? null,
      type: input.type,
      status: "draft",
      currency_code: "GHS",
      subtotal,
      tax_total: 0,
      total,
      lines: input.lines.map((l) => ({
        item_id: l.itemId ?? null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.lineTotal,
      })),
      due_date: input.dueDate ?? null,
      valid_until: input.validUntil ?? null,
      created_by: input.createdBy ?? null,
      branding,
      source_entity_type: input.source?.type ?? null,
      source_entity_id: input.source?.id ?? null,
      converted_from: input.convertedFrom ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`draft_create_failed: ${error.message}`);
  return data.id as UUID;
}

export interface IssueResult {
  documentId: UUID;
  number: string;
  duplicate: boolean;
  delivery?: "queued" | "blocked_no_balance" | "no_customer" | "skipped";
}

const DELIVERABLE: DocumentType[] = ["invoice", "proforma", "quotation", "receipt"];

// Sends the issued document to the customer with a secure link. Delivery
// failure never fails the issuance: the document is a commercial record
// whether or not the message got through (MSG-007).
//
// WhatsApp where there is a number, email where there is an address, and
// both where the customer has both. A company paying on account reads its
// invoices in an inbox; a trader reads them on WhatsApp. Sending to both
// costs one extra message and saves the merchant chasing somebody who
// simply never saw it. One secure link serves both, so there is one thing
// to revoke.
async function deliverIssuedDocument(
  documentId: UUID,
  channels: Array<"whatsapp" | "email"> = ["whatsapp", "email"]
): Promise<IssueResult["delivery"]> {
  const db = supabaseServer();
  const { data: doc } = await db
    .from("document")
    .select("id, business_id, customer_id, type, number, total, customer:customer_id(display_name, phone_e164, email)")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || !DELIVERABLE.includes(doc.type as DocumentType)) return "skipped";

  const customer = doc.customer as unknown as {
    display_name: string | null;
    phone_e164: string | null;
    email: string | null;
  } | null;
  // The merchant may choose how it goes out (New document, round 2 R1).
  const phone = channels.includes("whatsapp") ? customer?.phone_e164 : null;
  const email = channels.includes("email") ? customer?.email : null;
  if (channels.length === 0) return "skipped";
  if (!doc.customer_id || (!phone && !email)) return "no_customer";

  const token = await createDocumentLink(doc.id, doc.business_id);
  const variables = {
    customer_name: customer?.display_name ?? "there",
    document_type: String(doc.type).replace("_", " "),
    document_number: doc.number ?? "",
    amount: formatGHS(Number(doc.total ?? 0)),
    link: documentUrl(token),
  };
  const base = doc.type === "receipt" ? "receipt.sent" : "document.issued";

  let queued = false;
  let blocked = false;

  for (const channel of [
    phone ? { key: base, recipient: phone, suffix: "issued" } : null,
    email ? { key: `${base}.email`, recipient: email, suffix: "issued.email" } : null,
  ]) {
    if (!channel) continue;
    try {
      const result = await queueMessage({
        businessId: doc.business_id,
        templateKey: channel.key as Parameters<typeof queueMessage>[0]["templateKey"],
        customerId: doc.customer_id,
        recipient: channel.recipient,
        variables,
        sourceEntityType: "document",
        sourceEntityId: doc.id,
        // One message per document per channel, however many times issue
        // is retried.
        clientRef: `doc:${doc.id}:${channel.suffix}`,
      });
      if (result.status === "queued") queued = true;
      else blocked = true;
    } catch {
      // One channel failing must not stop the other. A merchant who has
      // both wants whichever one works.
      blocked = true;
    }
  }

  if (queued) return "queued";
  return blocked ? "blocked_no_balance" : "no_customer";
}

export async function issueDocument(
  documentId: UUID,
  actorMembershipId?: UUID,
  /** Which channels Ascend sends it on; empty means "PDF only", nothing sent. */
  channels?: Array<"whatsapp" | "email">
): Promise<IssueResult> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("issue_document", {
    p: { document_id: documentId, actor_membership_id: actorMembershipId ?? "" },
  });
  if (error) throw new Error(error.message);

  const delivery = await deliverIssuedDocument(data.document_id as UUID, channels).catch(
    () => "skipped" as const
  );

  return {
    documentId: data.document_id as UUID,
    number: data.number as string,
    duplicate: Boolean(data.duplicate),
    delivery,
  };
}

export async function convertDocument(
  documentId: UUID,
  toType: DocumentType,
  actorMembershipId?: UUID
): Promise<UUID> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("convert_document", {
    p: {
      document_id: documentId,
      to_type: toType,
      actor_membership_id: actorMembershipId ?? "",
    },
  });
  if (error) throw new Error(error.message);
  return data.document_id as UUID;
}

export interface CreditNoteResult {
  documentId: UUID;
  number: string;
  /** What this credit note took off the invoice. */
  credited: number;
  /** What is still creditable against it afterwards. */
  remaining: number;
}

// A credit note is a business reducing money it is owed, so the reason and
// the ceiling live in the database rather than here (0053). This is the
// only path: the invoice-to-credit-note conversion was removed so the
// rules cannot be walked around.
export async function issueCreditNote(
  invoiceId: UUID,
  reason: string,
  amount: number | undefined,
  actorMembershipId?: UUID
): Promise<CreditNoteResult> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("issue_credit_note", {
    p: {
      document_id: invoiceId,
      reason,
      ...(amount === undefined ? {} : { amount }),
      actor_membership_id: actorMembershipId ?? "",
    },
  });
  if (error) throw new Error(error.message);
  return {
    documentId: data.document_id as UUID,
    number: data.number as string,
    credited: Number(data.credited),
    remaining: Number(data.remaining),
  };
}
