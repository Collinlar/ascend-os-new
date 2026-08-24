// The people who work here.
//
// A cashier gets no account: the PIN is derived in the browser and only the
// hash arrives, so adding somebody never involves a password and the server
// never learns their digits.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export interface TeamMember {
  membershipId: string;
  displayName: string;
  roleKey: string;
  status: string;
  hasPin: boolean;
}

// Adding and removing people is an owner or manager action; manager already
// carries staff.manage in its permission set.
async function actor(personId: string, businessId: string) {
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
  if (roleKey !== "owner" && roleKey !== "manager") return null;
  return { membershipId: data.id as string, roleKey };
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: {
    businessId?: string;
    fullName?: string;
    phone?: string | null;
    roleKey?: string;
    pinHash?: string;
    pinSalt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.businessId || !(body.fullName ?? "").trim()) {
    return NextResponse.json(
      { error: "Give this person a name so receipts can say who served." },
      { status: 422 }
    );
  }

  const acting = await actor(personId, body.businessId);
  if (!acting) {
    return NextResponse.json(
      { error: "Only the owner or a manager can add people." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseServer().rpc("add_team_member", {
    p: {
      business_id: body.businessId,
      full_name: body.fullName,
      phone_e164: body.phone ?? "",
      role_key: body.roleKey ?? "cashier",
      pin_hash: body.pinHash ?? "",
      pin_salt: body.pinSalt ?? "",
      actor_membership_id: acting.membershipId,
    },
  });

  if (error) {
    if (/already_a_member/.test(error.message)) {
      return NextResponse.json(
        { error: "That person is already on your team." },
        { status: 409 }
      );
    }
    if (/name_required/.test(error.message)) {
      return NextResponse.json(
        { error: "Give this person a name so receipts can say who served." },
        { status: 422 }
      );
    }
    if (/role_not_allowed/.test(error.message)) {
      return NextResponse.json(
        { error: "Pick either cashier or manager." },
        { status: 422 }
      );
    }
    // A phone already held by somebody else, most likely.
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json(
        { error: "That number already belongs to someone else. Leave it empty, or check it." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "We could not add them just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ membershipId: data.membership_id });
}

export async function DELETE(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { businessId?: string; membershipId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.businessId || !body.membershipId) {
    return NextResponse.json({ error: "Pick who has left." }, { status: 422 });
  }

  const acting = await actor(personId, body.businessId);
  if (!acting) {
    return NextResponse.json(
      { error: "Only the owner or a manager can remove people." },
      { status: 403 }
    );
  }

  const { error } = await supabaseServer().rpc("remove_team_member", {
    p: {
      business_id: body.businessId,
      membership_id: body.membershipId,
      actor_membership_id: acting.membershipId,
    },
  });

  if (error) {
    if (/cannot_remove_owner/.test(error.message)) {
      return NextResponse.json(
        { error: "The owner cannot be removed from their own business." },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "We could not remove them just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ removed: true });
}
