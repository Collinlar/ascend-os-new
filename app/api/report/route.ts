// A customer reporting a problem with a business (Risk and Trust R4, 0114).
//
// Public: no account. The business is never taken from the request. It is
// found from the document link or the shop slug the customer is looking
// at. One phone (an anonymous cookie) or one number can send 3 reports a
// day; the database counts. A report is something for BVM to read. It
// changes nothing about the business by itself.

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import { normalizePhone } from "@/lib/auth/phone";
import { lookUpDocumentLink } from "@/lib/documents/customer-link";
import { withAuthority } from "@/lib/authority/with-authority";
import { REPORT_REASONS, REPORTER_COOKIE, type ReportSource } from "@/lib/risk/reports";

export const dynamic = "force-dynamic";

interface Body {
  source?: ReportSource;
  token?: string;
  slug?: string;
  reason?: string;
  detail?: string;
  phone?: string;
}

const REASONS = new Set<string>(REPORT_REASONS.map((r) => r.key));

async function handlePOST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap send again." }, { status: 400 });
  }

  if (!body.reason || !REASONS.has(body.reason)) {
    return NextResponse.json({ error: "Pick what went wrong, then send." }, { status: 422 });
  }
  const detail = (body.detail ?? "").trim();
  if (detail.length > 600) {
    return NextResponse.json(
      { error: "Keep it under 600 characters. The main points are enough." },
      { status: 422 }
    );
  }
  let phone: string | null = null;
  if ((body.phone ?? "").trim()) {
    const p = normalizePhone(body.phone as string);
    if (!p.ok || !p.e164) return NextResponse.json({ error: p.error }, { status: 422 });
    phone = p.e164;
  }

  // Which business, from what the customer is looking at.
  const db = supabaseServer();
  let businessId: string | null = null;
  let documentId: string | null = null;
  if (body.source === "invoice" && body.token) {
    const link = await lookUpDocumentLink(body.token);
    if (link.state === "unreachable") {
      return NextResponse.json(
        { error: "We could not reach Ascend just now. Your report is not sent yet. Tap send again." },
        { status: 503 }
      );
    }
    if (link.state === "ready") {
      businessId = link.access.business_id;
      documentId = link.access.document_id;
    }
  } else if ((body.source === "shop" || body.source === "booking") && body.slug) {
    const { data, error } = await db.from("business").select("id").eq("shop_slug", body.slug).maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: "We could not reach Ascend just now. Your report is not sent yet. Tap send again." },
        { status: 503 }
      );
    }
    businessId = (data?.id as string | undefined) ?? null;
  }
  if (!businessId) {
    return NextResponse.json(
      { error: "We could not tell which business this is about. Open the link you were sent and report from there." },
      { status: 404 }
    );
  }

  // The anonymous key: the cookie's value is kept only as a hash.
  const existing = request.cookies.get(REPORTER_COOKIE)?.value;
  const raw = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : randomBytes(16).toString("hex");
  const reporterKey = createHash("sha256").update("report:" + raw).digest("hex");

  const { data, error } = await db.rpc("submit_customer_report", {
    p: {
      business_id: businessId,
      document_id: documentId,
      source: body.source,
      reason: body.reason,
      detail: detail || null,
      reporter_phone: phone,
      reporter_key: reporterKey,
    },
  });
  if (error) {
    return NextResponse.json(
      { error: "Your report did not go through. Nothing was sent. Tap send again." },
      { status: 500 }
    );
  }

  const outcome = data as { status: string };
  const response =
    outcome.status === "limited"
      ? NextResponse.json(
          {
            error:
              "You have sent 3 reports today. We have all of them, and a person at Ascend will read each one.",
          },
          { status: 429 }
        )
      : NextResponse.json({ ok: true });
  if (raw !== existing) {
    response.cookies.set(REPORTER_COOKIE, raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/report",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const POST = withAuthority("report", "POST", handlePOST);
