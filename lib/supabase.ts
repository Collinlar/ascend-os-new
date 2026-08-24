import { createClient } from "@supabase/supabase-js";

// Supabase renamed these keys in the dashboard: the anon key is now called
// the publishable key, and the service role key the secret key. Both
// namings are accepted so a project set up from either era of the
// dashboard works without anyone having to know that history.
function read(names: string[], label: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  // Failing here with the names spelled out beats a non-null assertion
  // handing `undefined` to createClient and surfacing as an opaque fetch
  // error three layers down.
  throw new Error(
    `Missing ${label}. Set one of: ${names.join(", ")} in .env.local`
  );
}

const URL_NAMES = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"];

// Browser client: publishable key only. It is safe to ship, and the
// database revokes anon access to every table, view and function anyway
// (migration 0034), so this can only reach what is deliberately opened.
export function supabaseBrowser() {
  return createClient(
    read(URL_NAMES, "Supabase URL"),
    read(
      [
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ],
      "Supabase publishable (anon) key"
    )
  );
}

// Server client for API routes and domain services. The service role
// bypasses RLS, so every call path MUST validate business, membership and
// entitlement scope before touching data (API-002, POS-SYN-003).
export function supabaseServer() {
  return createClient(
    read(URL_NAMES, "Supabase URL"),
    read(
      [
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "NEXT_SERVICE_ROLE_KEY",
      ],
      "Supabase service role (secret) key"
    ),
    { auth: { persistSession: false } }
  );
}
