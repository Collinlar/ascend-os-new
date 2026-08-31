// Moderating Discover.
//
// suspend_listing and decide_appeal have existed since migration 0030 and
// nothing has ever called them. This is the door, and it is the only place
// in the app that may open it.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface Body {
  action?: "suspend" | "decide";
  listingId?: string;
  reason?: string;
  /** decide only: true reinstates, false upholds the suspension. */
  restore?: boolean;
}

export async function POST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) {
    // The same answer whether somebody is signed out, signed in as a
    // merchant, or a former moderator. None of them should learn which.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through." }, { status: 400 });
  }

  if (!body.listingId) {
    return NextResponse.json({ error: "Pick a listing." }, { status: 422 });
  }

  const db = supabaseServer();

  if (body.action === "suspend") {
    const reason = (body.reason ?? "").trim();
    if (reason.length < 4) {
      // A suspension a merchant cannot answer is a removal, and DSC-013
      // gives them the right of reply. A reply needs something to reply to.
      return NextResponse.json(
        { error: "Say why. The business sees this and can appeal it." },
        { status: 422 }
      );
    }

    const { error } = await db.rpc("suspend_listing", {
      p: { listing_id: body.listingId, reason },
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not suspend that listing. Try again." },
        { status: 500 }
      );
    }
  } else if (body.action === "decide") {
    const restore = body.restore === true;
    const { error } = await db.rpc("decide_appeal", {
      p: {
        listing_id: body.listingId,
        restore,
        reason: (body.reason ?? "").trim() || null,
      },
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not record that decision. Try again." },
        { status: 500 }
      );
    }

    // Reinstating says the suspension was wrong, not that the business
    // still qualifies. The rule decides that, so it gets the last word:
    // a shop switched off since the appeal stays out of Discover.
    if (restore) {
      const { data: listing } = await db
        .from("discover_listing")
        .select("business_id")
        .eq("id", body.listingId)
        .maybeSingle();
      if (listing) {
        await db.rpc("refresh_discover_listings", {
          p_business: listing.business_id,
        });
      }
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 422 });
  }

  // Whose decision it was. The function records that the platform acted;
  // this records who at the platform.
  await db
    .from("discover_moderation_event")
    .update({ decided_by: admin.personId })
    .eq("listing_id", body.listingId)
    .is("decided_by", null);

  return NextResponse.json({ done: true });
}
