// Terminal pairing: a cashier types the owner's code, the terminal receives
// its device token once and stores it locally. The token is returned in
// this response and never again.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  hashPairingCode,
  hashToken,
  newDeviceToken,
  LEASE_DAYS,
} from "@/lib/pos/device-auth";

export async function POST(request: NextRequest) {
  let body: { code?: string; deviceFingerprint?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Type the code again." },
      { status: 400 }
    );
  }

  const code = (body.code ?? "").trim();
  if (code.replace(/[^a-zA-Z0-9]/g, "").length !== 6) {
    return NextResponse.json(
      { error: "That code should be 6 characters. Check it and type it again." },
      { status: 422 }
    );
  }

  const token = newDeviceToken();
  const db = supabaseServer();

  const { data, error } = await db.rpc("register_device", {
    p: {
      code_hash: hashPairingCode(code),
      token_hash: hashToken(token),
      device_fingerprint: body.deviceFingerprint ?? "",
      model: body.model ?? null,
      lease_days: LEASE_DAYS,
    },
  });

  if (error) {
    const message = /pairing_code_used/.test(error.message)
      ? "That code has already been used. Ask for a fresh one."
      : /pairing_code_expired/.test(error.message)
        ? "That code has expired. Ask for a fresh one."
        : /pairing_code_invalid/.test(error.message)
          ? "We do not know that code. Check it and type it again."
          : "We could not set up this till just now. Tap again in a moment.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  return NextResponse.json({
    token,
    deviceId: data.device_id,
    businessId: data.business_id,
    locationId: data.location_id,
    leaseExpiresAt: data.lease_expires_at,
    // Which till this is, for the receipt prefix. Only the business knows
    // what it has already handed out, so the server decides.
    deviceNumber: data.device_number ?? null,
  });
}
