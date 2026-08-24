// Provider working hours and time off. A provider manages their own; an
// owner or manager manages anyone's (IDN-004).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

interface DayInput {
  dayOfWeek: number;
  closed?: boolean;
  startTime?: string;
  endTime?: string;
}

interface Body {
  businessId?: string;
  membershipId?: string; // omit to manage your own
  days?: DayInput[];
  timeOff?: { startsAt: string; endsAt: string; reason?: string };
}

// Returns the acting membership if this person may manage the target's
// schedule, or null.
async function authorize(
  personId: string,
  businessId: string,
  targetMembershipId: string
): Promise<{ actingId: string } | null> {
  const db = supabaseServer();
  const { data } = await db
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;

  const roleKey = (data.role as unknown as { key: string } | null)?.key;
  const isSelf = data.id === targetMembershipId;
  const canManageOthers = roleKey === "owner" || roleKey === "manager";
  if (!isSelf && !canManageOthers) return null;

  return { actingId: data.id as string };
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
  if (!body.businessId) {
    return NextResponse.json({ error: "Pick a business." }, { status: 422 });
  }

  const db = supabaseServer();

  // Default target is the caller's own membership.
  let targetId = body.membershipId;
  if (!targetId) {
    const { data: own } = await db
      .from("business_membership")
      .select("id")
      .eq("business_id", body.businessId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();
    targetId = own?.id;
  }
  if (!targetId) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  const auth = await authorize(personId, body.businessId, targetId);
  if (!auth) {
    return NextResponse.json(
      { error: "You can only change your own hours." },
      { status: 403 }
    );
  }

  // Time off: check what it clashes with before blocking, and tell the
  // provider rather than silently stranding customers.
  if (body.timeOff) {
    const { startsAt, endsAt, reason } = body.timeOff;
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      return NextResponse.json(
        { error: "Pick a start and an end, with the end after the start." },
        { status: 422 }
      );
    }

    const { data: clashes } = await db.rpc("bookings_in_period", {
      p_membership_id: targetId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
    });

    const { error } = await db.from("staff_time_off").insert({
      business_id: body.businessId,
      membership_id: targetId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: reason ?? null,
      created_by: auth.actingId,
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not block that time. Tap again in a moment." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      blocked: true,
      // Existing commitments are not cancelled: the provider decides.
      clashes: (clashes ?? []).map(
        (c: { booking_id: string; scheduled_start: string; customer_name: string }) => ({
          bookingId: c.booking_id,
          scheduledStart: c.scheduled_start,
          customerName: c.customer_name,
        })
      ),
    });
  }

  if (!body.days) {
    return NextResponse.json({ error: "Set your hours first." }, { status: 422 });
  }

  const { data, error } = await db.rpc("replace_availability", {
    p: {
      business_id: body.businessId,
      membership_id: targetId,
      actor_membership_id: auth.actingId,
      days: body.days.map((d) => ({
        day_of_week: d.dayOfWeek,
        closed: d.closed ?? false,
        start_time: d.startTime ?? null,
        end_time: d.endTime ?? null,
      })),
    },
  });

  if (error) {
    if (/end_before_start/.test(error.message)) {
      return NextResponse.json(
        { error: "A closing time is before its opening time. Check your days." },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "We could not save your hours just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ openDays: data.open_days });
}

export async function DELETE(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { timeOffId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.timeOffId) {
    return NextResponse.json({ error: "Pick which time off to remove." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: timeOff } = await db
    .from("staff_time_off")
    .select("id, business_id, membership_id")
    .eq("id", body.timeOffId)
    .maybeSingle();
  if (!timeOff) {
    return NextResponse.json({ error: "We could not find that." }, { status: 404 });
  }

  const auth = await authorize(personId, timeOff.business_id, timeOff.membership_id);
  if (!auth) {
    return NextResponse.json(
      { error: "You can only change your own time off." },
      { status: 403 }
    );
  }

  await db.from("staff_time_off").delete().eq("id", timeOff.id);
  return NextResponse.json({ removed: true });
}
