// A customer's private link to their booking (round 4, S2). Stored as a
// hash like an order link (0145, 0151): the plain token only ever exists
// in the link itself.

import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken, newAccessToken } from "@/lib/messaging/send";
import { readTwice } from "@/lib/documents/customer-link";

export async function createBookingLink(bookingId: string, businessId: string, expiresInDays = 180): Promise<string> {
  const token = newAccessToken();
  const { error } = await supabaseServer().from("booking_access_token").insert({
    token_hash: hashAccessToken(token),
    booking_id: bookingId,
    business_id: businessId,
    expires_at: new Date(Date.now() + expiresInDays * 864e5).toISOString(),
  });
  if (error) throw new Error(`booking_link_failed: ${error.message}`);
  return token;
}

export function bookingPath(token: string): string {
  return `/bk/${token}`;
}

export type BookingLinkLookup =
  | { state: "ready"; bookingId: string; businessId: string }
  | { state: "gone" }
  | { state: "unreachable" };

export async function lookUpBookingLink(token: string): Promise<BookingLinkLookup> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return { state: "gone" };
  const db = supabaseServer();
  const { data, error } = await readTwice(() =>
    db.from("booking_access_token").select("booking_id, business_id, expires_at, revoked_at").eq("token_hash", hashAccessToken(token)).maybeSingle()
  );
  if (error) return { state: "unreachable" };
  const row = data as { booking_id: string; business_id: string; expires_at: string | null; revoked_at: string | null } | null;
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) < new Date())) return { state: "gone" };
  return { state: "ready", bookingId: row.booking_id, businessId: row.business_id };
}

/** The booking's reference, as the business and the customer both see it. */
export function bookingRef(bookingId: string): string {
  return `BK-${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
