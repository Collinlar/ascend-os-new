// Run an MOT on demand. The review is a snapshot of operating condition,
// so a business can run one before a lender meeting rather than waiting for
// the quarterly cycle.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("business_id, role:role_id(key)")
    .eq("person_id", personId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to a business yet." },
      { status: 403 }
    );
  }

  const roleKey = (membership.role as unknown as { key: string } | null)?.key;
  if (roleKey !== "owner" && roleKey !== "manager") {
    return NextResponse.json(
      { error: "Only the owner or a manager can run a review." },
      { status: 403 }
    );
  }

  const { data, error } = await db.rpc("run_mot", {
    p_business: membership.business_id,
    p_days: 90,
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not run the review just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    overall: data.overall,
    actionCount: Array.isArray(data.actions) ? data.actions.length : 0,
  });
}
