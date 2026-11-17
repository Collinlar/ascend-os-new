// Inbound WhatsApp webhook. A customer writing to a business opens the
// 24-hour service window, during which the business may reply freely.
// Without this the window would never open and every message would have to
// be a pre-approved template.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface WhatsAppStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number | string; title?: string }>;
}

interface WhatsAppValue {
  messages?: Array<{
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: { button_reply?: { title?: string } };
  }>;
  statuses?: WhatsAppStatus[];
  contacts?: Array<{ wa_id?: string }>;
}

interface InboundPayload extends WhatsAppValue {
  entry?: Array<{ changes?: Array<{ value?: WhatsAppValue }> }>;
}

// 360dialog verifies a webhook endpoint with a challenge on setup.
async function handleGET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  if (token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "not verified" }, { status: 403 });
}

async function handlePOST(request: NextRequest) {
  const secret = process.env.WHATSAPP_VERIFY_TOKEN;
  // Fail closed: an unauthenticated caller must not be able to open a
  // messaging window for an arbitrary number.
  if (!secret || request.headers.get("x-webhook-token") !== secret) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: true, ignored: true });
  }

  // 360dialog sends either the on-premise shape (messages and statuses at
  // the top) or the Cloud API shape (inside entry[].changes[].value).
  const values = [payload, ...(payload.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value ?? {}))];
  const inbound = values.flatMap((v) => v.messages ?? []);
  const statuses = values.flatMap((v) => v.statuses ?? []);

  const db = supabaseServer();

  // Delivery states (0107): each status moves its message forward, or ends
  // it as failed. A status for a message Ascend did not send is ignored.
  let statusesApplied = 0;
  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : undefined;
    const error = s.errors?.[0] ? `${s.errors[0].code ?? ""} ${s.errors[0].title ?? ""}`.trim() : undefined;
    const { data } = await db.rpc("record_delivery_status", {
      p: { provider: "360dialog", reference: s.id, status: s.status, at, error },
    });
    if ((data as { applied?: boolean } | null)?.applied) statusesApplied += 1;
  }

  if (inbound.length === 0) {
    return NextResponse.json({ received: true, statuses: statuses.length, applied: statusesApplied });
  }

  // Replies (0108): the window opens only for the business that last
  // messaged this number; STOP, DELETE and START are acted on and
  // acknowledged. The text is read here and never stored.
  const actions: string[] = [];
  for (const message of inbound) {
    const from = message.from;
    if (!from) continue;
    const phone = from.startsWith("+") ? from : `+${from}`;
    const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? "";
    const { data } = await db.rpc("handle_whatsapp_reply", {
      p: { phone, text, provider_message_id: message.id ?? null },
    });
    actions.push((data as { action?: string } | null)?.action ?? "none");
  }

  return NextResponse.json({ received: true, actions });
}

export const GET = withAuthority("messaging/inbound", "GET", handleGET);
export const POST = withAuthority("messaging/inbound", "POST", handlePOST);
