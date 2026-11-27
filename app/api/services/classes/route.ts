// Classes (round 4, S3, decision 3): the owner schedules a class for a
// class service, or cancels one, which cancels its seats with what each
// paid marked to return. Checked again in the database.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) return NextResponse.json({ error: "Your session timed out. Verify your WhatsApp number to continue." }, { status: 401 });
  let body: { businessId?: string; action?: string; itemId?: string; startsAt?: string; seats?: number; locationId?: string; membershipId?: string; note?: string; classId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const db = supabaseServer();
  const { data: membership } = await db.from("business_membership").select("id").eq("business_id", body.businessId ?? "").eq("person_id", personId).eq("status", "active").maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });

  if (body.action === "schedule") {
    const { data, error } = await db.rpc("schedule_class", {
      p: {
        business_id: body.businessId,
        actor_membership_id: membership.id,
        item_id: body.itemId,
        starts_at: body.startsAt,
        seats: Number(body.seats),
        location_id: body.locationId ?? "",
        membership_id: body.membershipId ?? "",
        note: body.note ?? "",
      },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      const said: Array<[RegExp, string, number]> = [
        [/class_in_past/, "Pick a date and time that has not passed.", 422],
        [/seats_out_of_range/, "Seats are between 1 and 200.", 422],
        [/not_a_class/, "Set this service to A class first.", 409],
        [/service_not_found/, "Pick one of your class services.", 404],
        [/place_not_found/, "Pick one of your places.", 422],
        [/teacher_not_on_team/, "Pick someone on your team to teach it.", 422],
        [/function .* does not exist|Could not find the function/, "Classes switch on after this week's update.", 503],
      ];
      const hit = said.find(([re]) => re.test(error.message));
      return NextResponse.json({ error: hit?.[1] ?? "That did not save. Tap again in a moment." }, { status: hit?.[2] ?? 500 });
    }
    return NextResponse.json(data);
  }

  if (body.action === "cancel") {
    const { data, error } = await db.rpc("cancel_class", { p: { business_id: body.businessId, actor_membership_id: membership.id, class_session_id: body.classId, reason: body.reason ?? "" } });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      if (/class_not_found/.test(error.message)) return NextResponse.json({ error: "We could not find that class." }, { status: 404 });
      return NextResponse.json({ error: "That did not save. Tap again in a moment." }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "We could not tell what to do." }, { status: 422 });
}

export const POST = withAuthority("services/classes", "POST", handlePOST);
