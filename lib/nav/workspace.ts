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
// become tabs and the rest go behind More. Serving customers outranks
// setting the business up: a shop with orders waiting should not have to
// open a menu to find them while Tills sits in a tab.
// `requires` is one capability, or several where a destination is earned
// more than one way. The staff directory is the case that needs it: a till
// business gets cashier accounts as an embedded essential of POS, and Full
// Office gets the same screen through people.core.
const DESTINATIONS: Array<NavItem & { requires: string | string[] }> = [
  { href: "/pos", label: "Sell at the counter", short: "Sell", requires: "pos.sell" },
  { href: "/orders", label: "Online orders", short: "Orders", requires: "shop.orders" },
  { href: "/bookings", label: "Bookings", short: "Bookings", requires: "services.bookings" },
  {
    href: "/services",
    label: "What you offer",
    short: "Services",
    requires: "services.bookings",
  },
  {
    href: "/documents",
    label: "Quotes and invoices",
    short: "Documents",
    requires: "documents.issue",
  },
  {
    href: "/customers",
    label: "Who buys from you",
    short: "Customers",
    // Earned by any set that creates customers, because the record is
    // shared and the screen reads all of them at once.
    requires: ["customers.core", "customers.basic"],
  },
  { href: "/products", label: "What you sell", short: "Products", requires: "catalogue.core" },
  { href: "/shop", label: "Your shop", short: "Shop", requires: "shop.storefront" },
  { href: "/devices", label: "Tills and team", short: "Tills", requires: "pos.tills" },
  {
    href: "/availability",
    label: "When you are free",
    short: "Availability",
    requires: "services.basic_availability",
  },
  {
    href: "/team",
    label: "Your team",
    short: "Team",
    requires: ["people.cashiers", "people.core"],
  },
  {
    href: "/work",
    label: "People and work",
    short: "Work",
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
  { href: "/promote", label: "Get found", short: "Promote", requires: "discover.listing" },
  {
    href: "/readiness",
    label: "Investment readiness",
    short: "Readiness",
    requires: "readiness.score",
  },
  {
    href: "/sharing",
    label: "What you share",
    short: "Sharing",
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
};

// The sets a merchant can take on themselves, mirroring what the product
// set endpoint will accept.
const SELF_SERVE: ProductSetKey[] = ["pos", "shop", "services", "documents"];

const HOME: NavItem = { href: "/dashboard", label: "Today at your business", short: "Home" };

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
    .select("business_id, created_at, business:business_id(name)")
    .eq("person_id", personId)
    .eq("status", "active")
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
    items.push({
      href: destination.href,
      label: destination.label,
      short: destination.short,
    });
  }

  // Only while there is something left to add. A business already running
  // everything does not need a door to nothing.
  if (SELF_SERVE.some((key) => !productSets.includes(key))) items.push(GROW);

  return {
    personId,
    personName: (person?.full_name as string | null) ?? "You",
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
