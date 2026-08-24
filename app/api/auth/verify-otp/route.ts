import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth/phone";
import { releaseOtpChallenge, verifyOtpChallenge } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

// Verifies the WhatsApp code, then finds or creates the person identity
// (one person across all contexts, IDN-001) and opens a session.
export async function POST(request: NextRequest) {
  let body: { phone?: string; code?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap verify again." },
      { status: 400 }
    );
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone.ok) {
    return NextResponse.json({ error: phone.error }, { status: 422 });
  }
  if (!body.code || !/^\d{6}$/.test(body.code.trim())) {
    return NextResponse.json(
      { error: "Enter the 6 digit code from your WhatsApp." },
      { status: 422 }
    );
  }

  const verified = await verifyOtpChallenge(phone.e164!, body.code);
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error, exhausted: verified.exhausted ?? false },
      { status: 401 }
    );
  }

  // From here the code is claimed. Anything that fails below must hand it
  // back, or a server side fault leaves the person holding a code the
  // system now refuses (SEC-003).
  try {
    return await completeSignIn(body, phone.e164!, verified.challengeId);
  } catch {
    await releaseOtpChallenge(verified.challengeId);
    return NextResponse.json(
      {
        error:
          "We could not finish signing you in. Your code still works, tap verify again.",
      },
      { status: 500 }
    );
  }
}

async function completeSignIn(
  body: { fullName?: string },
  phoneE164: string,
  challengeId: string
) {
  const db = supabaseServer();
  const { data: existing } = await db
    .from("person")
    .select("id, full_name")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  let personId: string;
  let isNew = false;

  if (existing) {
    personId = existing.id;
  } else {
    const fullName = (body.fullName ?? "").trim();
    if (!fullName) {
      // They simply have not told us their name yet. Keep the code alive so
      // they can finish rather than start over.
      await releaseOtpChallenge(challengeId);
      return NextResponse.json(
        { error: "Tell us your name so your team knows who did what.", needsName: true },
        { status: 422 }
      );
    }
    const { data: created, error } = await db
      .from("person")
      .insert({
        full_name: fullName,
        phone_e164: phoneE164,
        phone_verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      await releaseOtpChallenge(challengeId);
      return NextResponse.json(
        { error: "We could not save your details just now. Tap verify again." },
        { status: 500 }
      );
    }
    personId = created.id;
    isNew = true;
  }

  await createSession(personId);

  // Existing members go straight to their businesses; new people continue
  // to business creation.
  const { data: memberships } = await db
    .from("business_membership")
    .select("business_id")
    .eq("person_id", personId)
    .eq("status", "active");

  return NextResponse.json({
    verified: true,
    isNew,
    hasBusiness: (memberships?.length ?? 0) > 0,
  });
}
