// One customer's dealings with this business, across every product set.
//
// Loaded on demand rather than with the list: most merchants open one or
// two, and pulling every customer's history to render a page nobody scrolls
// is bandwidth a Ghanaian merchant pays for.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  const db = supabaseServer();
  const membership = await activeMembership<{ business_id: string }>(personId);
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to a business yet." },
      { status: 403 }
    );
  }

  // The customer has to belong to the business the caller is in. The
  // service-role client bypasses RLS, so this path checks its own scope.
  const { data: customer } = await db
    .from("customer")
    .select("id")
    .eq("id", params.id)
    .eq("business_id", membership.business_id)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: "We could not find them." }, { status: 404 });
  }

  const { data, error } = await db.rpc("customer_history", {
    p_customer: params.id,
  });
  if (error) {
    console.error("customer history failed:", error.message);
    return NextResponse.json(
      { error: "We could not read their history just now." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    history: ((data ?? []) as Array<Record<string, unknown>>).map((h) => ({
      kind: h.kind,
      reference: h.reference,
      happenedAt: h.happened_at,
      amount: h.amount === null ? null : Number(h.amount),
      status: h.status,
    })),
  });
}
