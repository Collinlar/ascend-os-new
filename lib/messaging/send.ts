// Shared messaging engine (Master PRD §20). Every product set sends through
// here: consent, cost, rendering, delivery status and retries live in one
// place rather than being reinvented per set (MSG-008).

import { createHash, randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import type { UUID } from "@/lib/domains/types";

export type TemplateKey = "document.issued" | "order.confirmed" | "receipt.sent";

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
      "id, channel, recipient, rendered_body, used_template, variables, template:template_key(provider_name, provider_namespace, param_order)"
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

      const result = await deliver(
        message.channel as string,
        message.recipient as string,
        message.rendered_body as string,
        // Outside the customer's 24-hour window WhatsApp only accepts a
        // registered template, so the queue records which form to send.
        message.used_template
          ? {
              name: template?.provider_name ?? "",
              namespace: template?.provider_namespace ?? undefined,
              params: orderedParams(
                (message.variables ?? {}) as Record<string, string>,
                template?.param_order ?? []
              ),
            }
          : undefined
      );
      if (result.ok) {
        await db
          .from("message")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_reference: result.reference ?? null,
          })
          .eq("id", message.id);
        sent += 1;
      } else {
        await db.rpc("fail_message", {
          p: { message_id: message.id, reason: result.reason },
        });
        failed += 1;
      }
    } catch {
      await db.rpc("fail_message", {
        p: { message_id: message.id, reason: "dispatch error" },
      });
      failed += 1;
    }
  }

  return { attempted: (queued ?? []).length, sent, failed };
}

interface DeliveryResult {
  ok: boolean;
  reference?: string;
  reason?: string;
}

interface TemplateSend {
  name: string;
  namespace?: string;
  params: string[];
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

async function deliver(
  channel: string,
  recipient: string,
  body: string,
  template?: TemplateSend
): Promise<DeliveryResult> {
  if (channel !== "whatsapp") {
    return { ok: false, reason: `channel not configured: ${channel}` };
  }
  if (!recipient) {
    return { ok: false, reason: "no recipient number" };
  }
  if (template && !template.name) {
    return { ok: false, reason: "template not registered with the provider" };
  }

  const apiKey = process.env.WHATSAPP_360DIALOG_API_KEY;
  if (!apiKey) {
    // Development: nothing is charged for real, and the message is visible
    // in logs so the flow stays testable without a provider.
    console.info(
      `[dev] WhatsApp ${template ? `template ${template.name}` : "text"} to ${recipient.slice(0, 7)}…: ${body}`
    );
    return { ok: true, reference: "dev-mode" };
  }

  const requestBody = template
    ? {
        to: recipient.replace("+", ""),
        type: "template",
        template: {
          name: template.name,
          namespace: template.namespace,
          language: { code: "en", policy: "deterministic" },
          components: [
            {
              type: "body",
              parameters: template.params.map((text) => ({ type: "text", text })),
            },
          ],
        },
      }
    : {
        to: recipient.replace("+", ""),
        type: "text",
        text: { body },
      };

  const response = await fetch("https://waba.360dialog.io/v1/messages", {
    method: "POST",
    headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return { ok: false, reason: `provider rejected (${response.status})` };
  }
  const result = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, reference: result.messages?.[0]?.id };
}
