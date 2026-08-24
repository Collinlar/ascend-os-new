// WhatsApp OTP: hashed at rest, 10 minute expiry, 5 attempts, resend
// throttled. Codes never appear in logs or analytics.

import { createHash, randomInt } from "crypto";
import { supabaseServer } from "@/lib/supabase";

const OTP_TTL_MINUTES = 10;
const RESEND_SECONDS = 60;
const HOURLY_LIMIT = 5;

function hashCode(code: string, phone: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export type RequestOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function createOtpChallenge(phoneE164: string): Promise<RequestOtpResult> {
  const db = supabaseServer();

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await db
    .from("otp_challenge")
    .select("created_at")
    .eq("phone_e164", phoneE164)
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false });

  if (recent && recent.length >= HOURLY_LIMIT) {
    return {
      ok: false,
      error: "Too many codes requested for this number. Try again in about an hour.",
    };
  }
  if (recent && recent.length > 0) {
    const last = new Date(recent[0].created_at).getTime();
    const wait = Math.ceil((last + RESEND_SECONDS * 1000 - Date.now()) / 1000);
    if (wait > 0) {
      return {
        ok: false,
        error: `A code is already on its way. You can request another in ${wait} seconds.`,
        retryAfterSeconds: wait,
      };
    }
  }

  const code = String(randomInt(100000, 1000000));
  const { error } = await db.from("otp_challenge").insert({
    phone_e164: phoneE164,
    code_hash: hashCode(code, phoneE164),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) return { ok: false, error: "We could not prepare your code. Tap to try again." };

  const sent = await sendWhatsAppOtp(phoneE164, code);
  if (!sent.delivered && !sent.devMode) {
    return { ok: false, error: "WhatsApp did not accept the message. Check the number and tap again." };
  }
  // Development convenience only: without a provider key the code is
  // surfaced to the caller so the flow stays testable end to end.
  return { ok: true, ...(sent.devMode ? { devCode: code } : {}) };
}

export type VerifyOtpResult =
  | { ok: true; challengeId: string }
  | { ok: false; error: string; exhausted?: boolean };

export async function verifyOtpChallenge(
  phoneE164: string,
  code: string
): Promise<VerifyOtpResult> {
  const db = supabaseServer();
  const { data: challenge, error: lookupError } = await db
    .from("otp_challenge")
    .select("id, code_hash, attempts, max_attempts, expires_at, consumed_at")
    .eq("phone_e164", phoneE164)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed query is not an expired code. Reporting it as one sends the
  // merchant round in circles asking for fresh codes that can never work,
  // and hides the real fault from whoever has to debug it.
  if (lookupError) {
    return {
      ok: false,
      error: "We could not check that code just now. Tap verify again in a moment.",
    };
  }
  if (!challenge) {
    return { ok: false, error: "That code has been used or has expired. Request a fresh one." };
  }
  if (new Date(challenge.expires_at) < new Date()) {
    return { ok: false, error: "That code has expired. Request a fresh one." };
  }
  if (challenge.attempts >= challenge.max_attempts) {
    return { ok: false, error: "Too many wrong tries. Request a fresh code.", exhausted: true };
  }

  await db
    .from("otp_challenge")
    .update({ attempts: challenge.attempts + 1 })
    .eq("id", challenge.id);

  if (challenge.code_hash !== hashCode(code.trim(), phoneE164)) {
    const left = challenge.max_attempts - challenge.attempts - 1;
    return {
      ok: false,
      error:
        left > 0
          ? `That code does not match. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong tries. Request a fresh code.",
      exhausted: left <= 0,
    };
  }

  // Claim atomically, so two requests racing the same code cannot both
  // pass. The caller releases it if anything downstream fails.
  const { data: claimed } = await db
    .from("otp_challenge")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { ok: false, error: "That code has just been used. Request a fresh one." };
  }

  return { ok: true, challengeId: challenge.id };
}

// Hands a claimed code back.
//
// A code is spent when it grants a session, not when it is checked. If
// anything after the check fails, nothing was granted, so burning the code
// only strands the person: they retype the code they were sent, are told it
// is already used, and have no way forward. This is what made a missing
// SESSION_SECRET look like an expired code.
export async function releaseOtpChallenge(challengeId: string): Promise<void> {
  try {
    await supabaseServer()
      .from("otp_challenge")
      .update({ consumed_at: null })
      .eq("id", challengeId);
  } catch {
    // Best effort. Failing to release must not mask the original error.
  }
}

// ---------------------------------------------------------------------------
// WhatsApp delivery through 360dialog. Falls back to dev mode when no key is
// configured so local development works without the provider.
// ---------------------------------------------------------------------------
async function sendWhatsAppOtp(
  phoneE164: string,
  code: string
): Promise<{ delivered: boolean; devMode: boolean }> {
  const apiKey = process.env.WHATSAPP_360DIALOG_API_KEY;
  if (!apiKey) {
    console.info(`[dev] WhatsApp OTP for ${phoneE164.slice(0, 7)}…: ${code}`);
    return { delivered: false, devMode: true };
  }

  const response = await fetch("https://waba.360dialog.io/v1/messages", {
    method: "POST",
    headers: {
      "D360-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phoneE164.replace("+", ""),
      type: "template",
      template: {
        namespace: process.env.WHATSAPP_TEMPLATE_NAMESPACE,
        name: "ascend_otp",
        language: { code: "en", policy: "deterministic" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  return { delivered: response.ok, devMode: false };
}
