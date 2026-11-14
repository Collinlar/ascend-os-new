// Confirming it is you before a sensitive action (Phase 1 step 1f).
//
// Some actions, such as sharing the business record with a bank or partner,
// need a WhatsApp code confirmed in the last 10 minutes; signing in counts.
// This sends a fresh code to the signed-in person's own number and, once it
// is entered, marks this session as freshly confirmed. It uses the same code
// machinery as signing in, so the same limits and expiry apply.

import { NextRequest, NextResponse } from "next/server";
import { currentSession, markSessionConfirmed } from "@/lib/auth/session";
import { createOtpChallenge, releaseOtpChallenge, verifyOtpChallenge } from "@/lib/auth/otp";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

async function handlePOST(request: NextRequest) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { action?: "request" | "verify"; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  // Only ever the person's own number, never one from the request.
  const { data: person } = await supabaseServer()
    .from("person")
    .select("phone_e164")
    .eq("id", session.personId)
    .maybeSingle();
  const phone = person?.phone_e164 as string | null | undefined;
  if (!phone) {
    return NextResponse.json(
      { error: "There is no WhatsApp number on your account to send a code to." },
      { status: 422 }
    );
  }

  if (body.action === "request") {
    const sent = await createOtpChallenge(phone);
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error, retryAfterSeconds: sent.retryAfterSeconds }, { status: 429 });
    }
    return NextResponse.json({ sent: true, ...(sent.devCode ? { devCode: sent.devCode } : {}) });
  }

  if (body.action === "verify") {
    if (!body.code || !/^\d{6}$/.test(body.code.trim())) {
      return NextResponse.json({ error: "Enter the 6 digit code from your WhatsApp." }, { status: 422 });
    }
    const checked = await verifyOtpChallenge(phone, body.code);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 422 });
    }
    // The code is spent only if the confirmation is recorded; otherwise hand
    // it back, as signing in does, so the person is not left with a used code.
    if (!(await markSessionConfirmed(session.sessionId))) {
      await releaseOtpChallenge(checked.challengeId);
      return NextResponse.json({ error: "We could not confirm that just now. Enter the code again." }, { status: 500 });
    }
    return NextResponse.json({ confirmed: true });
  }

  return NextResponse.json({ error: "That is not something we can do here." }, { status: 422 });
}

export const POST = withAuthority("auth/step-up", "POST", handlePOST);
