// Money taken on the day (Modules M6a, 0141): cash at pickup, MoMo sent to
// the merchant's number, a transfer, against a shop order or a booking. The
// database checks the permission for each (orders.manage, bookings.manage),
// the business, what is left, and that the same tap is one payment.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";
import { formatGHS } from "@/lib/money";

export const dynamic = "force-dynamic";

interface Body {
  source?: "shop_order" | "service_booking";
  sourceId?: string;
  amount?: number;
  method?: "cash" | "mobile_money" | "bank_transfer" | "card";
  reference?: string;
  paidOn?: string;
  clientRef?: string;
}

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Sign in to pick up where you left off." }, { status: 401 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const membership = await activeMembership<{ id: string; business_id: string }>(personId, "id, business_id");
  if (!membership) {
    return NextResponse.json({ error: "You do not have access to a business yet." }, { status: 403 });
  }
  if (body.source !== "shop_order" && body.source !== "service_booking") {
    return NextResponse.json({ error: "Pick the order or booking this money is for." }, { status: 422 });
  }
  const amount = Number(body.amount);
  if (!body.sourceId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter how much they paid, in GHS." }, { status: 422 });
  }
  if (!body.method || !["cash", "mobile_money", "bank_transfer", "card"].includes(body.method)) {
    return NextResponse.json({ error: "Say how they paid: cash, MoMo, bank transfer or card." }, { status: 422 });
  }
  if (!body.clientRef) {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const paidAt =
    body.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn) ? new Date(`${body.paidOn}T12:00:00Z`).toISOString() : undefined;

  const db = supabaseServer();
  const { data, error } = await db.rpc("record_order_payment", {
    p: {
      business_id: membership.business_id,
      source: body.source,
      source_id: body.sourceId,
      amount,
      method: body.method,
      reference: (body.reference ?? "").trim().slice(0, 80),
      paid_at: paidAt && new Date(paidAt) > new Date() ? new Date().toISOString() : paidAt,
      client_ref: `ordpay:${body.clientRef}`,
      actor_membership_id: membership.id,
    },
  });
  if (error) {
    const denied = deniedByDatabase(error);
    if (denied) return denied;
    const m = error.message;
    if (/payment_over_balance/.test(m)) {
      const left = Number(m.match(/payment_over_balance: ([0-9.]+)/)?.[1] ?? NaN);
      return NextResponse.json(
        { error: Number.isFinite(left) ? `That is more than is left. ${formatGHS(left)} is still to pay.` : "That is more than is left." },
        { status: 422 }
      );
    }
    if (/nothing_owed/.test(m)) return NextResponse.json({ error: "Nothing is left to pay on this." }, { status: 409 });
    if (/not_open/.test(m)) {
      return NextResponse.json(
        { error: body.source === "shop_order" ? "Confirm the order first. A cancelled order is not owed." : "Accept the booking first. A cancelled one is not owed." },
        { status: 409 }
      );
    }
    if (/not_found/.test(m)) return NextResponse.json({ error: "We could not find that." }, { status: 404 });
    if (/paid_at_in_future/.test(m)) return NextResponse.json({ error: "That date has not come yet. Pick today or earlier." }, { status: 422 });
    console.error("record_order_payment failed:", m);
    return NextResponse.json({ error: "We could not record that payment just now. Tap again in a moment." }, { status: 500 });
  }
  const { data: receipt } = await db.from("document").select("id, number").eq("payment_id", data.payment_id).maybeSingle();
  return NextResponse.json({
    paymentId: data.payment_id,
    duplicate: Boolean(data.duplicate),
    left: data.left === undefined ? null : Number(data.left),
    receipt: receipt ? { id: receipt.id, number: receipt.number } : null,
  });
}

export const POST = withAuthority("payments/record", "POST", handlePOST);
