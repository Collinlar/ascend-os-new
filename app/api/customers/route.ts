// Adding a customer by hand (v3 design, Customers).
//
// Through find_or_create_customer (0064), the same door the till, the shop,
// bookings and documents use, so a customer added here who already bought at
// the counter is the same person, not a second record. Owners and managers
// (customers.manage); the business is the one the person is signed in to.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { normalizePhone } from "@/lib/auth/phone";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Sign in again to add them." }, { status: 401 });
  }
  let body: { name?: string; phone?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap add again." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "What is their name? Their first name is enough." }, { status: 422 });
  }
  let phone: string | null = null;
  if ((body.phone ?? "").trim()) {
    const p = normalizePhone(body.phone as string);
    if (!p.ok || !p.e164) return NextResponse.json({ error: p.error }, { status: 422 });
    phone = p.e164;
  }
  const email = (body.email ?? "").trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address looks incomplete. Check it, or leave it empty." }, { status: 422 });
  }

  const membership = await activeMembership<{ business_id: string }>(personId);
  if (!membership) return NextResponse.json({ error: "You do not have access to a business yet." }, { status: 403 });

  const { data, error } = await supabaseServer().rpc("find_or_create_customer", {
    p: { business_id: membership.business_id, name, phone, email, created_via: "manual" },
  });
  if (error) {
    return NextResponse.json({ error: "We could not add them just now. Nothing was saved. Tap add again." }, { status: 500 });
  }
  const out = data as { customer_id: string | null; created: boolean };
  return NextResponse.json({ ok: true, customerId: out.customer_id, created: out.created });
}

export const POST = withAuthority("customers", "POST", handlePOST);
