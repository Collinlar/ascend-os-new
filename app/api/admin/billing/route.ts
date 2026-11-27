// Payments to Ascend (round 3, P4): an admin records money that arrived
// for an order or as a plain top-up, and sets a business's Account
// Manager (decision 8). Each is checked again in the database.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "record_payment" | "set_manager" | "remove_manager";
  orderId?: string;
  businessId?: string;
  amount?: number;
  paidWith?: string;
  reference?: string;
  name?: string;
  whatsapp?: string;
}

async function handlePOST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through." }, { status: 400 });
  }
  const db = supabaseServer();

  if (body.action === "record_payment") {
    const { data, error } = await db.rpc("record_ascend_payment", {
      p: {
        admin_person_id: admin.personId,
        order_id: body.orderId ?? "",
        business_id: body.businessId ?? "",
        top_up_amount: body.orderId ? "" : String(Number(body.amount) || ""),
        paid_with: body.paidWith ?? "bank_transfer",
        payment_reference: body.reference ?? "",
      },
    });
    if (error) {
      const said: Array<[RegExp, string, number]> = [
        [/admin_only/, "Only a platform admin can record money.", 403],
        [/reference_needed/, "Type the bank or MoMo reference, at least 4 characters.", 422],
        [/reference_already_used/, "That reference is already on another payment. Check it against the statement.", 409],
        [/order_not_waiting/, "This order is already paid or cancelled.", 409],
        [/order_not_found/, "We could not find that order.", 404],
        [/top_up_out_of_range/, "Pick a business and an amount up to GHS 50,000.", 422],
        [/paid_with_unknown/, "Pick how they paid.", 422],
      ];
      const hit = said.find(([re]) => re.test(error.message));
      return NextResponse.json({ error: hit?.[1] ?? "That did not go through." }, { status: hit?.[2] ?? 500 });
    }
    return NextResponse.json(data);
  }

  if (body.action === "set_manager" || body.action === "remove_manager") {
    if (!body.businessId) return NextResponse.json({ error: "Pick a business." }, { status: 422 });
    if (body.action === "remove_manager") {
      const { error } = await db.from("account_manager").delete().eq("business_id", body.businessId);
      if (error) return NextResponse.json({ error: "That did not go through." }, { status: 500 });
    } else {
      const name = (body.name ?? "").trim();
      const whatsapp = (body.whatsapp ?? "").replace(/[\s-]/g, "").replace(/^0/, "+233");
      if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "Their name, as the business will see it, like Ama K." }, { status: 422 });
      if (!/^\+[1-9][0-9]{7,14}$/.test(whatsapp)) return NextResponse.json({ error: "Their WhatsApp number with the country code, like +233 24 000 0000." }, { status: 422 });
      const { error } = await db
        .from("account_manager")
        .upsert({ business_id: body.businessId, name, whatsapp, assigned_by: admin.personId, assigned_at: new Date().toISOString() }, { onConflict: "business_id" });
      if (error) return NextResponse.json({ error: "That did not go through." }, { status: 500 });
    }
    await db.from("audit_log").insert({ business_id: body.businessId, actor_person_id: admin.personId, action: `account_manager.${body.action === "set_manager" ? "set" : "removed"}`, entity_type: "business", entity_id: body.businessId, detail: { name: body.name ?? null } });
    return NextResponse.json({ done: true });
  }

  return NextResponse.json({ error: "We could not tell what to do." }, { status: 422 });
}

export const POST = withAuthority("admin/billing", "POST", handlePOST);
