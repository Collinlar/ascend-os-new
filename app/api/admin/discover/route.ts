// Moderating Discover.
//
// suspend_listing and decide_appeal have existed since migration 0030 and
// nothing has ever called them. This is the door, and it is the only place
// in the app that may open it.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "suspend" | "decide" | "review_campaign";
  listingId?: string;
  /** review_campaign (round 3, P2) */
  campaignId?: string;
  approve?: boolean;
  reason?: string;
  /** decide only: true reinstates, false upholds the suspension. */
  restore?: boolean;
}

async function handlePOST(request: NextRequest) {
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

  const db = supabaseServer();

  // A new campaign waiting for review (round 3, P2). Approving starts it
  // today; declining ends it with the reason, and nothing was charged.
  if (body.action === "review_campaign") {
    if (!body.campaignId) return NextResponse.json({ error: "Pick a campaign." }, { status: 422 });
    const { data, error } = await db.rpc("review_campaign", {
      p: {
        admin_person_id: admin.personId,
        campaign_id: body.campaignId,
        decision: body.approve ? "approve" : "decline",
        note: body.reason ?? "",
      },
    });
    if (error) {
      const msg = /note_needed/.test(error.message)
        ? "Say what the business should change, in at least 10 characters."
        : /listing_not_eligible/.test(error.message)
          ? "Its listing is not showing on Discover, so it cannot start. Decline it with the reason."
          : /admin_only/.test(error.message)
            ? "Only a platform admin can review campaigns."
            : "That did not go through. Tap again.";
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    const out = data as { status?: string; already?: string };
    return NextResponse.json({ ok: true, status: out.status ?? out.already });
  }

  if (!body.listingId) {
    return NextResponse.json({ error: "Pick a listing." }, { status: 422 });
  }

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

export const POST = withAuthority("admin/discover", "POST", handlePOST);
