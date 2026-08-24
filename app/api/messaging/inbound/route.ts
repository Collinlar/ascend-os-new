// Inbound WhatsApp webhook. A customer writing to a business opens the
// 24-hour service window, during which the business may reply freely.
// Without this the window would never open and every message would have to
// be a pre-approved template.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 360dialog verifies a webhook endpoint with a challenge on setup.
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  if (token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "not verified" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WHATSAPP_VERIFY_TOKEN;
  // Fail closed: an unauthenticated caller must not be able to open a
  // messaging window for an arbitrary number.
  if (!secret || request.headers.get("x-webhook-token") !== secret) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let payload: {
    messages?: Array<{ from?: string; type?: string }>;
    contacts?: Array<{ wa_id?: string }>;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: true, ignored: true });
  }

  const inbound = payload.messages ?? [];
  if (inbound.length === 0) {
    // Status callbacks and other events are acknowledged and ignored here.
    return NextResponse.json({ received: true });
  }

  const db = supabaseServer();

  for (const message of inbound) {
    const from = message.from;
    if (!from) continue;
    const phone = from.startsWith("+") ? from : `+${from}`;

    // Match the sender to businesses that already know this customer. A
    // number nobody has as a customer opens no window.
    const { data: customers } = await db
      .from("customer")
      .select("business_id")
      .eq("phone_e164", phone);

    for (const customer of customers ?? []) {
      await db.rpc("open_whatsapp_window", {
        p: { business_id: customer.business_id, customer_phone: phone },
      });
    }
  }

  return NextResponse.json({ received: true });
}
