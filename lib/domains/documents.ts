// Documents domain service. Drafts are freely editable; issuing freezes the
// content and assigns the business's next number. Everything downstream
// (receivables, evidence, customer statements) keys off the issued record.

import { supabaseServer } from "@/lib/supabase";
import { createDocumentLink, documentUrl, queueMessage } from "@/lib/messaging/send";
import { formatGHS } from "@/lib/money";
import type { DocumentType, UUID } from "./types";

export interface DocumentLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface DraftInput {
  businessId: UUID;
  customerId?: UUID;
  type: DocumentType;
  lines: DocumentLine[];
  dueDate?: string;
  createdBy?: UUID;
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

  const { data, error } = await db
    .from("document")
    .insert({
      business_id: input.businessId,
      customer_id: input.customerId ?? null,
      type: input.type,
      status: "draft",
      currency_code: "GHS",
      subtotal,
      tax_total: 0,
      total,
      lines: input.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.lineTotal,
      })),
      due_date: input.dueDate ?? null,
      created_by: input.createdBy ?? null,
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

// Sends the issued document to the customer over WhatsApp with a secure
// link. Delivery failure never fails the issuance: the document is a
// commercial record whether or not the message got through (MSG-007).
async function deliverIssuedDocument(
  documentId: UUID
): Promise<IssueResult["delivery"]> {
  const db = supabaseServer();
  const { data: doc } = await db
    .from("document")
    .select("id, business_id, customer_id, type, number, total, customer:customer_id(phone_e164)")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || !DELIVERABLE.includes(doc.type as DocumentType)) return "skipped";

  const phone = (doc.customer as unknown as { phone_e164: string | null } | null)
    ?.phone_e164;
  if (!doc.customer_id || !phone) return "no_customer";

  const token = await createDocumentLink(doc.id, doc.business_id);
  const result = await queueMessage({
    businessId: doc.business_id,
    templateKey: doc.type === "receipt" ? "receipt.sent" : "document.issued",
    customerId: doc.customer_id,
    recipient: phone,
    variables: {
      document_type: String(doc.type).replace("_", " "),
      document_number: doc.number ?? "",
      amount: formatGHS(Number(doc.total ?? 0)),
      link: documentUrl(token),
    },
    sourceEntityType: "document",
    sourceEntityId: doc.id,
    // One message per issued document, however many times issue is retried.
    clientRef: `doc:${doc.id}:issued`,
  });

  return result.status === "queued" ? "queued" : "blocked_no_balance";
}

export async function issueDocument(
  documentId: UUID,
  actorMembershipId?: UUID
): Promise<IssueResult> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("issue_document", {
    p: { document_id: documentId, actor_membership_id: actorMembershipId ?? "" },
  });
  if (error) throw new Error(error.message);

  const delivery = await deliverIssuedDocument(data.document_id as UUID).catch(
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
