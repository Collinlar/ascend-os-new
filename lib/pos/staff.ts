// Cashier identification on a shared till (POS-014, IDN-007).
//
// PINs are verified on the device so the till keeps working with no
// network. The derivation is PBKDF2 through Web Crypto — slow enough that a
// cached roster is not a list of PINs waiting to be read, fast enough that
// a cashier does not wait at the counter.
//
// A PIN says who is at the till. It is not a password and does not unlock
// anything owner-level: the terminal is already restricted to selling, and
// the owner's own session lives on their phone, not here (IDN-007).

import { getMeta, setMeta } from "./db";
import { getDeviceToken } from "./registration";

const ROSTER_KEY = "staffRoster";
const ACTIVE_KEY = "activeCashier";
const ATTEMPTS_KEY = "pinAttempts";

const ITERATIONS = 100_000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export interface StaffMember {
  membershipId: string;
  displayName: string;
  roleKey: string;
  pinHash: string;
  pinSalt: string;
}

export interface ActiveCashier {
  membershipId: string;
  displayName: string;
  roleKey: string;
  since: string;
}

// PBKDF2-SHA256 over the salt the server issued for this person.
export async function derivePin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getRoster(): Promise<StaffMember[]> {
  return (await getMeta<StaffMember[]>(ROSTER_KEY)) ?? [];
}

// Pulled alongside the catalogue so a till that has been online once can
// identify its people forever after.
export async function pullRoster(): Promise<boolean> {
  const token = await getDeviceToken();
  if (!token) return false;
  try {
    const response = await fetch("/api/pos/staff", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { staff: StaffMember[] };
    await setMeta(ROSTER_KEY, data.staff);
    return true;
  } catch {
    return false;
  }
}

export interface PinAttemptState {
  failed: number;
  lockedUntil: number | null;
}

async function attemptState(): Promise<PinAttemptState> {
  return (await getMeta<PinAttemptState>(ATTEMPTS_KEY)) ?? { failed: 0, lockedUntil: null };
}

export async function lockRemainingMs(): Promise<number> {
  const state = await attemptState();
  if (!state.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - Date.now());
}

export type PinResult =
  | { ok: true; cashier: ActiveCashier }
  | { ok: false; reason: "wrong" | "locked" | "no_roster"; triesLeft?: number; waitMs?: number };

// Matches a PIN against one roster. Split out so the same comparison can
// run twice: once against what the till has, and once against a freshly
// pulled roster if that failed.
async function matchAgainst(
  roster: StaffMember[],
  pin: string
): Promise<ActiveCashier | null> {
  for (const member of roster) {
    if (!member.pinSalt || !member.pinHash) continue;
    const derived = await derivePin(pin, member.pinSalt);
    if (timingSafeEqual(derived, member.pinHash)) {
      return {
        membershipId: member.membershipId,
        displayName: member.displayName,
        roleKey: member.roleKey,
        since: new Date().toISOString(),
      };
    }
  }
  return null;
}

// Verifies against every person on the roster: a cashier enters their PIN,
// not their name and then their PIN. Four taps and they are selling.
export async function signInWithPin(pin: string): Promise<PinResult> {
  const state = await attemptState();
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    return { ok: false, reason: "locked", waitMs: state.lockedUntil - Date.now() };
  }

  let roster = await getRoster();
  if (roster.length === 0) return { ok: false, reason: "no_roster" };

  let cashier = await matchAgainst(roster, pin);

  // A PIN that should work and does not is the likeliest sign the till is
  // holding an old roster: the owner just set or changed it on their phone
  // while the cashier waited at the counter. That is the one moment a
  // refresh is worth doing, and it used to be the moment nothing happened,
  // so the correct PIN read as wrong until the till locked itself.
  //
  // The retry runs before the attempt is counted. Being out of date is the
  // till's fault, and it must not cost the cashier their tries.
  if (!cashier && typeof navigator !== "undefined" && navigator.onLine) {
    const refreshed = await pullRoster();
    if (refreshed) {
      roster = await getRoster();
      cashier = await matchAgainst(roster, pin);
    }
  }

  if (cashier) {
    await setMeta(ATTEMPTS_KEY, { failed: 0, lockedUntil: null });
    await setMeta(ACTIVE_KEY, cashier);
    return { ok: true, cashier };
  }

  // Genuinely wrong. Ten thousand combinations is not many, so guessing is
  // rate-limited rather than merely counted.
  const failed = state.failed + 1;
  if (failed >= MAX_ATTEMPTS) {
    await setMeta(ATTEMPTS_KEY, { failed: 0, lockedUntil: Date.now() + LOCKOUT_MS });
    return { ok: false, reason: "locked", waitMs: LOCKOUT_MS };
  }
  await setMeta(ATTEMPTS_KEY, { failed, lockedUntil: null });
  return { ok: false, reason: "wrong", triesLeft: MAX_ATTEMPTS - failed };
}

export async function activeCashier(): Promise<ActiveCashier | undefined> {
  return getMeta<ActiveCashier>(ACTIVE_KEY);
}

// Handing the till to the next person. The basket is the caller's to clear;
// this only forgets who was standing here.
export async function signOutCashier(): Promise<void> {
  await setMeta(ACTIVE_KEY, undefined);
}

// Comparison time should not depend on how much of the hash matched.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
