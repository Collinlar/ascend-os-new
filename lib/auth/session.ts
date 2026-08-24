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

// Returns the authenticated person id, or null. Checks signature first,
// then the server-side row for expiry and revocation.
export async function currentPersonId(): Promise<string | null> {
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
  const { data } = await db
    .from("auth_session")
    .select("person_id, expires_at, revoked_at")
    .eq("id", sessionId)
    .single();

  if (!data || data.revoked_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.person_id;
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
