// The customer list a till keeps so a cashier can put a name on a sale with
// no network. Device-authenticated and scoped to the till's own business.
//
// Only what finding someone at the counter needs: their name and their
// phone number. Nothing else on the record leaves the server (Collins
// approved keeping these two on the till, 19 November 2026; the till erases
// them when it is stopped).

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

// Enough for a busy shop's regulars. The most recently active come first,
// so a business with more than this keeps the people it actually sees.
const LIMIT = 3000;

async function handleGET(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json(
      { error: "This till is not set up. Ask the owner for a pairing code." },
      { status: 401, headers: NO_STORE }
    );
  }

  const { data, error } = await supabaseServer()
    .from("customer")
    .select("id, display_name, phone_e164")
    .eq("business_id", device.businessId)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Your customer list did not load just now. It will try again." },
      { status: 502, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      customers: (data ?? []).map((c) => ({
        id: c.id as string,
        name: (c.display_name as string | null) ?? "Customer",
        phone: (c.phone_e164 as string | null) ?? null,
      })),
    },
    { headers: NO_STORE }
  );
}

export const GET = withAuthority("pos/customers", "GET", handleGET);
