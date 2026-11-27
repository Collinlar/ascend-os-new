// Merchant-facing Discover management: start a campaign, pause one, or
// appeal a suspension.

import { NextRequest, NextResponse } from "next/server";
import { deniedByDatabase } from "@/lib/authority/denied";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

interface Body {
  action?: "start_campaign" | "pause_campaign" | "resume_campaign" | "appeal" | "create_campaign" | "estimate";
  listingId?: string;
  // New campaign (round 3, P2)
  kind?: string;
  dailyBudget?: number;
  days?: number;
  placeIds?: string[];
  radiusKm?: number;
  interests?: string[];
  category?: string | null;
  campaignId?: string;
  budget?: number;
  note?: string;
}

async function handlePOST(request: NextRequest) {
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

  // What a campaign like this is likely to reach (decision 3): only from
  // at least 10 campaigns in the same category over 60 days.
  if (body.action === "estimate") {
    const { data } = await db.rpc("promotion_estimate", {
      p_category: body.category ?? null,
      p_daily: Number(body.dailyBudget) || 0,
      p_days: Number(body.days) || 0,
    });
    return NextResponse.json({ estimate: data ?? null });
  }

  // A new campaign, sent for review (round 3, P2). The database checks the
  // permission, the listing, the places and the Balance again.
  if (body.action === "create_campaign") {
    const { data, error } = await db.rpc("create_campaign", {
      p: {
        business_id: membership.business_id,
        actor_membership_id: membership.id,
        listing_id: body.listingId ?? "",
        kind: body.kind ?? "",
        daily_budget: Number(body.dailyBudget) || 0,
        days: Number(body.days) || 0,
        place_ids: Array.isArray(body.placeIds) ? body.placeIds.slice(0, 20) : [],
        radius_km: Number(body.radiusKm) || 5,
        interests: Array.isArray(body.interests) ? body.interests.map((w) => String(w).slice(0, 30)).slice(0, 8) : [],
      },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      const said: Array<[RegExp, string, number]> = [
        [/insufficient_balance/, "Your Ascend Balance does not cover one day of that budget. Top up, or choose a smaller daily budget.", 422],
        [/listing_not_eligible/, "This listing is not showing on Discover right now, so it cannot be promoted yet.", 409],
        [/listing_not_found/, "Choose what to promote.", 422],
        [/kind_mismatch/, "That does not match the kind of boost. Pick the product, service or shop again.", 422],
        [/places_needed/, "Choose at least one of your shops.", 422],
        [/location_boost_one_place/, "A Location Boost is for one branch. Choose one.", 422],
        [/daily_budget_invalid/, "A daily budget is between GHS 5 and GHS 1,000.", 422],
        [/days_invalid/, "Choose 7, 14 or 30 days.", 422],
        [/too_many_interests/, "Keep it to 8 things people look for.", 422],
        [/restricted_discover/, "Promotion is paused for this business by Ascend.", 403],
        [/Could not find the function|function .* does not exist/, "New campaigns switch on after this week's update.", 503],
      ];
      const hit = said.find(([re]) => re.test(error.message));
      return NextResponse.json(
        { error: hit ? hit[1] : "We could not send this campaign just now. Tap again in a moment." },
        { status: hit ? hit[2] : 500 }
      );
    }
    return NextResponse.json({ campaignId: (data as { campaign_id: string }).campaign_id, most: (data as { most: number }).most });
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

  // Resume what the business paused (round 3, P1): only while the listing
  // may be shown, budget is left and the end date has not passed.
  if (body.action === "resume_campaign") {
    if (!body.campaignId) return NextResponse.json({ error: "Pick a campaign." }, { status: 422 });
    const { data: campaign } = await db
      .from("discover_campaign")
      .select("id, business_id, status, budget, spent, ends_at, listing:listing_id(status)")
      .eq("id", body.campaignId)
      .maybeSingle();
    if (!campaign || campaign.business_id !== membership.business_id) {
      return NextResponse.json({ error: "We could not find that campaign." }, { status: 404 });
    }
    if (campaign.status !== "paused") {
      return NextResponse.json({ error: "Only a paused campaign can be resumed." }, { status: 409 });
    }
    if ((campaign.listing as unknown as { status: string } | null)?.status !== "eligible") {
      return NextResponse.json({ error: "This listing is not showing on Discover right now, so it cannot be promoted." }, { status: 409 });
    }
    if (Number(campaign.spent) >= Number(campaign.budget)) {
      return NextResponse.json({ error: "The budget for this campaign is used up. Start a new one instead." }, { status: 409 });
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
    if (campaign.ends_at && (campaign.ends_at as string) < today) {
      return NextResponse.json({ error: "This campaign has ended. Start a new one instead." }, { status: 409 });
    }
    await db.from("discover_campaign").update({ status: "running" }).eq("id", campaign.id).eq("status", "paused");
    return NextResponse.json({ resumed: true });
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

export const POST = withAuthority("discover/promote", "POST", handlePOST);
