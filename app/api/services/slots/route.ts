// Free slots for a service on a date. Public: a customer choosing a time
// has no account (SRV-005). Returns only future, unbooked slots.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const itemId = params.get("itemId");
  const membershipId = params.get("membershipId");
  const date = params.get("date");

  if (!itemId || !membershipId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pick a service and a day." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data, error } = await db.rpc("available_slots", {
    p_item_id: itemId,
    p_membership_id: membershipId,
    p_date: date,
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not load the times just now. Tap again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    slots: (data ?? []).map((s: { slot_start: string; slot_end: string }) => ({
      start: s.slot_start,
      end: s.slot_end,
    })),
  });
}
