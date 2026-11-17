// Shared messaging engine (Master PRD §20). Every product set sends through
// here: consent, cost, rendering, delivery status and retries live in one
// place rather than being reinvented per set (MSG-008).

import { createHash, randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import type { UUID } from "@/lib/domains/types";
import { deliver, providerFor } from "./providers";

export type TemplateKey =
  | "document.issued"
  | "order.confirmed"
  | "receipt.sent"
  | "invoice.reminder"
  // Email counterparts. Same engine, same consent and cost rules, a
  // subject line and a body that reads as a letter rather than a chat.
  | "document.issued.email"
  | "receipt.sent.email"
  | "invoice.reminder.email";

export interface QueueInput {
  businessId: UUID;
  templateKey: TemplateKey;
  customerId?: UUID;
  recipient?: string;
  variables?: Record<string, string>;
  sourceEntityType?: string;
  sourceEntityId?: UUID;
  clientRef?: string;
}

export type QueueResult = {
  messageId: UUID;
  status: "queued" | "blocked_no_consent" | "blocked_no_balance";
  duplicate: boolean;
};

export async function queueMessage(input: QueueInput): Promise<QueueResult> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("queue_message", {
    p: {
      business_id: input.businessId,
      template_key: input.templateKey,
      customer_id: input.customerId ?? "",
      recipient: input.recipient ?? null,
      variables: input.variables ?? {},
      source_entity_type: input.sourceEntityType ?? null,
      source_entity_id: input.sourceEntityId ?? "",
      client_ref: input.clientRef ?? null,
    },
  });
  if (error) throw new Error(`message_queue_failed: ${error.message}`);
  return {
    messageId: data.message_id as UUID,
    status: data.status,
    duplicate: Boolean(data.duplicate),
  };
}

// ---------------------------------------------------------------------------
// Secure document links (DOC-007). The token is random and stored hashed, so
// the table cannot be used to read customers' documents.
// ---------------------------------------------------------------------------
export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDocumentLink(
  documentId: UUID,
  businessId: UUID,
  expiresInDays = 90
): Promise<string> {
  const token = newAccessToken();
  const db = supabaseServer();
  const { error } = await db.from("document_access_token").insert({
    token_hash: hashAccessToken(token),
    document_id: documentId,
    business_id: businessId,
    expires_at: new Date(Date.now() + expiresInDays * 86400_000).toISOString(),
  });
  if (error) throw new Error(`link_create_failed: ${error.message}`);
  return token;
}

export function documentUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/d/${token}`;
}

// ---------------------------------------------------------------------------
// Dispatch. Called by the relay worker, not by request handlers: a merchant
// waiting on a page load should never be waiting on WhatsApp.
// ---------------------------------------------------------------------------
export interface DispatchOutcome {
  attempted: number;
  sent: number;
  failed: number;
}

export async function dispatchQueuedMessages(limit = 25): Promise<DispatchOutcome> {
  const db = supabaseServer();
  const { data: queued } = await db
    .from("message")
    .select(
      "id, channel, recipient, rendered_body, subject, used_template, variables, template:template_key(provider_name, provider_namespace, param_order)"
    )
    .eq("status", "queued")
    .limit(limit);

  let sent = 0;
  let failed = 0;

  for (const message of queued ?? []) {
    try {
      const template = message.template as unknown as {
        provider_name: string | null;
        provider_namespace: string | null;
        param_order: string[] | null;
      } | null;

      // The provider for the channel (lib/messaging/providers.ts, C4).
      const result = await deliver({
        channel: message.channel as string,
        recipient: message.recipient as string,
        body: message.rendered_body as string,
        subject: message.subject as string | null,
        // Outside the customer's 24-hour window WhatsApp only accepts a
        // registered template, so the queue records which form to send.
        template: message.used_template
          ? {
              name: template?.provider_name ?? "",
              namespace: template?.provider_namespace ?? undefined,
              params: orderedParams(
                (message.variables ?? {}) as Record<string, string>,
                template?.param_order ?? []
              ),
            }
          : undefined,
      });
      // Every provider call is recorded as an attempt (0107). Accepted moves
      // the message to sent; the provider's later status callbacks move it
      // on to delivered or read, or end it as failed.
      await db.rpc("record_message_attempt", {
        p: {
          message_id: message.id,
          provider: result.provider,
          outcome: result.ok ? "accepted" : "rejected",
          reference: result.reference ?? null,
          reason: result.ok ? null : result.reason,
        },
      });
      if (result.ok) sent += 1;
      else failed += 1;
    } catch {
      await db.rpc("record_message_attempt", {
        p: {
          message_id: message.id,
          provider: providerFor(message.channel as string)?.name ?? "none",
          outcome: "error",
          reason: "could not reach the provider",
        },
      });
      failed += 1;
    }
  }

  return { attempted: (queued ?? []).length, sent, failed };
}

// WhatsApp templates take positional parameters, so the stored variables
// are emitted in the order the template was registered with. A variable the
// caller did not supply becomes an empty string rather than shifting every
// later parameter into the wrong slot.
function orderedParams(
  variables: Record<string, string>,
  order: string[]
): string[] {
  return order.map((key) => variables[key] ?? "");
}
