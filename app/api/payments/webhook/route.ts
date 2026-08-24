// Provider webhook. The only path in the platform that can write a
// provider_confirmed payment (PAY-006).
//
// Two rules make this safe: the raw body's signature is verified before the
// payload is trusted at all, and every event is recorded so a retried
// delivery cannot credit a merchant twice (PAY-005, API-007).

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { paymentProvider } from "@/lib/payments/provider";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Read the body as text: any re-serialisation would change the bytes and
  // break signature verification.
  const rawBody = await request.text();
  const provider = paymentProvider();

  let signatureValid: boolean;
  try {
    signatureValid = provider.verifySignature(
      rawBody,
      request.headers.get("x-paystack-signature")
    );
  } catch {
    // Missing provider configuration. Fail closed.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  if (!signatureValid) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  const event = provider.parseEvent(rawBody);
  if (!event) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const db = supabaseServer();
  const externalId = event.providerReference ?? event.reference;

  // Record first, act second. The unique (provider, external_id) constraint
  // is what makes a replayed webhook a no-op.
  const { error: recordError } = await db.from("provider_callback").insert({
    provider: provider.name,
    external_id: externalId,
    payload: JSON.parse(rawBody),
    signature_valid: true,
  });

  if (recordError) {
    // Already seen. Acknowledge so the provider stops retrying.
    if (recordError.message.includes("duplicate key")) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ received: false }, { status: 500 });
  }

  try {
    if (event.kind === "succeeded") {
      await db.rpc("confirm_payment_intent", {
        p: {
          reference: event.reference,
          provider_reference: event.providerReference ?? null,
          amount: event.amount ?? null,
          method: event.method ?? "mobile_money",
          paid_at: event.paidAt ?? null,
        },
      });
    } else if (event.kind === "failed") {
      await db.rpc("fail_payment_intent", {
        p: {
          reference: event.reference,
          provider_reference: event.providerReference ?? null,
        },
      });
    } else if (event.kind === "refund_completed") {
      // Only the provider confirms that money actually went back.
      await db.rpc("complete_refund", {
        p: { provider_reference: event.providerReference ?? event.reference },
      });
    } else if (event.kind === "refund_failed") {
      await db
        .from("refund_request")
        .update({ status: "failed" })
        .eq("provider_reference", event.providerReference ?? event.reference);
    }

    await db
      .from("provider_callback")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("external_id", externalId);

    return NextResponse.json({ received: true });
  } catch {
    // Leave processed_at null so the failure is visible in operations and
    // can be replayed deliberately.
    return NextResponse.json({ received: true, deferred: true });
  }
}
