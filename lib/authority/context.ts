import "server-only";

// Who is asking, for which business, and what they may do there, resolved
// once per request (Phase 1, step 1b). The answer comes from the database's
// own definition, membership_authority (migration 0074), and the entitlement
// rule (0069), so TypeScript never re-implements either.

import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { effectiveAccess } from "@/lib/domains/entitlements";
import type { BusinessFrom } from "./policy";

export interface AuthorityContext {
  personId: string | null;
  businessId: string | null;
  membershipId: string | null;
  role: string | null;
  /** The membership exists, is active and has not expired. */
  active: boolean;
  /** Why not, when it cannot act: not_signed_in, no_business, not_a_member,
   *  membership_suspended, membership_removed, membership_expired. */
  whyNot: string | null;
  permissions: Set<string>;
  capabilities: Set<string>;
  locationScope: string[] | null;
}

const EMPTY = (personId: string | null, whyNot: string, businessId: string | null = null): AuthorityContext => ({
  personId,
  businessId,
  membershipId: null,
  role: null,
  active: false,
  whyNot,
  permissions: new Set(),
  capabilities: new Set(),
  locationScope: null,
});

// Only these tables can name the business in a route's [param]. A fixed list,
// so a policy typo cannot turn into a query against an arbitrary table.
const ENTITY_TABLES = new Set([
  "customer", "document", "shop_order", "service_booking",
  "device_registration", "payment", "staff_time_off",
]);

export async function resolveBusinessId(
  from: BusinessFrom,
  personId: string,
  input: {
    body: Record<string, unknown>;
    url: URL;
    params: Record<string, string> | undefined;
  }
): Promise<string | null> {
  if (from === "body") return typeof input.body.businessId === "string" ? input.body.businessId : null;
  if (from === "query") return input.url.searchParams.get("businessId");
  if (from === "active") {
    const m = await activeMembership<{ business_id: string }>(personId);
    return m?.business_id ?? null;
  }
  return recordColumn(from, "business_id", input);
}

// One column of the record a route acts on (the record named in its [param]
// or in the body). Used for the business it belongs to and, for "assigned"
// permissions, who it is assigned to. Table and column come from code, never
// from the request.
const READABLE_COLUMNS = new Set(["business_id", "assigned_membership_id"]);

export async function recordColumn(
  from: BusinessFrom,
  column: string,
  input: { body: Record<string, unknown>; params: Record<string, string> | undefined }
): Promise<string | null> {
  if (typeof from === "string") return null;
  if (!ENTITY_TABLES.has(from.table) || !READABLE_COLUMNS.has(column)) return null;
  const raw = "bodyField" in from ? input.body[from.bodyField] : input.params?.[from.param];
  const id = typeof raw === "string" ? raw : null;
  if (!id) return null;
  const { data } = await supabaseServer()
    .from(from.table)
    .select(column)
    .eq("id", id)
    .maybeSingle();
  const value = (data as Record<string, unknown> | null)?.[column];
  return typeof value === "string" ? value : null;
}

/** The role key of a membership in a business, or null if it is not one. */
export async function membershipRole(membershipId: string, businessId: string): Promise<string | null> {
  const { data } = await supabaseServer()
    .from("business_membership")
    .select("role:role_id(key)")
    .eq("id", membershipId)
    .eq("business_id", businessId)
    .maybeSingle();
  return ((data?.role as unknown as { key: string } | null)?.key) ?? null;
}

export async function resolveAuthority(
  personId: string | null,
  businessId: string | null
): Promise<AuthorityContext> {
  if (!personId) return EMPTY(null, "not_signed_in");
  if (!businessId) return EMPTY(personId, "no_business");

  const db = supabaseServer();
  // Any status: a suspended or expired membership is still this person's,
  // and the reason it cannot act is worth recording.
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("person_id", personId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!membership) return EMPTY(personId, "not_a_member", businessId);

  const [{ data: authority, error }, access] = await Promise.all([
    db.rpc("membership_authority", { p_membership: membership.id }),
    effectiveAccess(businessId).catch(() => null),
  ]);
  if (error || !authority) throw new Error(`membership_authority failed: ${error?.message ?? "no row"}`);

  const a = authority as {
    role: string | null;
    active: boolean;
    why_not: string | null;
    permissions: string[];
    location_scope: string[] | null;
  };

  return {
    personId,
    businessId,
    membershipId: membership.id as string,
    role: a.role,
    active: a.active,
    whyNot: a.why_not,
    permissions: new Set(a.permissions ?? []),
    capabilities: access?.capabilities ?? new Set(),
    locationScope: a.location_scope ?? null,
  };
}

export async function currentPerson(): Promise<string | null> {
  return currentPersonId();
}
