// Public order placement from Customer Web (CHN-004): no account, no app.
// The server resolves the business by slug, re-prices every line from the
// shared catalogue and applies the order atomically via place_shop_order.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { normalizePhone } from "@/lib/auth/phone";
import { withAuthority } from "@/lib/authority/with-authority";
import { businessStatus } from "@/lib/authority/business-status";

interface OrderBody {
  slug?: string;
  clientRef?: string;
  customerName?: string;
  customerPhone?: string;
  fulfilment?: "pickup" | "merchant_delivery";
  deliveryAddress?: string;
  /** One of the shop's delivery areas (R3); its fee is set by the shop. */
  deliveryArea?: string;
  /** GhanaPost GPS, like GA-123-4567 (R4). */
  deliveryGps?: string;
  /** Which of the shop's places to collect from (R4). */
  locationId?: string;
  /** Ticked "send me offers" at checkout (R4). Never assumed. */
  marketingOptIn?: boolean;
  lines?: Array<{ itemId: string; variantId?: string | null; quantity: number }>;
}

async function handlePOST(request: NextRequest) {
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

  // GhanaPost GPS: two letters, then the district and the place numbers.
  let gps: string | null = null;
  const rawGps = (body.deliveryGps ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (body.fulfilment === "merchant_delivery" && rawGps) {
    const m = /^([A-Z]{2})-?(\d{3,4})-?(\d{4})$/.exec(rawGps);
    if (!m) {
      return NextResponse.json(
        { error: "That GhanaPost GPS looks off. It looks like GA-123-4567, or leave it empty." },
        { status: 422 }
      );
    }
    gps = `${m[1]}-${m[2]}-${m[3]}`;
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

  // A suspended or closed business takes no new orders (Phase 1 step 1f).
  if ((await businessStatus(business.id)) !== "active") {
    return NextResponse.json(
      { error: "This business is not taking orders on Ascend right now." },
      { status: 403 }
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
          ? {
              address: body.deliveryAddress,
              ...(body.deliveryArea ? { area: String(body.deliveryArea).slice(0, 40) } : {}),
              ...(gps ? { gps } : {}),
            }
          : {},
      ...(body.fulfilment !== "merchant_delivery" && body.locationId && /^[0-9a-f-]{36}$/i.test(body.locationId)
        ? { location_id: body.locationId }
        : {}),
      marketing_opt_in: body.marketingOptIn === true,
      source: "shop_link",
      lines: body.lines.map((l) => ({
        item_id: l.itemId,
        quantity: l.quantity,
        ...(l.variantId && /^[0-9a-f-]{36}$/i.test(l.variantId) ? { variant_id: l.variantId } : {}),
      })),
    },
  });

  if (error) {
    // 0127: 'not_enough_stock|<left>|<name>'.
    const short = /not_enough_stock\|([\d.]+)\|(.+)$/.exec(error.message);
    if (short) {
      const left = Number(short[1]);
      const name = short[2];
      return NextResponse.json(
        {
          error:
            left <= 0
              ? `${name} just sold out. Remove it from your basket and order again.`
              : `Only ${left} ${name} left. Change the number in your basket and order again.`,
          shortOf: { name, left },
        },
        { status: 409 }
      );
    }
    // How the order reaches them, by the shop's settings (R3).
    const route: Record<string, string> = {
      delivery_area_unknown: "Pick one of the areas this shop delivers to, or choose pickup.",
      delivery_unavailable: "This shop is not delivering right now. Choose pickup instead.",
      pickup_unavailable: "This shop only delivers. Choose delivery and add where to bring it.",
    };
    const said = Object.keys(route).find((k) => error.message.includes(k));
    if (said) return NextResponse.json({ error: route[said] }, { status: 422 });
    // Sizes and the pickup place (R4).
    const sized = /size_(required|unavailable)\|(.+)$/.exec(error.message);
    if (sized) {
      return NextResponse.json(
        {
          error:
            sized[1] === "required"
              ? `Pick a size for ${sized[2]} and order again.`
              : `${sized[2]} in that size just became unavailable. Pick another size.`,
        },
        { status: 409 }
      );
    }
    if (error.message.includes("pickup_place_unknown")) {
      return NextResponse.json({ error: "Pick one of the shop's places to collect from." }, { status: 422 });
    }
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
    deliveryFee: data.delivery_fee ?? 0,
    businessName: business.name,
    duplicate: Boolean(data.duplicate),
  });
}

export const POST = withAuthority("shop/orders", "POST", handlePOST);
