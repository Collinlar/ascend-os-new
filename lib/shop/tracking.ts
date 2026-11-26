// A customer's private link to their order (round 2, R5). Stored as a hash
// like an invoice link (0015, 0145): the plain token only ever exists in
// the link itself.

import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken, newAccessToken } from "@/lib/messaging/send";
import { readTwice } from "@/lib/documents/customer-link";

export async function createOrderLink(orderId: string, businessId: string, expiresInDays = 120): Promise<string> {
  const token = newAccessToken();
  const { error } = await supabaseServer().from("order_access_token").insert({
    token_hash: hashAccessToken(token),
    order_id: orderId,
    business_id: businessId,
    expires_at: new Date(Date.now() + expiresInDays * 864e5).toISOString(),
  });
  if (error) throw new Error(`order_link_failed: ${error.message}`);
  return token;
}

export function orderPath(token: string): string {
  return `/o/${token}`;
}

export type OrderLinkLookup =
  | { state: "ready"; orderId: string; businessId: string }
  | { state: "gone" }
  | { state: "unreachable" };

export async function lookUpOrderLink(token: string): Promise<OrderLinkLookup> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return { state: "gone" };
  const db = supabaseServer();
  const { data, error } = await readTwice(() =>
    db
      .from("order_access_token")
      .select("order_id, business_id, expires_at, revoked_at")
      .eq("token_hash", hashAccessToken(token))
      .maybeSingle()
  );
  if (error) return { state: "unreachable" };
  const row = data as { order_id: string; business_id: string; expires_at: string | null; revoked_at: string | null } | null;
  if (!row || row.revoked_at || (row.expires_at && new Date(row.expires_at) < new Date())) return { state: "gone" };
  return { state: "ready", orderId: row.order_id, businessId: row.business_id };
}

/** Short-lived links to report photos in the private bucket. */
export async function photoLinks(paths: string[], seconds = 600): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data } = await supabaseServer().storage.from("reports").createSignedUrls(paths, seconds);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}

/** The order's reference, as the shop and the customer both see it. */
export function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}
