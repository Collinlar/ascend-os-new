// BVM's messaging desk (Communications C5). Two things only Ascend does:
// completing a customer's deletion request, and changing a business's
// daily marketing limit. Both are platform admin decisions, both need a
// reason or a record, and the database checks the admin again.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "complete_deletion" | "set_limit";
  requestId?: string;
  note?: string;
  businessId?: string;
  dailyMarketingCap?: number;
  reason?: string;
}

async function handlePOST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) {
    // The same answer for everyone who is not staff.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (admin.role !== "admin") {
    return NextResponse.json(
      { error: "Only a BVM admin can do this. Moderators can see the desk, not change it." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Try again." }, { status: 400 });
  }

  const db = supabaseServer();

  if (body.action === "complete_deletion") {
    if (!body.requestId) {
      return NextResponse.json({ error: "Pick the request to complete." }, { status: 422 });
    }
    const { data, error } = await db.rpc("complete_data_deletion", {
      p: { request_id: body.requestId, admin_person_id: admin.personId, note: (body.note ?? "").trim() || null },
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not complete that deletion. Nothing was changed. Try again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, outcome: data });
  }

  if (body.action === "set_limit") {
    const cap = Number(body.dailyMarketingCap);
    const reason = (body.reason ?? "").trim();
    if (!body.businessId) {
      return NextResponse.json({ error: "Pick the business." }, { status: 422 });
    }
    if (!Number.isInteger(cap) || cap < 0) {
      return NextResponse.json({ error: "The limit is a whole number of messages a day, 0 or more." }, { status: 422 });
    }
    if (reason.length < 10) {
      return NextResponse.json(
        { error: "Say why the limit is changing. It goes in the business's record." },
        { status: 422 }
      );
    }
    const { error } = await db.rpc("set_messaging_limit", {
      p: { business_id: body.businessId, daily_marketing_cap: cap, reason, admin_person_id: admin.personId },
    });
    if (error) {
      return NextResponse.json({ error: "We could not change that limit. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "That is not something this desk does." }, { status: 422 });
}

export const POST = withAuthority("admin/messaging", "POST", handlePOST);
