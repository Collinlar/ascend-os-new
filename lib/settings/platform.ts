// The platform switches, read from the database (0089).
//
//   authority_enforce   which permission groups refuse (Phase 1)
//   commerce_readers    whether the screens show the commerce core (Phase 2)
//
// They used to be deploy settings, and an ordinary Netlify deploy twice ran
// without the current value, quietly switching enforcement off. Read here at
// request time instead, no deploy can change them. Cached per server
// instance for 30 seconds, so a change takes effect within half a minute.
//
// If the table cannot be read, the deploy settings are used as before
// (AUTHORITY_ENFORCE, COMMERCE_READERS), and that fallback is cached for only
// 5 seconds so the database answer comes back quickly.

import { supabaseServer } from "@/lib/supabase";

export interface PlatformSettings {
  authorityEnforce: Set<string>;
  commerceReaders: "core" | "compare";
  source: "database" | "deploy_settings";
}

const TTL_MS = 30_000;
const FALLBACK_TTL_MS = 5_000;
let cached: { at: number; ttl: number; value: PlatformSettings } | null = null;

function fromDeploySettings(): PlatformSettings {
  return {
    authorityEnforce: new Set(
      (process.env.AUTHORITY_ENFORCE ?? "")
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean)
    ),
    commerceReaders: process.env.COMMERCE_READERS === "core" ? "core" : "compare",
    source: "deploy_settings",
  };
}

export async function platformSettings(): Promise<PlatformSettings> {
  if (cached && Date.now() - cached.at < cached.ttl) return cached.value;

  const fallback = fromDeploySettings();
  let value: PlatformSettings = fallback;
  let ttl = FALLBACK_TTL_MS;
  try {
    const { data, error } = await supabaseServer()
      .from("platform_setting")
      .select("key, value");
    if (!error && data) {
      const row = (key: string) => data.find((r) => r.key === key)?.value;
      const groups = row("authority_enforce");
      const readers = row("commerce_readers");
      value = {
        // A row that is present wins, even an empty list (nothing enforced).
        authorityEnforce: Array.isArray(groups)
          ? new Set(groups.map((g: unknown) => String(g).trim().toLowerCase()))
          : fallback.authorityEnforce,
        commerceReaders:
          readers === "core" || readers === "compare" ? readers : fallback.commerceReaders,
        source: "database",
      };
      ttl = TTL_MS;
    }
  } catch {
    // Fall back to the deploy settings, briefly.
  }
  cached = { at: Date.now(), ttl, value };
  return value;
}
