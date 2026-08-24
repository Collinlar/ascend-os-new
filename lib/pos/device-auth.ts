// Server-side device authentication for terminal endpoints. A terminal
// presents its token as a Bearer credential; the token is only ever stored
// hashed, so the database never holds anything that could drive a till.

import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Offline authority is time limited (POS-OFF-006). Each authenticated call
// renews it, so an active till never notices while an abandoned one expires.
export const LEASE_DAYS = 14;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return `dev_${randomBytes(32).toString("base64url")}`;
}

// Pairing codes are typed by a cashier, so they avoid characters that get
// misread on a small screen (no O/0, I/1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPairingCode(): string {
  const bytes = randomBytes(6);
  const code = Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join("");
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function hashPairingCode(code: string): string {
  // Case and dashes are cosmetic; the cashier should not be punished for
  // typing "abc def".
  const normalized = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export interface DeviceContext {
  deviceId: string;
  businessId: string;
  locationId: string;
  mode: string;
  label: string | null;
  deviceNumber: number | null;
  leaseExpiresAt: string;
}

// Resolves the Bearer token to a live device, renewing its lease. Returns
// null for missing, unknown, revoked or retired devices — callers must
// treat null as "stop", not "continue unauthenticated" (OFL-013).
export async function authenticateDevice(
  request: NextRequest
): Promise<DeviceContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const db = supabaseServer();
  const { data, error } = await db.rpc("authenticate_device", {
    p_token_hash: hashToken(token),
    p_lease_days: LEASE_DAYS,
  });

  if (error || !data) return null;

  return {
    deviceId: data.device_id,
    businessId: data.business_id,
    locationId: data.location_id,
    mode: data.mode,
    label: data.label ?? null,
    deviceNumber: data.device_number ?? null,
    leaseExpiresAt: data.lease_expires_at,
  };
}
