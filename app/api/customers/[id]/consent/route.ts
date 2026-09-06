// Recording that a customer agreed to marketing, or changed their mind.
//
// The record is the point. customer.marketing_consent is a boolean and a
// boolean cannot answer "were you allowed to message them in March": flip it
// back and the evidence is gone. Under the Ghana Data Protection Act a
// business has to be able to show that consent was given, so every change
// leaves a row behind (SEC-011).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { granted?: boolean; channel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const db = supabaseServer();
  const membership = await activeMembership<{ business_id: string }>(personId);
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to a business yet." },
      { status: 403 }
    );
  }

  const { data: customer } = await db
    .from("customer")
    .select("id")
    .eq("id", params.id)
    .eq("business_id", membership.business_id)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: "We could not find them." }, { status: 404 });
  }

  const { data, error } = await db.rpc("record_consent", {
    p: {
      business_id: membership.business_id,
      customer_id: params.id,
      purpose: "marketing",
      granted: body.granted !== false,
      channel: body.channel ?? "whatsapp",
      // Who said so and when. A merchant ticking a box on behalf of a
      // customer is a different kind of evidence from the customer ticking
      // it themselves, and the record should not pretend otherwise.
      source: "merchant_recorded",
      evidence: { recorded_by_person: personId, at: new Date().toISOString() },
    },
  });

  if (error) {
    console.error("consent failed:", error.message);
    return NextResponse.json(
      { error: "We could not save that just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ granted: data.granted });
}
