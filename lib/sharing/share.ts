// Server-only: share token minting and hashing. Keeps `crypto` out of any
// module a client component imports — see lib/sharing/fields.ts for the
// client-safe field list.

import "server-only";
import { createHash, randomBytes } from "crypto";

export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/partner/${token}`;
}
