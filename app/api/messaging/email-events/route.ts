// Email delivery events from Resend (0107): delivered, bounced and marked
// as spam. Signed by Resend through Svix; anything unsigned or stale is
// refused, so nobody can mark a merchant's invoice as delivered or bounced.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

// Svix signing: HMAC-SHA256 of "id.timestamp.body" with the secret after
// "whsec_", base64. The header can carry several "v1,<sig>" values.
function verified(secret: string, id: string, timestamp: string, body: string, header: string): boolean {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return header.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

async function handlePOST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  const body = await request.text();
  // Fail closed: no secret configured means no events accepted.
  if (!secret || !id || !timestamp || !signature || !verified(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string; bounce?: { message?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ received: true, ignored: true });
  }
  const status = event.type ? STATUS[event.type] : undefined;
  if (!status || !event.data?.email_id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const { data } = await supabaseServer().rpc("record_delivery_status", {
    p: {
      provider: "resend",
      reference: event.data.email_id,
      status,
      at: event.created_at,
      error: event.data.bounce?.message,
    },
  });
  return NextResponse.json({ received: true, result: data });
}

export const POST = withAuthority("messaging/email-events", "POST", handlePOST);
