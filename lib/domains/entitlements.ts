// Entitlement engine: the authoritative commercial access layer (§16.3).
// Effective access is calculated from all active purchases and sponsorships
// (ENT-011). Overlapping entitlements never double-bill or contradict
// (ENT-012, XST-001, MON-004). Enforcement is server-side only (ENT-017).

import { supabaseServer } from "@/lib/supabase";
import type { ProductSetKey, UUID } from "./types";

// Kept only as the fallback for a database that has not run migration 0044.
// The register is product_set_capability, in the database, where a query can
// reach it; this map was a second source of truth nobody could query and it
// is not the one to trust.
const FALLBACK_ESSENTIALS: Record<ProductSetKey, string[]> = {
  pos: [
    "pos.sell",
    "pos.tills",
    "pos.shifts",
    "pos.refunds",
    "catalogue.core",
    "inventory.basic",
    "customers.core",
    "documents.receipts",
    "people.cashiers",
    "office.basic_shifts",
    "office.basic_attendance",
  ],
  shop: [
    "shop.storefront",
    "shop.orders",
    "catalogue.core",
    "customers.core",
    "payments.core",
    "documents.core",
    "inventory.connection",
    "office.basic_order_assignment",
  ],
  services: [
    "services.bookings",
    "services.basic_availability",
    "customers.core",
    "documents.core",
    "payments.deposits",
    "people.provider_assignment",
  ],
  documents: [
    "documents.issue",
    "documents.core",
    "customers.basic",
    "payments.recording",
    "business.identity",
  ],
  office: ["office.work", "work.core", "work.approvals", "people.core"],
  discover: ["discover.listing"],
  readiness: ["readiness.score"],
};

export interface EffectiveAccess {
  businessId: UUID;
  productSets: ProductSetKey[];
  capabilities: Set<string>;
  capacity: Record<string, number>; // merged: max wins across overlapping grants
  inGrace: boolean;
}

export async function effectiveAccess(businessId: UUID): Promise<EffectiveAccess> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("entitlement")
    .select("product_set_key, capability_key, capacity, status, grace_until")
    .eq("business_id", businessId)
    .in("status", ["active", "grace"]);

  if (error) throw new Error(`Entitlement lookup failed: ${error.message}`);

  const productSets = new Set<ProductSetKey>();
  const capabilities = new Set<string>();
  const capacity: Record<string, number> = {};
  let inGrace = false;

  for (const row of data ?? []) {
    if (row.status === "grace") inGrace = true;
    if (row.product_set_key) productSets.add(row.product_set_key as ProductSetKey);
    if (row.capability_key) capabilities.add(row.capability_key);
    if (row.capacity) {
      for (const [key, value] of Object.entries(row.capacity as Record<string, number>)) {
        capacity[key] = Math.max(capacity[key] ?? 0, value);
      }
    }
  }

  // The register decides what a set grants, including the essentials it
  // borrows from other domains (XST-001). Asking the database rather than a
  // constant is what lets a till have receipts without owning Documents.
  let resolved = false;
  try {
    const { data: rows, error: capError } = await db.rpc("business_capabilities", {
      p_business: businessId,
    });
    if (!capError && rows) {
      for (const row of rows as Array<{ capability_key: string }>) {
        capabilities.add(row.capability_key);
      }
      resolved = true;
    }
  } catch {
    // Falls through to the map below.
  }

  // A database without migration 0044 has an empty register, and returning
  // no capabilities would read as a business that may do nothing at all.
  if (!resolved) {
    for (const set of Array.from(productSets)) {
      for (const cap of FALLBACK_ESSENTIALS[set] ?? []) capabilities.add(cap);
    }
  }

  return {
    businessId,
    productSets: Array.from(productSets),
    capabilities,
    capacity,
    inGrace,
  };
}

// Downgrade rule: expiry never deletes records or blocks export (PRI-004,
// ENT-008, ENT-013, ENT-014). Callers gate live services, never history.
export function canUseLiveService(
  access: EffectiveAccess,
  capability: string
): boolean {
  return access.capabilities.has(capability);
}

export function canAlwaysAccessHistory(): true {
  // Critical merchant records remain accessible and exportable after a paid
  // entitlement expires. This is a platform invariant, not a tier decision.
  return true;
}
