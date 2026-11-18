// What this person can reach, and where.
//
// One resolver so every surface agrees: the nav, the dashboard and the
// setup path all read the same context rather than each deciding for
// themselves what a business owns.

import { currentPersonId } from "@/lib/auth/session";
import { currentBusinessChoice } from "@/lib/auth/current-business";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { supabaseServer } from "@/lib/supabase";
import type { ProductSetKey, UUID } from "@/lib/domains/types";
import type { NavItem } from "./routes";

export type { NavItem } from "./routes";
export { isBareRoute } from "./routes";

export interface Workspace {
  personId: UUID;
  personName: string;
  /** Owner, Manager or Cashier, as the shell shows it. */
  roleName: string | null;
  businessId: UUID;
  businessName: string;
  /** How many businesses this person could be looking at instead. */
  businessCount: number;
  locationId: UUID | null;
  locationName: string | null;
  productSets: ProductSetKey[];
  /** What this business may actually do. Gates ask this, not the set. */
  capabilities: Set<string>;
  items: NavItem[];
}

// Everything a merchant can reach, each naming the capability that earns
// it. Keyed by capability rather than by product set, so Products appears
// once for a till business and once for a shop and is the same entry either
// way: that is the connected catalogue showing up as one thing rather than
// two that happen to share a URL.
//
// Ordered by how often a merchant needs it, because only the first few
// become phone tabs; the ones marked `more` sit under More in the sidebar
// and are never tabs. Serving customers outranks
// setting the business up: a shop with orders waiting should not have to
// open a menu to find them while Tills sits in a tab.
// `requires` is one capability, or several where a destination is earned
// more than one way. The staff directory is the case that needs it: a till
// business gets cashier accounts as an embedded essential of POS, and Full
// Office gets the same screen through people.core.
const DESTINATIONS: Array<NavItem & { requires: string | string[] }> = [
  { href: "/pos", label: "Sell", short: "Sell", icon: "sell", requires: "pos.sell" },
  {
    href: "/sales",
    label: "Sales",
    short: "Sales",
    icon: "chart",
    // Every way a business sells lands in one history.
    requires: ["pos.sell", "shop.orders", "services.bookings", "documents.issue"],
  },
  { href: "/orders", label: "Orders", short: "Orders", icon: "inbox", requires: "shop.orders" },
  { href: "/bookings", label: "Bookings", short: "Bookings", icon: "calendar", requires: "services.bookings" },
  { href: "/documents", label: "Documents", short: "Documents", icon: "file", requires: "documents.issue" },
  {
    href: "/customers",
    label: "Customers",
    short: "Customers",
    icon: "users",
    // Earned by any set that creates customers, because the record is
    // shared and the screen reads all of them at once.
    requires: ["customers.core", "customers.basic"],
  },
  { href: "/products", label: "Products", short: "Products", icon: "tag", requires: "catalogue.core" },
  { href: "/shop", label: "Shop", short: "Shop", icon: "store", requires: "shop.storefront" },
  {
    href: "/team",
    label: "Team",
    short: "Team",
    icon: "team",
    requires: ["people.cashiers", "people.core"],
  },
  {
    href: "/work",
    label: "Work",
    short: "Work",
    icon: "clipboard",
    // Full Office is paid, but the PRD embeds parts of it in the anchor
    // products (31): POS carries attendance and shifts, Shop carries
    // fulfilment assignment, Services carries provider assignment. A
    // merchant holding any of those has work to see, and gating the whole
    // screen on office.work put every one of them behind a door nobody
    // had a key to. The paid modules are gated inside the page instead.
    requires: [
      "office.work",
      "office.basic_attendance",
      "office.basic_shifts",
      "office.basic_order_assignment",
      "people.provider_assignment",
    ],
  },
  { href: "/promote", label: "Promote", short: "Promote", icon: "target", requires: "discover.listing" },
  {
    href: "/readiness",
    label: "Investment readiness",
    short: "Readiness",
    icon: "shield",
    requires: "readiness.score",
  },
  // Set up once, opened rarely: under More.
  {
    href: "/services",
    label: "Service catalogue",
    short: "Services",
    icon: "briefcase",
    more: true,
    requires: "services.bookings",
  },
  {
    href: "/availability",
    label: "Availability",
    short: "Availability",
    icon: "clock",
    more: true,
    requires: "services.basic_availability",
  },
  { href: "/devices", label: "Devices", short: "Devices", icon: "device", more: true, requires: "pos.tills" },
  {
    href: "/sharing",
    label: "Sharing",
    short: "Sharing",
    icon: "share",
    more: true,
    requires: "readiness.score",
  },
];

// The one room where the business gets bigger. Not a capability, because
// nothing grants it: it is the door to the sets a business has not taken
// on, and it stays last so it never competes with today's work.
const GROW: NavItem = {
  href: "/grow",
  label: "Add to your business",
  short: "Add",
  icon: "plus",
  more: true,
};

// The sets a merchant can take on themselves, mirroring what the product
// set endpoint will accept.
const SELF_SERVE: ProductSetKey[] = ["pos", "shop", "services", "documents"];

const BILLING: NavItem = {
  href: "/billing",
  label: "Plan and billing",
  short: "Billing",
  icon: "grid",
  more: true,
};

const HOME: NavItem = { href: "/dashboard", label: "Home", short: "Home", icon: "home" };

const ROLE_NAME: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
};

export async function currentWorkspace(): Promise<Workspace | null> {
  const personId = await currentPersonId();
  if (!personId) return null;

  const db = supabaseServer();
  // Every membership, oldest first. The old query took one with no ordering
  // at all, so a person who held two businesses landed on whichever the
  // database happened to return, and could land somewhere different on the
  // next request. Ordering makes the fallback stable; the cookie makes it
  // theirs.
  const { data: person } = await db
    .from("person")
    .select("full_name")
    .eq("id", personId)
    .maybeSingle();

  const { data: memberships } = await db
    .from("business_membership")
    .select("business_id, created_at, business:business_id(name), role:role_id(key)")
    .eq("person_id", personId)
    .eq("status", "active")
    // An expired membership does not open the business (Phase 1, step 1e).
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) return null;

  const chosen = currentBusinessChoice();
  const membership =
    memberships.find((m) => m.business_id === chosen) ?? memberships[0];

  const businessId = membership.business_id as UUID;

  const { data: location } = await db
    .from("location")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  let productSets: ProductSetKey[] = [];
  let capabilities = new Set<string>();
  try {
    const access = await effectiveAccess(businessId);
    productSets = access.productSets;
    capabilities = access.capabilities;
  } catch {
    // A business that cannot be read for entitlements still needs to reach
    // its own dashboard, so navigation degrades rather than disappearing.
    productSets = [];
  }

  const seen = new Set<string>();
  const items: NavItem[] = [HOME];
  for (const destination of DESTINATIONS) {
    const needed = Array.isArray(destination.requires)
      ? destination.requires
      : [destination.requires];
    if (!needed.some((capability) => capabilities.has(capability))) continue;
    if (seen.has(destination.href)) continue;
    seen.add(destination.href);
    const { requires: _requires, ...item } = destination;
    items.push(item);
  }

  // Only while there is something left to add. A business already running
  // everything does not need a door to nothing.
  if (SELF_SERVE.some((key) => !productSets.includes(key))) items.push(GROW);

  // Every business can see what it pays for, whatever it runs. Last,
  // because nobody opens it before serving a customer.
  items.push(BILLING);

  return {
    personId,
    personName: (person?.full_name as string | null) ?? "You",
    roleName: ROLE_NAME[(membership.role as unknown as { key: string } | null)?.key ?? ""] ?? null,
    businessId,
    businessName:
      (membership.business as unknown as { name: string } | null)?.name ?? "Your business",
    businessCount: memberships.length,
    locationId: (location?.id as UUID) ?? null,
    locationName: (location?.name as string | null) ?? null,
    productSets,
    capabilities,
    items,
  };
}
