// Public Discover search, and click recording. No account required: this is
// how customers find businesses (DSC-003).

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  let body: { listingId?: string; campaignId?: string; sessionRef?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through." }, { status: 400 });
  }
  if (!body.listingId) {
    return NextResponse.json({ error: "Missing listing." }, { status: 422 });
  }

  const db = supabaseServer();
  const { error } = await db.rpc("record_discover_click", {
    p: {
      listing_id: body.listingId,
      campaign_id: body.campaignId ?? "",
      session_ref: body.sessionRef ?? null,
    },
  });

  // A click that fails to record must never block the customer from
  // reaching the business they chose.
  if (error) {
    return NextResponse.json({ recorded: false });
  }
  return NextResponse.json({ recorded: true });
}
