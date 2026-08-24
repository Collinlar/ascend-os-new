import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";
import { forgetBusinessChoice } from "@/lib/auth/current-business";

export const dynamic = "force-dynamic";

// Signing out.
//
// endSession has existed since sessions did and nothing has ever called it,
// which meant a session could be opened and never closed. On a phone that
// gets handed around a shop, or a laptop in an internet cafe, that is not a
// missing convenience. It is the previous person still being signed in.
//
// The server side row is revoked as well as the cookie cleared, so a token
// copied before signing out stops working too (SEC-005).
export async function POST() {
  await endSession();
  forgetBusinessChoice();
  return NextResponse.json({ signedOut: true });
}
