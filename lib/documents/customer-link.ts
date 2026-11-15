// Opening a customer's secure document link (the page and its PDF).
//
// Three outcomes, kept apart on purpose:
//   ready        the link is live; here is what it opens
//   gone         no such link, or it was revoked or has expired
//   unreachable  we could not ask the database just now
//
// The database client reports a dropped connection as an error value, not
// a thrown exception, so a check that only looks at `data` cannot tell
// "this link does not exist" from "the network blinked". Before this, a
// customer on a weak connection was told their invoice did not exist.
// One quick retry absorbs most blips; if that fails too, the caller says
// so and offers to try again.

import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";

export interface LinkAccess {
  document_id: string;
  business_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number | null;
}

export type LinkLookup =
  | { state: "ready"; access: LinkAccess }
  | { state: "gone"; why: "unknown" | "revoked" | "expired" }
  | { state: "unreachable" };

const RETRY_DELAY_MS = 400;

/** Runs a read, and once more after a short pause if it errored. */
export async function readTwice<T>(
  run: () => PromiseLike<{ data: T; error: unknown }>
): Promise<{ data: T; error: unknown }> {
  try {
    const first = await run();
    if (!first.error) return first;
  } catch {
    // fall through to the retry
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  try {
    return await run();
  } catch (error) {
    return { data: null as T, error };
  }
}

export async function lookUpDocumentLink(token: string): Promise<LinkLookup> {
  const db = supabaseServer();
  const { data, error } = await readTwice(() =>
    db
      .from("document_access_token")
      .select("document_id, business_id, expires_at, revoked_at, view_count")
      .eq("token_hash", hashAccessToken(token))
      .maybeSingle()
  );
  if (error) return { state: "unreachable" };
  const access = data as LinkAccess | null;
  if (!access) return { state: "gone", why: "unknown" };
  if (access.revoked_at) return { state: "gone", why: "revoked" };
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { state: "gone", why: "expired" };
  }
  return { state: "ready", access };
}
