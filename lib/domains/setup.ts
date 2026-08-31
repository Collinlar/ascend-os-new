// How far a business is from its first sale.
//
// Derived from real records, never from a stored step counter. A merchant
// who abandons setup halfway and comes back sees the truth; one whose field
// agent did half of it for them sees that too; and deleting every product
// honestly reopens the step. It is the same principle the Sustainability
// Score runs on: what the business actually did, not what it once declared.

import { supabaseServer } from "@/lib/supabase";
import type { UUID } from "./types";

export interface SetupStep {
  id: string;
  label: string;
  /** Why this matters, in the merchant's terms, not the system's. */
  detail: string;
  done: boolean;
  href: string;
  cta: string;
  /** Optional steps are worth doing but do not block a first sale. */
  optional?: boolean;
}

export interface SetupPath {
  steps: SetupStep[];
  next: SetupStep | null;
  remaining: number;
  readyToSell: boolean;
}

export async function setupPath(
  businessId: UUID,
  locationId: UUID | null,
  capabilities: Set<string>
): Promise<SetupPath> {
  const db = supabaseServer();
  // Selling at a counter is a capability, not a purchase. A business that
  // has it through any route gets the till steps; one that does not is
  // never shown them.
  const sellsInPerson = capabilities.has("pos.sell");
  const takesBookings = capabilities.has("services.bookings");
  const where = sellsInPerson ? "your till" : "your shop page";

  const [
    items,
    priced,
    tills,
    pins,
    movements,
    serviceItems,
    availability,
    bookings,
  ] = await Promise.all([
    db
      .from("catalogue_item")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true),
    db
      .from("catalogue_item")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true)
      .not("base_price", "is", null),
    db
      .from("device_registration")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("revoked_at", null),
    db
      .from("business_membership")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "active")
      .not("staff_pin_hash", "is", null),
    locationId
      ? db
          .from("stock_movement")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("location_id", locationId)
      : Promise.resolve({ count: 0 }),
    db
      .from("catalogue_item")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("kind", "service")
      .eq("active", true),
    db
      .from("staff_availability")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
    db
      .from("service_booking")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);

  const itemCount = items.count ?? 0;
  const serviceCount = serviceItems.count ?? 0;
  const pricedCount = priced.count ?? 0;

  // Built from what the business can do, not from an either or. A shop
  // that also takes bookings needs both paths, and an earlier version of
  // this gave it whichever one matched first and silently dropped the
  // other, so a counter business that added Services stopped being told to
  // set up its till.
  const sellsThings = sellsInPerson || capabilities.has("shop.storefront");
  const steps: SetupStep[] = [];

  if (takesBookings) {
    // Something to book and somebody to book with, in that order. Hours
    // published against nothing are hours nobody can take.
    steps.push(
      {
        id: "services",
        label: "Say what you offer",
        detail: "What it is, how long it takes and what it costs.",
        done: serviceCount > 0,
        href: "/services",
        cta: "Add a service",
      },
      {
        id: "hours",
        label: "Set when you are free",
        detail: "Your normal week, so customers only see real openings.",
        done: (availability.count ?? 0) > 0,
        href: "/availability",
        cta: "Set my hours",
      },
      {
        id: "share",
        label: "Send your booking link",
        detail: "One link on WhatsApp, and somebody can take a time.",
        // Done when somebody has actually booked. Nothing else proves the
        // link ever left the building, and a step that can never be done
        // would pin this panel to the screen forever.
        done: (bookings.count ?? 0) > 0,
        href: "/services",
        cta: "Get my link",
        optional: true,
      }
    );
  }

  if (sellsThings) {
    steps.push(
      {
        id: "products",
        label: "Add what you sell",
        detail: "Take a photo of each product and we help name it.",
        done: itemCount > 0,
        href: "/products/add",
        cta: "Add products",
      },
      {
        id: "prices",
        label: "Put a price on everything",
        // Named for where this business actually sells. Telling an online
        // seller their product is hidden from a till points at something
        // they do not have and cannot act on.
        detail:
          itemCount > 0 && pricedCount < itemCount
            ? (() => {
                const missing = itemCount - pricedCount;
                return missing === 1
                  ? `One of your products has no price, so ${where} will not show it.`
                  : `${missing} of your products have no price, so ${where} will not show them.`;
              })()
            : `A product with no price stays hidden from ${where}.`,
        done: itemCount > 0 && pricedCount === itemCount,
        href: "/products",
        cta: "Set prices",
      }
    );
  }

  if (sellsInPerson) {
    steps.push(
      {
        id: "till",
        label: "Set up a till",
        detail: "Pair the phone or handheld you will sell from.",
        done: (tills.count ?? 0) > 0,
        href: "/devices",
        cta: "Get a pairing code",
      },
      {
        id: "pin",
        label: "Give someone a till PIN",
        detail: "A till will not open until at least one person has one.",
        done: (pins.count ?? 0) > 0,
        href: "/devices",
        cta: "Set a PIN",
      }
    );
  }

  // Nothing to count on a business that only sells time.
  if (sellsThings) {
    steps.push({
      id: "stock",
      label: "Count your stock in",
      detail: "Not required to sell, but your counts stay wrong until you do.",
      done: (movements.count ?? 0) > 0,
      href: "/products",
      cta: "Count stock in",
      optional: true,
    });
  }

  const blocking = steps.filter((s) => !s.optional);
  const next = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    next,
    remaining: steps.filter((s) => !s.done).length,
    readyToSell: blocking.every((s) => s.done),
  };
}
