// The receipt for a payment on an order, opened from the order's private
// link (round 2, R5). The receipt must belong to a payment on that order.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { lookUpOrderLink } from "@/lib/shop/tracking";
import { buildDocumentPdf } from "@/lib/documents/build-pdf";

export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const doc = request.nextUrl.searchParams.get("doc") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(doc)) return NextResponse.json({ error: "We could not find that receipt." }, { status: 404 });
  const link = await lookUpOrderLink(token);
  if (link.state !== "ready") {
    return NextResponse.json({ error: "This order link has expired. Ask the shop to send you a new one." }, { status: link.state === "unreachable" ? 503 : 404 });
  }
  const db = supabaseServer();
  const { data: pays } = await db
    .from("payment")
    .select("id")
    .eq("business_id", link.businessId)
    .eq("source_entity_type", "shop_order")
    .eq("source_entity_id", link.orderId);
  const payIds = (pays ?? []).map((p) => p.id as string);
  const { data: receipt } = payIds.length
    ? await db.from("document").select("id").eq("id", doc).eq("type", "receipt").not("number", "is", null).in("payment_id", payIds).maybeSingle()
    : { data: null };
  if (!receipt) return NextResponse.json({ error: "We could not find that receipt on this order." }, { status: 404 });
  const built = await buildDocumentPdf(receipt.id as string);
  if (!built) return NextResponse.json({ error: "We could not find that receipt." }, { status: 404 });
  return new NextResponse(built.bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${built.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

export const GET = withAuthority("order-link/receipt", "GET", handleGET);
