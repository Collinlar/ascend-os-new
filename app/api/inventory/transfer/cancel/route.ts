// Call back goods that have not arrived (Advanced Inventory A1, 0131). They
// return to the place they left. Owners and managers only.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  }
  let body: { businessId?: string; transferId?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.businessId || !body.transferId) {
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

  const { data, error } = await db.rpc("cancel_stock_transfer", {
    p: { business_id: body.businessId, transfer_id: body.transferId, cancelled_by: membership.id, note: body.note ?? "" },
  });
  if (error) {
    const denied = deniedByDatabase(error);
    if (denied) return denied;
    if (/transfer_not_found/.test(error.message)) {
      return NextResponse.json({ error: "We could not find those goods. Refresh and try again." }, { status: 404 });
    }
    return NextResponse.json({ error: "We could not call it back just now. Nothing has moved. Tap again." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/transfer/cancel", "POST", handlePOST);
