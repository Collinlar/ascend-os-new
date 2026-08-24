// Owner generates a pairing code for a new till, and revokes a lost one.
// Session-guarded and membership-scoped; the code is shown once.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { hashPairingCode, newPairingCode } from "@/lib/pos/device-auth";

const CODE_TTL_MINUTES = 30;

async function ownerContext(personId: string, businessId: string) {
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
  // Pairing a till is an owner or manager action, not a cashier one.
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

  let body: { businessId?: string; locationId?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Tap again." },
      { status: 400 }
    );
  }
  if (!body.businessId || !body.locationId) {
    return NextResponse.json(
      { error: "Pick which location this till belongs to." },
      { status: 422 }
    );
  }

  const context = await ownerContext(personId, body.businessId);
  if (!context) {
    return NextResponse.json(
      { error: "Only the owner or a manager can set up a till." },
      { status: 403 }
    );
  }

  const code = newPairingCode();
  const db = supabaseServer();
  const { error } = await db.from("device_pairing_code").insert({
    business_id: body.businessId,
    location_id: body.locationId,
    code_hash: hashPairingCode(code),
    mode: "terminal",
    label: body.label ?? "Till",
    created_by: context.membershipId,
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });

  if (error) {
    return NextResponse.json(
      { error: "We could not create a code just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  // Shown once, on this screen only.
  return NextResponse.json({ code, expiresInMinutes: CODE_TTL_MINUTES });
}

export async function DELETE(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { deviceId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  if (!body.deviceId) {
    return NextResponse.json({ error: "Pick which till to stop." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: device } = await db
    .from("device_registration")
    .select("id, business_id")
    .eq("id", body.deviceId)
    .maybeSingle();
  if (!device) {
    return NextResponse.json({ error: "We could not find that till." }, { status: 404 });
  }

  const context = await ownerContext(personId, device.business_id);
  if (!context) {
    return NextResponse.json(
      { error: "Only the owner or a manager can stop a till." },
      { status: 403 }
    );
  }

  const { error } = await db.rpc("revoke_device", {
    p: {
      device_id: device.id,
      actor_membership_id: context.membershipId,
      reason: body.reason ?? "revoked by owner",
    },
  });
  if (error) {
    return NextResponse.json(
      { error: "We could not stop that till just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ revoked: true });
}
