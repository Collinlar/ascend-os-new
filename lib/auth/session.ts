// Platform sessions. The cookie carries a signed reference to a server-side
// session row, so a stolen token can be revoked instantly (SEC-003, SEC-005).

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase";

const COOKIE_NAME = "ascend_session";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not configured");
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function createSession(personId: string): Promise<void> {
  const db = supabaseServer();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);

  const { data, error } = await db
    .from("auth_session")
    .insert({ person_id: personId, expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`Session create failed: ${error.message}`);

  const token = `${data.id}.${sign(data.id)}`;
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export interface CurrentSession {
  sessionId: string;
  personId: string;
  /** When this session last confirmed a fresh WhatsApp code: signing in, or
   *  the latest step-up (Phase 1 step 1f). */
  confirmedAt: Date;
}

// The authenticated session, or null. Checks signature first, then the
// server-side row for expiry and revocation.
export async function currentSession(): Promise<CurrentSession | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const sessionId = token.slice(0, dot);
  const givenSig = token.slice(dot + 1);
  const expected = sign(sessionId);
  const a = Buffer.from(givenSig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const db = supabaseServer();
  let { data, error } = await db
    .from("auth_session")
    .select("person_id, expires_at, revoked_at, created_at, step_up_at")
    .eq("id", sessionId)
    .single();
  // step_up_at arrives with migration 0081. If this code runs first, ask
  // without it rather than treat every session as signed out.
  if (error && /step_up_at/.test(error.message)) {
    ({ data, error } = await db
      .from("auth_session")
      .select("person_id, expires_at, revoked_at, created_at")
      .eq("id", sessionId)
      .single());
  }

  if (!data || data.revoked_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  const created = new Date(data.created_at as string);
  const steppedUp = data.step_up_at ? new Date(data.step_up_at as string) : null;
  return {
    sessionId,
    personId: data.person_id as string,
    confirmedAt: steppedUp && steppedUp > created ? steppedUp : created,
  };
}

// Returns the authenticated person id, or null.
export async function currentPersonId(): Promise<string | null> {
  return (await currentSession())?.personId ?? null;
}

// Records that this session has just confirmed a fresh code (step-up).
// Returns false if it could not be recorded.
export async function markSessionConfirmed(sessionId: string): Promise<boolean> {
  const { error } = await supabaseServer()
    .from("auth_session")
    .update({ step_up_at: new Date().toISOString() })
    .eq("id", sessionId);
  return !error;
}

export async function endSession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    const sessionId = token.slice(0, token.lastIndexOf("."));
    const db = supabaseServer();
    await db
      .from("auth_session")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId);
  }
  cookies().delete(COOKIE_NAME);
}
