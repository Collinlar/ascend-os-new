// Add a supplier, or change one (Advanced Inventory A2, 0132).

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { normalizePhone } from "@/lib/auth/phone";
import { purchasingActor, purchasingError, readBody } from "@/lib/inventory/purchasing-route";

type Body = {
  businessId?: string;
  supplierId?: string;
  name?: string;
  contactName?: string;
  phone?: string;
  paymentTerms?: string;
  notes?: string;
};

async function handlePOST(request: NextRequest) {
  const body = await readBody<Body>(request);
  if (!body) return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  const who = await purchasingActor(body.businessId);
  if (who.error) return who.error;

  let phone = "";
  if (body.phone?.trim()) {
    const p = normalizePhone(body.phone);
    if (!p.ok) return NextResponse.json({ error: "That phone number needs a country code, or start it with 0 for Ghana." }, { status: 422 });
    phone = p.e164!;
  }

  const { data, error } = await supabaseServer().rpc("save_supplier", {
    p: {
      business_id: body.businessId,
      supplier_id: body.supplierId ?? "",
      actor_membership_id: who.membershipId,
      name: body.name ?? "",
      contact_name: body.contactName ?? "",
      phone,
      payment_terms: body.paymentTerms ?? "",
      notes: body.notes ?? "",
    },
  });
  if (error) return purchasingError(error, "We could not save that supplier just now. Tap again in a moment.");
  return NextResponse.json(data);
}

export const POST = withAuthority("inventory/supplier", "POST", handlePOST);
