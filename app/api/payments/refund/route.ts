// Owner-initiated refund. Validated locally, then sent to the provider.
// The money is only treated as returned when the provider's webhook
// confirms it — a request is not a refund.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments/provider";

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { paymentId?: string; amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.paymentId || !(Number(body.amount) > 0)) {
    return NextResponse.json(
      { error: "Pick a payment and how much to send back." },
      { status: 422 }
    );
  }
  if (!(body.reason ?? "").trim()) {
    return NextResponse.json(
      { error: "Say why you are refunding. It stays on the record." },
      { status: 422 }
    );
  }

  const db = supabaseServer();
  const { data: payment } = await db
    .from("payment")
    .select("id, business_id, provider_reference, verification")
    .eq("id", body.paymentId)
    .maybeSingle();
  if (!payment) {
    return NextResponse.json({ error: "We could not find that payment." }, { status: 404 });
  }

  // Refunds are an owner or manager decision, not a cashier one.
  const { data: membership } = await db
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", payment.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  const roleKey = (membership?.role as unknown as { key: string } | null)?.key;
  if (!membership || (roleKey !== "owner" && roleKey !== "manager")) {
    return NextResponse.json(
      { error: "Only the owner or a manager can send money back." },
      { status: 403 }
    );
  }

  // A cash payment cannot be refunded through the provider; it goes back
  // from the drawer and is recorded as a till movement instead.
  if (payment.verification !== "provider_confirmed" || !payment.provider_reference) {
    return NextResponse.json(
      {
        error:
          "This payment did not come through Mobile Money, so it cannot be sent back automatically. Refund it from the till and record it there.",
      },
      { status: 422 }
    );
  }

  const { data: created, error } = await db.rpc("request_refund", {
    p: {
      payment_id: payment.id,
      amount: body.amount,
      reason: body.reason,
      requested_by: membership.id,
    },
  });

  if (error) {
    if (/exceeds_refundable_amount/.test(error.message)) {
      return NextResponse.json(
        { error: "That is more than is left to refund on this payment." },
        { status: 422 }
      );
    }
    if (/payment_not_refundable/.test(error.message)) {
      return NextResponse.json(
        { error: "That payment is not in a state that can be refunded." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not start that refund. Tap again in a moment." },
      { status: 500 }
    );
  }

  const provider = paymentProvider();
  const result = await provider.refund({
    transactionReference: payment.provider_reference,
    amount: Number(body.amount),
    reason: body.reason,
  });

  if (!result.ok) {
    await db
      .from("refund_request")
      .update({ status: "failed" })
      .eq("id", created.refund_id);
    return NextResponse.json(
      { error: "Mobile Money would not take the refund just now. Try again shortly." },
      { status: 502 }
    );
  }

  await db
    .from("refund_request")
    .update({ status: "pending", provider_reference: result.providerReference })
    .eq("id", created.refund_id);

  return NextResponse.json({
    refundId: created.refund_id,
    status: "pending",
    note: "The customer gets their money back once Mobile Money confirms it. We will update the record then.",
  });
}
