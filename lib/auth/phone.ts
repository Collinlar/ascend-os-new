// Ghana-first phone normalization. Local numbers (0XX XXX XXXX) become
// E.164 (+233...). Other countries must arrive with their country code.

const GHANA_PREFIX = "+233";

export interface PhoneResult {
  ok: boolean;
  e164?: string;
  error?: string;
}

export function normalizePhone(raw: string): PhoneResult {
  const cleaned = raw.replace(/[\s\-().]/g, "");

  if (/^\+\d{10,15}$/.test(cleaned)) {
    return { ok: true, e164: cleaned };
  }
  // Ghanaian local format: 0 followed by 9 digits
  if (/^0\d{9}$/.test(cleaned)) {
    return { ok: true, e164: GHANA_PREFIX + cleaned.slice(1) };
  }
  // 233XXXXXXXXX without the plus
  if (/^233\d{9}$/.test(cleaned)) {
    return { ok: true, e164: "+" + cleaned };
  }
  if (/^\d{9}$/.test(cleaned)) {
    return { ok: true, e164: GHANA_PREFIX + cleaned };
  }
  return {
    ok: false,
    error: "Your WhatsApp number needs a country code, or start it with 0 for Ghana.",
  };
}
