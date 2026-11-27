// Track an order without the link (round 4, S1): the order's reference and
// the phone it was placed with, both of which only the customer holds,
// give a fresh private link to that one order.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { normalizePhone } from "@/lib/auth/phone";
import { withAuthority } from "@/lib/authority/with-authority";
import { openShop } from "@/lib/shop/openShop";
import { createOrderLink, orderPath } from "@/lib/shop/tracking";

export const dynamic = "force-dynamic";

const NOT_FOUND = "We could not find an order with that reference and number. Check both against your WhatsApp message.";

async function handlePOST(request: NextRequest) {
  let body: { slug?: string; reference?: string; phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const reference = (body.reference ?? "").trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(reference)) {
    return NextResponse.json({ error: "Your order reference is 8 letters and numbers, like 3F9A21C4." }, { status: 422 });
  }
  const phone = normalizePhone(body.phone ?? "");
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 422 });

  const business = body.slug ? await openShop(body.slug) : null;
  if (!business) return NextResponse.json({ error: "This shop is not open on Ascend." }, { status: 404 });

  const db = supabaseServer();
  const { data: customers } = await db.from("customer").select("id").eq("business_id", business.id).eq("phone_e164", phone.e164).limit(5);
  const ids = (customers ?? []).map((c) => c.id as string);
  if (ids.length === 0) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  const { data: orders } = await db
    .from("shop_order")
    .select("id")
    .eq("business_id", business.id)
    .in("customer_id", ids)
    .gte("placed_at", new Date(Date.now() - 365 * 864e5).toISOString())
    .limit(200);
  const order = (orders ?? []).find((o) => (o.id as string).toLowerCase().startsWith(reference));
  if (!order) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  try {
    const token = await createOrderLink(order.id as string, business.id as string);
    return NextResponse.json({ path: orderPath(token) });
  } catch {
    return NextResponse.json({ error: "We could not open your order just now. Tap again in a moment." }, { status: 500 });
  }
}

export const POST = withAuthority("shop/track", "POST", handlePOST);
