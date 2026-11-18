import "server-only";

// What the v3 Home shows beyond today's totals (DESIGN_V3_PLAN.md, D3):
// the last 14 days of sales, what sold and how customers paid, the latest
// sales, stock and customer counts (all from commerce_home_figures, 0116),
// and the tills and phones selling for the business.
//
// Every part is optional. If it cannot be read, Home leaves that section
// out rather than showing a figure from somewhere else.

import { supabaseServer } from "@/lib/supabase";

export interface HomeDay {
  day: string;
  sales: number;
  count: number;
}

export interface HomeRecentSale {
  at: string;
  channel: string;
  items: string | null;
  total: number;
  status: string;
  method: string | null;
  verified: boolean;
}

export interface HomeFigures {
  days: HomeDay[];
  topProducts: Array<{ name: string; amount: number }>;
  paymentMix: Array<{ method: string; amount: number }>;
  recent: HomeRecentSale[];
  stock: { tracked: number; low: number; out: number };
  customers: { total: number; new7d: number };
}

export interface HomeDevice {
  id: string;
  label: string;
  mode: string;
  selling: boolean;
  lastSyncAt: string | null;
  unsent: number;
}

export async function loadHomeFigures(businessId: string, day: string): Promise<HomeFigures | null> {
  const { data, error } = await supabaseServer().rpc("commerce_home_figures", {
    p_business: businessId,
    p_day: day,
    p_days: 14,
  });
  if (error || !data) return null;
  const h = data as {
    days: Array<{ day: string; sales: number | string; count: number }>;
    top_products: Array<{ name: string; amount: number | string }>;
    payment_mix: Array<{ method: string; amount: number | string }>;
    recent: Array<{ at: string; channel: string; items: string | null; total: number | string; status: string; method: string | null; verified: boolean }>;
    stock: { tracked: number; low: number; out: number } | null;
    customers: { total: number; new_7d: number };
  };
  return {
    days: h.days.map((d) => ({ day: d.day, sales: Number(d.sales), count: d.count })),
    topProducts: h.top_products.map((p) => ({ name: p.name, amount: Number(p.amount) })),
    paymentMix: h.payment_mix.map((m) => ({ method: m.method, amount: Number(m.amount) })),
    recent: h.recent.map((r) => ({ ...r, total: Number(r.total) })),
    stock: h.stock ?? { tracked: 0, low: 0, out: 0 },
    customers: { total: Number(h.customers.total), new7d: Number(h.customers.new_7d) },
  };
}

export async function loadHomeDevices(businessId: string): Promise<HomeDevice[] | null> {
  const db = supabaseServer();
  const [devices, shifts] = await Promise.all([
    db
      .from("device_registration")
      .select("id, label, mode, last_sync_at, pending_transaction_count")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("paired_at", { ascending: true }),
    db.from("pos_shift").select("device_id").eq("business_id", businessId).eq("status", "open"),
  ]);
  if (devices.error) return null;
  const open = new Set((shifts.data ?? []).map((s) => s.device_id as string | null).filter(Boolean));
  return (devices.data ?? []).map((d) => ({
    id: d.id as string,
    label: (d.label as string | null) ?? "Till",
    mode: String(d.mode ?? ""),
    selling: open.has(d.id as string),
    lastSyncAt: (d.last_sync_at as string | null) ?? null,
    unsent: Number(d.pending_transaction_count ?? 0),
  }));
}

/** How a payment method reads on Home. */
export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  mobile_money: "MoMo",
  card: "Card",
  bank_transfer: "Bank transfer",
  payment_link: "Pay link",
  credit: "On credit",
  balance: "Ascend Balance",
};

export const CHANNEL_LABEL: Record<string, string> = {
  pos: "Till",
  shop: "Shop",
  services: "Booking",
  documents: "Invoice",
  manual: "Recorded",
};
