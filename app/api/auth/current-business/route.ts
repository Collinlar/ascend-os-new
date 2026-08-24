import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { chooseBusiness } from "@/lib/auth/current-business";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Which of your businesses to open.
//
// The cookie is only a selector, so this is where it earns the right to be
// one: membership is checked here on the way in, and checked again on every
// read. Naming a business you do not belong to gets you nothing.
export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Sign in to pick up where you left off." },
      { status: 401 }
    );
  }

  let body: { businessId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.businessId) {
    return NextResponse.json({ error: "Pick one of your businesses." }, { status: 422 });
  }

  const { data: membership } = await supabaseServer()
    .from("business_membership")
    .select("id")
    .eq("person_id", personId)
    .eq("business_id", body.businessId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of that business." },
      { status: 403 }
    );
  }

  chooseBusiness(body.businessId);
  return NextResponse.json({ businessId: body.businessId });
}
