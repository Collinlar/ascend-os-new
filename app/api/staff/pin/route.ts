// Setting and clearing a person's till PIN.
//
// The digits never reach here. The browser derives the PBKDF2 hash against
// a salt it generates, and only the hash and salt are sent, which is what
// lets migration 0032 promise the server never sees a PIN.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

// Handing someone a till PIN is granting access to the money drawer, so it
// is an owner or manager action (IDN-016).
async function actorContext(personId: string, businessId: string) {
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
  return { membershipId: data.id as string };
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
    membershipId?: string;
    pinHash?: string;
    pinSalt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  if (!body.businessId || !body.membershipId) {
    return NextResponse.json({ error: "Pick who this PIN is for." }, { status: 422 });
  }
  if (!body.pinHash || !body.pinSalt) {
    return NextResponse.json(
      { error: "That PIN did not come through. Type the 4 digits again." },
      { status: 422 }
    );
  }

  const actor = await actorContext(personId, body.businessId);
  if (!actor) {
    return NextResponse.json(
      { error: "Only the owner or a manager can set a till PIN." },
      { status: 403 }
    );
  }

  const db = supabaseServer();

  // The target must belong to the same business, or an owner of one shop
  // could set a PIN on somebody in another.
  const { data: target } = await db
    .from("business_membership")
    .select("id")
    .eq("id", body.membershipId)
    .eq("business_id", body.businessId)
    .eq("status", "active")
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "We could not find that person." }, { status: 404 });
  }

  const { error } = await db.rpc("set_staff_pin", {
    p: {
      membership_id: body.membershipId,
      pin_hash: body.pinHash,
      pin_salt: body.pinSalt,
      actor_membership_id: actor.membershipId,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not save that PIN just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: true });
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
    return NextResponse.json({ error: "Pick whose PIN to remove." }, { status: 422 });
  }

  const actor = await actorContext(personId, body.businessId);
  if (!actor) {
    return NextResponse.json(
      { error: "Only the owner or a manager can remove a till PIN." },
      { status: 403 }
    );
  }

  const db = supabaseServer();
  const { data: target } = await db
    .from("business_membership")
    .select("id")
    .eq("id", body.membershipId)
    .eq("business_id", body.businessId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "We could not find that person." }, { status: 404 });
  }

  const { error } = await db.rpc("clear_staff_pin", {
    p: { membership_id: body.membershipId },
  });
  if (error) {
    return NextResponse.json(
      { error: "We could not remove that PIN just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ cleared: true });
}
