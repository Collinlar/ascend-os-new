// The platform switches, read from the database (0089).
//
//   authority_enforce   which permission groups refuse (Phase 1)
//
// commerce_readers (whether the screens showed the commerce core) is no
// longer read: since Phase 2 step 2d.5 the screens read only the core, so
// there is nothing left to switch. Its row stays in platform_setting as the
// record of what was live.
//
// They used to be deploy settings, and an ordinary Netlify deploy twice ran
// without the current value, quietly switching enforcement off. Read here at
// request time instead, no deploy can change them. Cached per server
// instance for 30 seconds, so a change takes effect within half a minute.
//
// If the table cannot be read, the deploy setting is used as before
// (AUTHORITY_ENFORCE), and that fallback is cached for only
// 5 seconds so the database answer comes back quickly.

import { supabaseServer } from "@/lib/supabase";

export interface PlatformSettings {
  authorityEnforce: Set<string>;
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
      value = {
        // A row that is present wins, even an empty list (nothing enforced).
        authorityEnforce: Array.isArray(groups)
          ? new Set(groups.map((g: unknown) => String(g).trim().toLowerCase()))
          : fallback.authorityEnforce,
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
