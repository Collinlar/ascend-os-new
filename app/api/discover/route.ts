// Public Discover search, and click recording. No account required: this is
// how customers find businesses (DSC-003).

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const db = supabaseServer();

  const { data, error } = await db.rpc("discover_search", {
    p_query: params.get("q") || null,
    p_city: params.get("city") || null,
    p_category: params.get("category") || null,
    p_limit: 20,
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not search just now. Try again in a moment." },
      { status: 502 }
    );
  }

  // Impressions are recorded for the promoted rows the customer was
  // actually shown, so merchants can see reach they paid for.
  const promoted = (data ?? []).filter(
    (r: { promoted: boolean; campaign_id: string | null }) => r.promoted && r.campaign_id
  );
  if (promoted.length > 0) {
    await db.from("discover_event").insert(
      promoted.map((r: { listing_id: string; campaign_id: string }) => ({
        listing_id: r.listing_id,
        campaign_id: r.campaign_id,
        interaction: "impression",
        was_promoted: true,
      }))
    );
  }

  return NextResponse.json({ results: data ?? [] });
}

async function handlePOST(request: NextRequest) {
  let body: { listingId?: string; campaignId?: string; sessionRef?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through." }, { status: 400 });
  }
  if (!body.listingId) {
    return NextResponse.json({ error: "Missing listing." }, { status: 422 });
  }

  // The click's private reference, made here so a page cannot invent one.
  // It rides on the link to the shop so what follows can be counted for
  // the promotion (round 3, P1).
  const ref = randomBytes(16).toString("hex");
  const db = supabaseServer();
  const { error } = await db.rpc("record_discover_click", {
    p: {
      listing_id: body.listingId,
      campaign_id: body.campaignId ?? "",
      session_ref: ref,
    },
  });

  // A click that fails to record must never block the customer from
  // reaching the business they chose.
  if (error) {
    return NextResponse.json({ recorded: false });
  }
  return NextResponse.json({ recorded: true, ref });
}

export const GET = withAuthority("discover", "GET", handleGET);
export const POST = withAuthority("discover", "POST", handlePOST);
