// What happened to the refunds asked for on this till's sales: approved or
// turned down, and whether an approved one has been handed back from the
// drawer yet. Device-authenticated and scoped to the till's own sales.
//
// The till asks for a refund and then knows nothing until it is decided in
// Work. This is how it finds out, so the cashier can hand the money back
// (refunds come from the drawer, Collins, 19 November 2026; 0123).

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const WINDOW_DAYS = 7;

async function handleGET(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json(
      { error: "This till is not set up. Ask the owner for a pairing code." },
      { status: 401, headers: NO_STORE }
    );
  }
  const db = supabaseServer();
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

  const { data: decided, error } = await db
    .from("approval_request")
    .select("id, status, decided_at, source_entity_id")
    .eq("business_id", device.businessId)
    .eq("kind", "refund")
    .eq("source_entity_type", "sale")
    .in("status", ["approved", "rejected"])
    .gte("decided_at", since)
    .limit(100);
  if (error) {
    return NextResponse.json({ error: "Refund decisions did not load just now." }, { status: 502, headers: NO_STORE });
  }
  if (!decided?.length) return NextResponse.json({ refunds: [] }, { headers: NO_STORE });

  const saleIds = decided.map((d) => d.source_entity_id as string);
  const [{ data: sales }, { data: payments }, payouts] = await Promise.all([
    db
      .from("sale")
      .select("id, device_id, receipt_number, total, customer:customer_id(display_name)")
      .eq("business_id", device.businessId)
      .in("id", saleIds),
    db
      .from("payment")
      .select("source_entity_id, method, amount, status")
      .eq("business_id", device.businessId)
      .eq("source_entity_type", "sale")
      .in("source_entity_id", saleIds),
    // Before 0123 is applied there is no payout table; nothing has been
    // handed back through it, so the answer is simply none.
    db
      .from("till_refund_payout")
      .select("approval_id")
      .eq("business_id", device.businessId)
      .in(
        "approval_id",
        decided.map((d) => d.id as string)
      )
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);

  const paid = new Set((payouts as Array<{ approval_id: string }>).map((p) => p.approval_id));
  const byId = new Map((sales ?? []).map((s) => [s.id as string, s]));

  const refunds = decided
    .map((d) => {
      const sale = byId.get(d.source_entity_id as string);
      // Only this till's own sales: it is this counter that hands back.
      if (!sale || sale.device_id !== device.deviceId) return null;
      const mine = (payments ?? []).filter((p) => p.source_entity_id === sale.id && p.status === "confirmed");
      const cash = mine.filter((p) => p.method === "cash").reduce((n, p) => n + Number(p.amount), 0);
      return {
        approvalId: d.id as string,
        status: d.status as "approved" | "rejected",
        decidedAt: d.decided_at as string,
        receipt: sale.receipt_number as string,
        total: Number(sale.total),
        cash: Math.round(cash * 100) / 100,
        method: (mine[0]?.method as string | undefined) ?? null,
        customerName: (sale.customer as unknown as { display_name: string } | null)?.display_name ?? null,
        paid: paid.has(d.id as string),
      };
    })
    .filter(Boolean);

  return NextResponse.json({ refunds }, { headers: NO_STORE });
}

export const GET = withAuthority("pos/refunds", "GET", handleGET);
