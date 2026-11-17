// Business Pulse: an operational read of today, not a formal readiness
// score (REP-012). Actions and exceptions come first, totals second
// (OFF-008), and every figure states what it counts so "sales" and "money
// received" are never confused (REP-003).

import { supabaseServer } from "@/lib/supabase";
import { activeMembership } from "@/lib/auth/active-business";
import { effectiveAccess } from "@/lib/domains/entitlements";
import type { UUID } from "@/lib/domains/types";
import { coreDashboardFigures, coreSettlementFigures } from "@/lib/reporting/core-readers";

export interface AttentionItem {
  id: string;
  label: string;
  action: string;
  href: string;
  tone: "gold" | "teal";
  /**
   * What a business must be able to do for this to be worth telling them.
   * Legacy records outlive entitlements, and a business that no longer
   * takes orders online still has old ones sitting in the table: sending
   * a till merchant to a shop queue is asking them to act on something
   * they do not have. Undefined means it applies to everyone.
   */
  requires?: string;
}

export interface DashboardData {
  businessName: string;
  locationName: string | null;
  attention: AttentionItem[];
  // Revenue earned today, counted once at the point it was earned.
  salesToday: number;
  saleCount: number;
  // Money actually received today, which is a different question.
  receivedToday: number;
  verifiedReceived: number;
  owed: number;
  owedCustomers: number;
  oldestOwedDays: number | null;
  /** The commerce core could not be read: the money figures are not known. */
  moneyUnavailable: boolean;
  /** Paid online, still with the payment provider on its way to the merchant (0092). */
  onItsWay: number;
  /** Paid out to the merchant's account today (0092). */
  paidOutToday: number;
  balance: number;
  unsyncedSales: number;
  lastDeviceSync: string | null;
  /** Tills with an open shift right now, which is what "selling" means. */
  tillsSelling: number;
  /** When the first till of the day opened, if one has. */
  openedAt: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadDashboard(
  personId: UUID
): Promise<DashboardData | null> {
  const db = supabaseServer();

  const membership = await activeMembership<{ business_id: string; business: { name: string } | null }>(personId, "business_id, business:business_id(name)");
  if (!membership) return null;

  const businessId = membership.business_id as string;
  const businessName =
    (membership.business as unknown as { name: string } | null)?.name ?? "Your business";
  const day = today();

  const [location, pendingOrders, balanceRows, devices, blockedMessages, core, settlement] = await Promise.all([
    db
      .from("location")
      .select("name")
      .eq("business_id", businessId)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    // Orders waiting to be accepted: an action for the owner, not a money
    // figure, so it is read from the orders themselves.
    db
      .from("shop_order")
      .select("id, placed_at")
      .eq("business_id", businessId)
      .eq("status", "pending"),
    db.from("balance_entry").select("amount").eq("business_id", businessId),
    db
      .from("device_registration")
      .select("label, last_sync_at, pending_transaction_count, status")
      .eq("business_id", businessId)
      .eq("status", "active"),
    db
      .from("message")
      .select("id")
      .eq("business_id", businessId)
      .eq("status", "blocked_no_balance")
      .limit(5),
    // Every money figure comes from the commerce core (Phase 2, steps 2d.4
    // and 2d.5): sales earned today on every channel less what was given
    // back, money received less refunds, and what customers have committed
    // to and not paid (lib/reporting/core-readers.ts, 0087).
    coreDashboardFigures(businessId, day),
    // Where online payments have got to: still with the provider, or paid
    // out to the merchant today (0092).
    coreSettlementFigures(businessId, day),
  ]);

  // There is no second source to fall back to. If the core cannot be read,
  // the money cards say so rather than showing figures from somewhere else.
  const moneyUnavailable = core === null;
  const shown = core ?? {
    salesToday: 0,
    saleCount: 0,
    receivedToday: 0,
    verifiedReceived: 0,
    owed: 0,
    owedCustomers: 0,
    overdueCount: 0,
    overdueAmount: 0,
    oldestOwedDays: null,
  };

  const balance = round2(
    (balanceRows.data ?? []).reduce((n, b) => n + Number(b.amount), 0)
  );

  const unsyncedSales = (devices.data ?? []).reduce(
    (n, d) => n + (d.pending_transaction_count ?? 0),
    0
  );
  // Who is actually behind a till right now, and when the day started.
  // The design says "3 tills selling" and "opened 7:20am", and both are
  // real: an open shift is a person at a counter, not a paired device
  // sitting in a drawer.
  const { data: openShifts } = await db
    .from("pos_shift")
    .select("device_id, opened_at")
    .eq("business_id", businessId)
    .eq("status", "open");

  const tillsSelling = new Set(
    (openShifts ?? []).map((r) => r.device_id).filter(Boolean)
  ).size;
  const openedAt =
    (openShifts ?? [])
      .map((r) => r.opened_at as string)
      .sort()[0] ?? null;

  const lastDeviceSync =
    (devices.data ?? [])
      .map((d) => d.last_sync_at as string | null)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  // Decisions the owner should make, most time-sensitive first.
  const attention: AttentionItem[] = [];

  const pending = pendingOrders.data ?? [];
  if (pending.length > 0) {
    const oldest = pending
      .map((o) => new Date(o.placed_at as string).getTime())
      .sort()[0];
    const waitedMinutes = Math.floor((Date.now() - oldest) / 60000);
    attention.push({
      id: "pending-orders",
      label:
        pending.length === 1
          ? `A customer is waiting on you to confirm their order${waitedMinutes > 30 ? `, ${humanMinutes(waitedMinutes)} now` : ""}`
          : `${pending.length} orders are waiting for you to confirm them`,
      action: "Open orders",
      href: "/orders",
      tone: "gold",
      requires: "shop.orders",
    });
  }

  if (shown.overdueCount > 0) {
    attention.push({
      id: "overdue",
      label: `${shown.overdueCount} invoice${shown.overdueCount === 1 ? "" : "s"} past the due date, ${formatShort(
        shown.overdueAmount
      )} in total`,
      action: "See who owes you",
      href: "/documents",
      tone: "gold",
      requires: "documents.issue",
    });
  }

  if (unsyncedSales > 0) {
    attention.push({
      id: "unsynced",
      label: `${unsyncedSales} sale${unsyncedSales === 1 ? "" : "s"} still saved on a till, not sent yet`,
      action: "Check your tills",
      href: "/devices",
      tone: "gold",
      requires: "pos.tills",
    });
  }

  if ((blockedMessages.data ?? []).length > 0) {
    attention.push({
      id: "no-balance",
      label:
        "Some customer messages could not be sent because your Ascend Balance ran out",
      action: "Top up",
      href: "/dashboard",
      tone: "teal",
    });
  }

  // Nothing is filtered on the way in, so a figure still counts every
  // record. Only what the merchant is pointed at is filtered.
  let capabilities = new Set<string>();
  try {
    capabilities = (await effectiveAccess(businessId)).capabilities;
  } catch {
    // Unreadable entitlements should not silence a real warning.
    capabilities = new Set(attention.map((a) => a.requires ?? ""));
  }
  const reachable = attention.filter(
    (item) => !item.requires || capabilities.has(item.requires)
  );

  return {
    businessName,
    locationName: (location.data?.name as string) ?? null,
    attention: reachable,
    salesToday: shown.salesToday,
    saleCount: shown.saleCount,
    receivedToday: shown.receivedToday,
    verifiedReceived: shown.verifiedReceived,
    owed: shown.owed,
    owedCustomers: shown.owedCustomers,
    oldestOwedDays: shown.oldestOwedDays,
    moneyUnavailable,
    onItsWay: settlement?.onItsWay ?? 0,
    paidOutToday: settlement?.paidOutToday ?? 0,
    balance,
    unsyncedSales,
    lastDeviceSync,
    tillsSelling,
    openedAt,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function humanMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

function formatShort(amount: number): string {
  return `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
