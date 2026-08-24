// Public order placement from Customer Web (CHN-004): no account, no app.
// The server resolves the business by slug, re-prices every line from the
// shared catalogue and applies the order atomically via place_shop_order.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { normalizePhone } from "@/lib/auth/phone";

interface OrderBody {
  slug?: string;
  clientRef?: string;
  customerName?: string;
  customerPhone?: string;
  fulfilment?: "pickup" | "merchant_delivery";
  deliveryAddress?: string;
  lines?: Array<{ itemId: string; quantity: number }>;
}

export async function POST(request: NextRequest) {
  let body: OrderBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap place order again." },
      { status: 400 }
    );
  }

  if (!body.slug || !body.clientRef) {
    return NextResponse.json(
      { error: "That did not go through. Refresh the shop page and try again." },
      { status: 400 }
    );
  }
  const name = (body.customerName ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Tell the business your name so they know who ordered." },
      { status: 422 }
    );
  }
  const phone = normalizePhone(body.customerPhone ?? "");
  if (!phone.ok) {
    return NextResponse.json({ error: phone.error }, { status: 422 });
  }
  if (!body.lines?.length) {
    return NextResponse.json(
      { error: "Your basket is empty. Add something first." },
      { status: 422 }
    );
  }
  if (body.fulfilment === "merchant_delivery" && !(body.deliveryAddress ?? "").trim()) {
    return NextResponse.json(
      { error: "Add a delivery address, or choose pickup instead." },
      { status: 422 }
    );
  }

  const db = supabaseServer();
  const { data: business } = await db
    .from("business")
    .select("id, name")
    .eq("shop_slug", body.slug)
    .maybeSingle();
  if (!business) {
    return NextResponse.json(
      { error: "This shop link is not active. Check with the business." },
      { status: 404 }
    );
  }

  // The page is gated the same way, but an order endpoint is a door of its
  // own and a shop that has been switched off must not still take money
  // through it.
  const access = await effectiveAccess(business.id).catch(() => null);
  if (!access?.capabilities.has("shop.storefront")) {
    return NextResponse.json(
      { error: "This shop is not taking orders right now." },
      { status: 404 }
    );
  }

  const { data, error } = await db.rpc("place_shop_order", {
    p: {
      business_id: business.id,
      client_ref: body.clientRef,
      customer_name: name,
      customer_phone: phone.e164,
      fulfilment: body.fulfilment ?? "pickup",
      delivery_detail:
        body.fulfilment === "merchant_delivery"
          ? { address: body.deliveryAddress }
          : {},
      source: "shop_link",
      lines: body.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
    },
  });

  if (error) {
    const unavailable = /item unavailable|no price/.test(error.message);
    return NextResponse.json(
      {
        error: unavailable
          ? "One item in your basket just became unavailable. Remove it and order again."
          : "We could not place your order just now. Tap again in a moment.",
      },
      { status: unavailable ? 409 : 500 }
    );
  }

  return NextResponse.json({
    orderId: data.order_id,
    total: data.total,
    businessName: business.name,
    duplicate: Boolean(data.duplicate),
  });
}
