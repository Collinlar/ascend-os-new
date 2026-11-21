// Approve or turn down a waiting stock count (Inventory Core I4, 0129).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { businessId?: string; countId?: string; approve?: boolean; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.businessId || !body.countId || typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "That did not go through. Refresh and try again." }, { status: 422 });
  }
  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  const { data, error } = await db.rpc("decide_stock_count", {
    p: { business_id: body.businessId, count_id: body.countId, decided_by: membership.id, approve: body.approve, note: body.note ?? "" },
  });
  if (error) {
    if (/second_person_required/.test(error.message)) {
      return NextResponse.json({ error: "This count writes off more than GHS 500, so someone other than the person who counted must approve it." }, { status: 403 });
    }
    if (/permission_denied/.test(error.message)) {
      return NextResponse.json({ error: "Only the owner or a manager can decide a count." }, { status: 403 });
    }
    if (/count_not_found/.test(error.message)) {
      return NextResponse.json({ error: "We could not find that count. Refresh and try again." }, { status: 404 });
    }
    return NextResponse.json({ error: "We could not save that just now. Tap again in a moment." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/count/decide", "POST", handlePOST);
