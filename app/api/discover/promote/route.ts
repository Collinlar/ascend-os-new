// Merchant-facing Discover management: start a campaign, pause one, or
// appeal a suspension.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";

interface Body {
  action?: "start_campaign" | "pause_campaign" | "appeal";
  listingId?: string;
  campaignId?: string;
  budget?: number;
  note?: string;
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const db = supabaseServer();
  const membership = await activeMembership<{ id: string; business_id: string; role: { key: string } | null }>(personId, "id, business_id, role:role_id(key)");
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to a business yet." },
      { status: 403 }
    );
  }
  const roleKey = (membership.role as unknown as { key: string } | null)?.key;
  if (roleKey !== "owner" && roleKey !== "manager") {
    return NextResponse.json(
      { error: "Only the owner or a manager can spend on promotion." },
      { status: 403 }
    );
  }

  if (body.action === "start_campaign") {
    if (!body.listingId || !(Number(body.budget) > 0)) {
      return NextResponse.json(
        { error: "Choose what to promote and how much to spend." },
        { status: 422 }
      );
    }

    const { data, error } = await db.rpc("start_campaign", {
      p: {
        listing_id: body.listingId,
        budget: body.budget,
        created_by: membership.id,
      },
    });

    if (error) {
      if (/insufficient_balance/.test(error.message)) {
        return NextResponse.json(
          { error: "Your Ascend Balance does not cover that budget. Top up first." },
          { status: 422 }
        );
      }
      if (/listing_not_eligible/.test(error.message)) {
        return NextResponse.json(
          { error: "This listing cannot be promoted while it is under review." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "We could not start that campaign. Tap again in a moment." },
        { status: 500 }
      );
    }
    return NextResponse.json({ campaignId: data.campaign_id });
  }

  if (body.action === "pause_campaign") {
    if (!body.campaignId) {
      return NextResponse.json({ error: "Pick a campaign." }, { status: 422 });
    }
    const { data: campaign } = await db
      .from("discover_campaign")
      .select("id, business_id")
      .eq("id", body.campaignId)
      .maybeSingle();
    if (!campaign || campaign.business_id !== membership.business_id) {
      return NextResponse.json({ error: "We could not find that campaign." }, { status: 404 });
    }
    await db.from("discover_campaign").update({ status: "paused" }).eq("id", campaign.id);
    return NextResponse.json({ paused: true });
  }

  if (body.action === "appeal") {
    if (!body.listingId || !(body.note ?? "").trim()) {
      return NextResponse.json(
        { error: "Tell us what you want us to reconsider." },
        { status: 422 }
      );
    }
    const { data: listing } = await db
      .from("discover_listing")
      .select("id, business_id")
      .eq("id", body.listingId)
      .maybeSingle();
    if (!listing || listing.business_id !== membership.business_id) {
      return NextResponse.json({ error: "We could not find that listing." }, { status: 404 });
    }

    const { error } = await db.rpc("appeal_listing", {
      p: {
        listing_id: listing.id,
        note: body.note,
        actor_membership_id: membership.id,
      },
    });
    if (error) {
      if (/nothing_to_appeal/.test(error.message)) {
        return NextResponse.json(
          { error: "This listing is not suspended, so there is nothing to appeal." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "We could not send your appeal. Tap again in a moment." },
        { status: 500 }
      );
    }
    return NextResponse.json({ appealed: true });
  }

  return NextResponse.json({ error: "That is not an action we handle." }, { status: 422 });
}
