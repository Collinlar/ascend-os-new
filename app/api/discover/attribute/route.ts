// A visit to a business's shop that followed a Discover click (round 3,
// P1). Public, and silent: it never stands between a customer and the shop.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  let body: { ref?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ recorded: false });
  }
  if (!body.ref || !/^[a-f0-9]{32}$/.test(body.ref) || !body.slug) return NextResponse.json({ recorded: false });
  const db = supabaseServer();
  const { data: business } = await db.from("business").select("id").eq("shop_slug", body.slug).maybeSingle();
  if (!business) return NextResponse.json({ recorded: false });
  const { data } = await db.rpc("attribute_discover", { p: { ref: body.ref, step: "visit", business_id: business.id } });
  return NextResponse.json({ recorded: Boolean((data as { attributed?: boolean } | null)?.attributed) });
}

export const POST = withAuthority("discover/attribute", "POST", handlePOST);
