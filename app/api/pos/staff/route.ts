// The staff roster a terminal caches so it can identify a cashier with no
// network. Device-authenticated and scoped to the till's own business.
//
// Only people who may operate a till are returned, and only their name,
// role and PIN material — never contact details, pay, or anything else on
// their person record (SEC-008, SEC-015).

import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// A response with no cache directive is not uncached: browsers apply their
// own heuristics and may reuse it. That is fine for a marketing page and
// wrong for the two requests a till depends on being current, which is how
// a merchant ends up adding products and watching a counter show yesterday.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json(
      { error: "This till is not set up. Ask the owner for a pairing code." },
      { status: 401, headers: NO_STORE });
  }

  const db = supabaseServer();
  const { data, error } = await db.rpc("terminal_staff_roster", {
    p_business: device.businessId,
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not load your people just now. Tap sync again." },
      { status: 502, headers: NO_STORE });
  }

  return NextResponse.json({
    staff: (data ?? []).map(
      (row: {
        membership_id: string;
        display_name: string;
        role_key: string;
        pin_hash: string;
        pin_salt: string;
      }) => ({
        membershipId: row.membership_id,
        displayName: row.display_name,
        roleKey: row.role_key,
        pinHash: row.pin_hash,
        pinSalt: row.pin_salt,
      })
    ),
  }, { headers: NO_STORE });
}
