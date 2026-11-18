// The owner appealing a risk decision (Risk and Trust R5, 0115).
//
// A "session" route on purpose. A suspended business is refused every
// change at the member layer, and an appeal is the one thing it must still
// be able to send. The database checks that this person owns this business
// and that there is something to appeal.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

const REFUSED: Array<[RegExp, number, string]> = [
  [/owner_only/, 403, "Only the owner of the business can appeal."],
  [/nothing_to_appeal/, 409, "Nothing on your business is limited now, so there is nothing to appeal."],
  [/appeal_already_open/, 409, "Your appeal is already with Ascend. The answer shows on this page."],
  [/appeal_too_short/, 422, "Tell Ascend a little more. A few sentences is enough."],
  [/appeal_too_long/, 422, "Keep it under 2,000 characters. Send documents on WhatsApp if Ascend asks."],
];

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Sign in again to send your appeal." }, { status: 401 });
  }
  let body: { businessId?: string; appealText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap send again." }, { status: 400 });
  }
  if (!body.businessId) {
    return NextResponse.json({ error: "Open this page from your business and try again." }, { status: 422 });
  }

  const { data, error } = await supabaseServer().rpc("submit_risk_appeal", {
    p: { business_id: body.businessId, person_id: personId, appeal_text: (body.appealText ?? "").trim() },
  });
  if (error) {
    const known = REFUSED.find(([re]) => re.test(error.message));
    if (known) return NextResponse.json({ error: known[2] }, { status: known[1] });
    return NextResponse.json(
      { error: "Your appeal did not go through. Nothing was sent. Tap send again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, appeal: data });
}

export const POST = withAuthority("business/risk-appeal", "POST", handlePOST);
