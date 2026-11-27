// The business modules (business modules design, M1).
//
// Each module opens with the same header band: its icon on a teal tile, the
// module's name over the screen's title, one line on what it is for, and
// its tabs. Said once here so Documents, Office, Customers and Bookings
// introduce themselves the same way, and so a tab only ever leads to a
// screen the business has earned (the same test the sidebar uses).

import type { IconName } from "@/components/shell/icons";
import { officeModules } from "@/lib/office/access";
import { currentWorkspace, earns } from "./workspace";

export interface ModuleIdentity {
  kicker: string;
  title: string;
  icon: IconName;
  tagline: string;
}

export interface ModuleTab {
  label: string;
  href: string;
  current: boolean;
}

export const MODULES = {
  promotions: {
    kicker: "Ascend Promotions",
    title: "Promote with Ascend",
    icon: "target",
    tagline: "Reach people looking for what you sell on Ascend Discover. Paid from your Ascend Balance, never your sales.",
  },
  documents: {
    kicker: "Ascend Documents",
    title: "Documents",
    icon: "file",
    tagline: "Create the document. Move the transaction forward. Keep the evidence.",
  },
  office: {
    kicker: "Ascend Office",
    title: "Office",
    icon: "briefcase",
    tagline: "People, work and approvals in one place.",
  },
  customers: {
    kicker: "Ascend CRM",
    title: "Customers",
    icon: "users",
    tagline: "Know your customers. See everything they bought. Bring them back.",
  },
  services: {
    kicker: "Ascend Services",
    title: "Bookings",
    icon: "calendar",
    tagline: "Customers book you and pay deposits. Ascend keeps your schedule, customers and earnings together.",
  },
  inventory: {
    kicker: "Ascend Inventory",
    title: "Inventory",
    icon: "box",
    tagline: "What you have, where it is, and every change that made it.",
  },
  products: {
    kicker: "Ascend Products",
    title: "Products",
    icon: "tag",
    tagline: "One list for your till and your shop: prices, barcodes and counts.",
  },
  sales: {
    kicker: "Ascend Sales",
    title: "Sales",
    icon: "chart",
    tagline: "Every way you sell, in one history.",
  },
  orders: {
    kicker: "Ascend Shop",
    title: "Orders",
    icon: "store",
    tagline: "Your catalogue, online. Create value first, ask for the rest later.",
  },
  shop: {
    kicker: "Ascend Shop",
    title: "Shop",
    icon: "store",
    tagline: "Your catalogue, online. Create value first, ask for the rest later.",
  },
  money: {
    kicker: "Ascend Money",
    title: "Money",
    icon: "money",
    tagline: "Money you recorded, money a provider confirmed, money owed to you and money you owe, kept apart.",
  },
} satisfies Record<string, ModuleIdentity>;

function routeTabs(
  capabilities: Set<string>,
  current: string,
  tabs: Array<{ label: string; href: string }>
): ModuleTab[] {
  return tabs
    .filter((t) => earns(capabilities, t.href))
    .map((t) => ({ ...t, current: t.href === current }));
}

/** Office (Modules M2): Today, Approvals, the Work board, and People (the
 *  staff directory folded in). People is for whoever manages staff. */
export function officeTabs(
  capabilities: Set<string>,
  current: "/work" | "/work/approvals" | "/work/board" | "/team",
  opts: { runsThePlace?: boolean; waiting?: number } = {}
): ModuleTab[] {
  const modules = officeModules(capabilities);
  const tabs: Array<{ label: string; href: string; shown: boolean }> = [
    { label: "Today", href: "/work", shown: earns(capabilities, "/work") },
    {
      label: opts.waiting ? `Approvals (${opts.waiting})` : "Approvals",
      href: "/work/approvals",
      shown: modules.approvals && opts.runsThePlace !== false,
    },
    { label: "Work", href: "/work/board", shown: modules.tasks },
    { label: "People", href: "/team", shown: earns(capabilities, "/team") && opts.runsThePlace !== false },
  ];
  return tabs.filter((t) => t.shown).map(({ label, href }) => ({ label, href, current: href === current }));
}

/** Services: the schedule, what is offered, and when. */
export function servicesTabs(
  capabilities: Set<string>,
  current: "/bookings" | "/services" | "/availability"
): ModuleTab[] {
  return routeTabs(capabilities, current, [
    { label: "Bookings", href: "/bookings" },
    { label: "Services", href: "/services" },
    { label: "Availability", href: "/availability" },
  ]);
}

/** What the business may do, for a page that only needs its tabs. */
export async function currentCapabilities(): Promise<Set<string>> {
  const workspace = await currentWorkspace().catch(() => null);
  return workspace?.capabilities ?? new Set<string>();
}

export type InventoryView = "stock" | "products" | "moves" | "counts" | "transfers" | "orders" | "suppliers" | "value" | "expiry";

/** Inventory: its views, with Products folded in beside Stock. The page may
 *  pass labels that carry counts ("Counts (2 waiting)"). */
export function inventoryTabs(
  capabilities: Set<string>,
  current: InventoryView,
  labels: Partial<Record<InventoryView, string>> = {}
): ModuleTab[] {
  const views: Array<[InventoryView, string, boolean]> = [
    ["stock", "Stock", true],
    ["products", "Products", earns(capabilities, "/products")],
    ["moves", "Movements", true],
    ["counts", "Counts", true],
    ["transfers", "Transfers", capabilities.has("inventory.transfers")],
    ["orders", "Orders", capabilities.has("inventory.purchasing")],
    ["suppliers", "Suppliers", capabilities.has("inventory.purchasing")],
    ["value", "Value", capabilities.has("inventory.valuation")],
    ["expiry", "Expiry", capabilities.has("inventory.expiry")],
  ];
  return views
    .filter(([, , shown]) => shown)
    .map(([key, label]) => ({
      label: labels[key] ?? label,
      href: key === "products" ? "/products" : key === "stock" ? "/inventory" : `/inventory?tab=${key}`,
      current: key === current,
    }));
}

/** Shop (Modules M6a): the overview, its orders, and the products on it. */
export function shopTabs(capabilities: Set<string>, current: "/shop" | "/orders" | "/products" | "/shop/settings", waiting = 0): ModuleTab[] {
  const tabs: Array<{ label: string; href: string; shown: boolean }> = [
    { label: "Overview", href: "/shop", shown: earns(capabilities, "/shop") },
    { label: waiting ? `Orders (${waiting})` : "Orders", href: "/orders", shown: earns(capabilities, "/orders") },
    { label: "Products", href: "/products", shown: earns(capabilities, "/products") },
    // Pickup, delivery and fees, returns and the promotion (round 2, R3).
    { label: "Settings", href: "/shop/settings", shown: earns(capabilities, "/shop") },
  ];
  return tabs.filter((t) => t.shown).map(({ label, href }) => ({ label, href, current: href === current }));
}

/** Promotions (round 3): the overview, each campaign's results, and the Balance. */
export function promotionsTabs(current: "/promote" | "/promote/new" | "/promote/review" | "/promote/balance"): ModuleTab[] {
  return [
    { label: "Overview", href: "/promote" },
    { label: "New campaign", href: "/promote/new" },
    { label: "Review and reports", href: "/promote/review" },
    { label: "Ascend Balance", href: "/promote/balance" },
  ].map((t) => ({ ...t, current: t.href === current }));
}
