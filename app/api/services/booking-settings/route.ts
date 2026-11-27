// How long before a booking the customer can still change it themselves,
// and answering "Nothing fits" requests (round 4, S2). Each is checked
// again in the database.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  let body: { businessId?: string; action?: string; hours?: number; wishId?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId ?? "")
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  if (body.action === "set_window") {
    const { error } = await db.rpc("set_booking_settings", { p: { business_id: body.businessId, actor_membership_id: membership.id, change_window_hours: Number(body.hours) } });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/window_out_of_range/.test(error.message)) return NextResponse.json({ error: "Pick between 0 hours and 7 days." }, { status: 422 });
      if (/function .* does not exist|Could not find the function/.test(error.message)) return NextResponse.json({ error: "This switches on after this week's update." }, { status: 503 });
      return NextResponse.json({ error: "That did not save. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json({ saved: true });
  }

  if (body.action === "answer_wish") {
    const { error } = await db.rpc("answer_booking_wish", { p: { business_id: body.businessId, actor_membership_id: membership.id, wish_id: body.wishId, status: body.status === "closed" ? "closed" : "answered" } });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/wish_not_found/.test(error.message)) return NextResponse.json({ error: "Someone already answered this one." }, { status: 409 });
      return NextResponse.json({ error: "That did not save. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json({ done: true });
  }

  return NextResponse.json({ error: "We could not tell what to do." }, { status: 422 });
}

export const POST = withAuthority("services/booking-settings", "POST", handlePOST);
