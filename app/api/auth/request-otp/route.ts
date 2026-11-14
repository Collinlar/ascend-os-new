import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/auth/phone";
import { createOtpChallenge } from "@/lib/auth/otp";
import { withAuthority } from "@/lib/authority/with-authority";

async function handlePOST(request: NextRequest) {
  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap send again." },
      { status: 400 }
    );
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone.ok) {
    return NextResponse.json({ error: phone.error }, { status: 422 });
  }

  const result = await createOtpChallenge(phone.e164!);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, retryAfterSeconds: result.retryAfterSeconds },
      { status: 429 }
    );
  }

  return NextResponse.json({
    sent: true,
    phone: phone.e164,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
}

export const POST = withAuthority("auth/request-otp", "POST", handlePOST);
