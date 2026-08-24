// Starts a collection: creates our intent, asks the provider for a checkout
// URL, and hands it back. Nothing is treated as money until the provider's
// webhook confirms it (PAY-006).
//
// Document payment is open to the customer holding the secure link (they
// have no account). Balance top-up requires an authenticated member.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";
import { newPaymentReference, paymentProvider } from "@/lib/payments/provider";

interface Body {
  purpose?: "document" | "balance_topup" | "service_booking";
  documentToken?: string; // secure link token, for customer-side payment
  bookingId?: string; // deposit payment
  businessId?: string; // top-up only
  amount?: number; // top-up only
  payerContact?: string;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const db = supabaseServer();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reference = newPaymentReference();

  let businessId: string;
  let amount: number;
  let customerId: string | null = null;
  let sourceType: string | null = null;
  let sourceId: string | null = null;
  let callbackUrl: string;

  if (body.purpose === "document") {
    if (!body.documentToken) {
      return NextResponse.json({ error: "This payment link is not valid." }, { status: 422 });
    }
    const { data: access } = await db
      .from("document_access_token")
      .select("document_id, business_id, revoked_at, expires_at")
      .eq("token_hash", hashAccessToken(body.documentToken))
      .maybeSingle();
    if (!access || access.revoked_at) {
      return NextResponse.json({ error: "This payment link is not valid." }, { status: 404 });
    }

    const { data: doc } = await db
      .from("document")
      .select("id, business_id, customer_id, total, status, number")
      .eq("id", access.document_id)
      .maybeSingle();
    if (!doc || doc.total === null) {
      return NextResponse.json({ error: "This document cannot be paid online." }, { status: 422 });
    }
    if (doc.status === "paid") {
      return NextResponse.json({ error: "This document is already paid." }, { status: 409 });
    }

    businessId = doc.business_id;
    amount = Number(doc.total);
    customerId = doc.customer_id;
    sourceType = "document";
    sourceId = doc.id;
    callbackUrl = `${appUrl}/d/${body.documentToken}`;
  } else if (body.purpose === "service_booking") {
    if (!body.bookingId) {
      return NextResponse.json({ error: "This payment link is not valid." }, { status: 422 });
    }
    const { data: booking } = await db
      .from("service_booking")
      .select("id, business_id, customer_id, status, deposit_required, deposit_paid")
      .eq("id", body.bookingId)
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: "We could not find that booking." }, { status: 404 });
    }
    if (booking.status === "cancelled") {
      return NextResponse.json(
        { error: "That booking was released. Book a new time." },
        { status: 409 }
      );
    }
    const outstanding =
      Number(booking.deposit_required ?? 0) - Number(booking.deposit_paid ?? 0);
    if (!(outstanding > 0)) {
      return NextResponse.json(
        { error: "This booking has no deposit outstanding." },
        { status: 409 }
      );
    }

    businessId = booking.business_id;
    amount = outstanding;
    customerId = booking.customer_id;
    sourceType = "service_booking";
    sourceId = booking.id;
    callbackUrl = `${appUrl}/booked/${booking.id}`;
  } else if (body.purpose === "balance_topup") {
    const personId = await currentPersonId();
    if (!personId) {
      return NextResponse.json(
        { error: "Your session timed out. Verify your WhatsApp number to continue." },
        { status: 401 }
      );
    }
    if (!body.businessId || !(Number(body.amount) > 0)) {
      return NextResponse.json({ error: "Enter how much you want to add." }, { status: 422 });
    }
    const { data: membership } = await db
      .from("business_membership")
      .select("id")
      .eq("business_id", body.businessId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: "You do not have access to this business." },
        { status: 403 }
      );
    }

    businessId = body.businessId;
    amount = Number(body.amount);
    sourceType = "balance_topup";
    callbackUrl = `${appUrl}/dashboard`;
  } else {
    return NextResponse.json({ error: "That is not a payment we handle." }, { status: 422 });
  }

  const { error: intentError } = await db.from("payment_intent").insert({
    reference,
    business_id: businessId,
    customer_id: customerId,
    purpose: body.purpose,
    source_entity_type: sourceType,
    source_entity_id: sourceId,
    amount,
    currency_code: "GHS",
    payer_contact: body.payerContact ?? null,
  });
  if (intentError) {
    return NextResponse.json(
      { error: "We could not start this payment. Tap again in a moment." },
      { status: 500 }
    );
  }

  const provider = paymentProvider();
  const result = await provider.initiate({
    reference,
    amount,
    currencyCode: "GHS",
    customerContact: body.payerContact ?? "",
    callbackUrl,
    metadata: { business_id: businessId, purpose: body.purpose },
  });

  if (!result.ok || !result.checkoutUrl) {
    await db
      .from("payment_intent")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("reference", reference);
    return NextResponse.json(
      { error: "Mobile Money is not responding just now. Try again in a moment." },
      { status: 502 }
    );
  }

  await db.from("payment_intent").update({ status: "pending" }).eq("reference", reference);

  return NextResponse.json({ checkoutUrl: result.checkoutUrl, reference });
}
