// Business Pulse: an operational read of today, not a formal readiness
// score (REP-012). Actions and exceptions come first, totals second
// (OFF-008), and every figure states what it counts so "sales" and "money
// received" are never confused (REP-003).

import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";
import type { UUID } from "@/lib/domains/types";

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
  balance: number;
  unsyncedSales: number;
  lastDeviceSync: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadDashboard(
  personId: UUID
): Promise<DashboardData | null> {
  const db = supabaseServer();

  const { data: membership } = await db
    .from("business_membership")
    .select("business_id, business:business_id(name)")
    .eq("person_id", personId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const businessId = membership.business_id as string;
  const businessName =
    (membership.business as unknown as { name: string } | null)?.name ?? "Your business";
  const day = today();

  const [
    location,
    posSales,
    fulfilledOrders,
    pendingOrders,
    payments,
    receivables,
    balanceRows,
    devices,
    blockedMessages,
  ] = await Promise.all([
    db
      .from("location")
      .select("name")
      .eq("business_id", businessId)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    db
      .from("sale")
      .select("total")
      .eq("business_id", businessId)
      .eq("business_date", day)
      .eq("status", "completed"),
    db
      .from("shop_order")
      .select("total")
      .eq("business_id", businessId)
      .eq("status", "fulfilled")
      .gte("updated_at", `${day}T00:00:00Z`),
    db
      .from("shop_order")
      .select("id, placed_at")
      .eq("business_id", businessId)
      .eq("status", "pending"),
    db
      .from("payment")
      .select("amount, verification")
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .gte("occurred_at", `${day}T00:00:00Z`),
    db
      .from("receivable")
      .select("amount_due, amount_paid, due_date, customer_id")
      .eq("business_id", businessId)
      .is("settled_at", null),
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
  ]);

  // Revenue earned today. POS sales and fulfilled Shop orders are separate
  // source records, so summing them cannot double-count (REP-004).
  const posTotal = (posSales.data ?? []).reduce((n, s) => n + Number(s.total), 0);
  const shopTotal = (fulfilledOrders.data ?? []).reduce(
    (n, o) => n + Number(o.total),
    0
  );
  const salesToday = round2(posTotal + shopTotal);
  const saleCount = (posSales.data ?? []).length + (fulfilledOrders.data ?? []).length;

  // Money received is a different figure from revenue earned, and the two
  // are shown separately rather than blended.
  const receivedToday = round2(
    (payments.data ?? []).reduce((n, p) => n + Number(p.amount), 0)
  );
  const verifiedReceived = round2(
    (payments.data ?? [])
      .filter((p) => p.verification === "provider_confirmed")
      .reduce((n, p) => n + Number(p.amount), 0)
  );

  const outstanding = (receivables.data ?? []).map((r) => ({
    outstanding: Number(r.amount_due) - Number(r.amount_paid),
    dueDate: r.due_date as string | null,
    customerId: r.customer_id as string,
  }));
  const owed = round2(
    outstanding.reduce((n, r) => n + Math.max(0, r.outstanding), 0)
  );
  const owedCustomers = new Set(outstanding.map((r) => r.customerId)).size;
  const overdue = outstanding.filter(
    (r) => r.dueDate && new Date(r.dueDate) < new Date() && r.outstanding > 0
  );
  const oldestOwedDays = overdue.length
    ? Math.max(
        ...overdue.map((r) =>
          Math.floor(
            (Date.now() - new Date(r.dueDate as string).getTime()) / 86400_000
          )
        )
      )
    : null;

  const balance = round2(
    (balanceRows.data ?? []).reduce((n, b) => n + Number(b.amount), 0)
  );

  const unsyncedSales = (devices.data ?? []).reduce(
    (n, d) => n + (d.pending_transaction_count ?? 0),
    0
  );
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

  if (overdue.length > 0) {
    attention.push({
      id: "overdue",
      label: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"} past the due date, ${formatShort(
        round2(overdue.reduce((n, r) => n + r.outstanding, 0))
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
    salesToday,
    saleCount,
    receivedToday,
    verifiedReceived,
    owed,
    owedCustomers,
    oldestOwedDays,
    balance,
    unsyncedSales,
    lastDeviceSync,
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
