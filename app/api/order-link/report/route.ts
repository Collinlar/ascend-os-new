// A customer reporting a problem with their order, from its private link
// (round 2, R5, decision 7). Order problems go to the shop first, with up
// to three photos; Ascend reads them if the shop has not sorted it in 48
// hours. A problem with the shop itself goes to Ascend at once.

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { lookUpOrderLink } from "@/lib/shop/tracking";
import { REPORTER_COOKIE } from "@/lib/risk/reports";
import { ORDER_ISSUES } from "@/lib/shop/order-issues";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Body {
  token?: string;
  issue?: string;
  detail?: string;
  /** Up to three JPEGs the browser made, as base64. */
  photos?: string[];
}

const MAX_PHOTO = 450_000;

async function handlePOST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap send again." }, { status: 400 });
  }
  const issue = ORDER_ISSUES.find((i) => i.key === body.issue);
  if (!issue) return NextResponse.json({ error: "Pick what happened, then send." }, { status: 422 });
  const detail = (body.detail ?? "").trim();
  if (detail.length > 600) {
    return NextResponse.json({ error: "Keep it under 600 characters. The main points are enough." }, { status: 422 });
  }
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  if (photos.length > 3) return NextResponse.json({ error: "Three photos are enough. Remove one and send again." }, { status: 422 });
  const bytes = photos.map((p) => Buffer.from(String(p), "base64"));
  if (bytes.some((b) => b.byteLength < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b.byteLength > MAX_PHOTO)) {
    return NextResponse.json({ error: "One of the photos did not go through. Take it again and send." }, { status: 422 });
  }

  const link = await lookUpOrderLink(body.token ?? "");
  if (link.state === "unreachable") {
    return NextResponse.json({ error: "We could not reach Ascend just now. Nothing was sent. Tap send again." }, { status: 503 });
  }
  if (link.state !== "ready") {
    return NextResponse.json({ error: "This order link has expired. Ask the shop to send you a new one." }, { status: 404 });
  }

  const db = supabaseServer();
  const { data: order } = await db
    .from("shop_order")
    .select("id, customer:customer_id(phone_e164)")
    .eq("id", link.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "We could not find this order." }, { status: 404 });

  // Photos first, under the business, in the private bucket. Removed again
  // if the report does not go in.
  const paths: string[] = [];
  for (const b of bytes) {
    const path = `${link.businessId}/${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from("reports").upload(path, b, { contentType: "image/jpeg", upsert: false });
    if (error) {
      if (paths.length) await db.storage.from("reports").remove(paths);
      return NextResponse.json({ error: "Your photos did not upload. Send without them, or try again in a moment." }, { status: 502 });
    }
    paths.push(path);
  }

  const existing = request.cookies.get(REPORTER_COOKIE)?.value;
  const raw = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : randomBytes(16).toString("hex");
  const reporterKey = createHash("sha256").update("report:" + raw).digest("hex");
  const phone = (order.customer as unknown as { phone_e164: string | null } | null)?.phone_e164 ?? null;

  const { data, error } = await db.rpc("submit_customer_report", {
    p: {
      business_id: link.businessId,
      shop_order_id: link.orderId,
      source: "order",
      reason: issue.reason,
      detail: detail || null,
      reporter_phone: phone,
      reporter_key: reporterKey,
      photos: paths,
    },
  });
  const outcome = data as { status: string; report_id?: string; with_shop?: boolean; escalate_at?: string } | null;
  if (error || !outcome || outcome.status !== "received") {
    if (paths.length) await db.storage.from("reports").remove(paths);
    if (outcome?.status === "limited") {
      return NextResponse.json({ error: "You have sent 3 reports today. We have them all, and each one is read." }, { status: 429 });
    }
    return NextResponse.json({ error: "Your report did not go through. Nothing was sent. Tap send again." }, { status: 500 });
  }

  const response = NextResponse.json({
    ok: true,
    reportId: outcome.report_id,
    withShop: Boolean(outcome.with_shop),
    escalateAt: outcome.escalate_at ?? null,
  });
  if (raw !== existing) {
    response.cookies.set(REPORTER_COOKIE, raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/order-link",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const POST = withAuthority("order-link/report", "POST", handlePOST);
