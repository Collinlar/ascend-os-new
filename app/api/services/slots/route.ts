// Free slots for a service on a date. Public: a customer choosing a time
// has no account (SRV-005). Returns only future, unbooked slots.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { effectiveAccess } from "@/lib/domains/entitlements";

export const dynamic = "force-dynamic";

interface Slot {
  slot_start: string;
  slot_end: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const itemId = params.get("itemId");
  const membershipId = params.get("membershipId");
  const date = params.get("date");

  if (!itemId || !membershipId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pick a service and a day." }, { status: 422 });
  }

  const db = supabaseServer();

  // The item names the business, and the business has to be taking
  // bookings at all. Slot times leak a provider's working day, so this is
  // gated like every other door into Services.
  const { data: item } = await db
    .from("catalogue_item")
    .select("business_id")
    .eq("id", itemId)
    .eq("kind", "service")
    .eq("active", true)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "That service is not available." }, { status: 404 });
  }

  const access = await effectiveAccess(item.business_id as string).catch(() => null);
  if (!access?.capabilities.has("services.bookings")) {
    return NextResponse.json(
      { error: "This business is not taking bookings right now." },
      { status: 404 }
    );
  }

  // "Anybody" means every provider who has published hours. Their free
  // times are merged, and each slot remembers who could actually take it,
  // so the booking that follows names a real person rather than hoping.
  let providers: string[];
  if (membershipId === "any") {
    const { data: rows } = await db
      .from("staff_availability")
      .select("membership_id")
      .eq("business_id", item.business_id);
    providers = Array.from(
      new Set((rows ?? []).map((r) => r.membership_id as string))
    );
  } else {
    providers = [membershipId];
  }

  if (providers.length === 0) return NextResponse.json({ slots: [] });

  const results = await Promise.all(
    providers.map(async (id) => {
      const { data, error } = await db.rpc("available_slots", {
        p_item_id: itemId,
        p_membership_id: id,
        p_date: date,
      });
      return { id, slots: error ? [] : ((data ?? []) as Slot[]), failed: Boolean(error) };
    })
  );

  // One provider's calendar failing should not silently look like a fully
  // booked day, so a total failure is reported rather than returned empty.
  if (results.every((r) => r.failed)) {
    return NextResponse.json(
      { error: "We could not load the times just now. Tap again in a moment." },
      { status: 502 }
    );
  }

  const merged = new Map<string, { start: string; end: string; membershipIds: string[] }>();
  for (const result of results) {
    for (const slot of result.slots) {
      const existing = merged.get(slot.slot_start);
      if (existing) existing.membershipIds.push(result.id);
      else
        merged.set(slot.slot_start, {
          start: slot.slot_start,
          end: slot.slot_end,
          membershipIds: [result.id],
        });
    }
  }

  return NextResponse.json({
    slots: Array.from(merged.values()).sort((a, b) => a.start.localeCompare(b.start)),
  });
}
