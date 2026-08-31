import { currentPersonId } from "./session";
import { supabaseServer } from "@/lib/supabase";

// Who at Ascend is asking.
//
// Every query in this codebase runs as the service role, which bypasses
// row level security entirely. That is safe only while every path checks
// its own scope first: a merchant route checks membership, and an admin
// route checks this. There is no second line of defence behind it.
//
// A platform admin is a person like any other, signed in the same way. The
// only difference is a live row in platform_admin.

export type PlatformRole = "moderator" | "admin";

export interface PlatformAdmin {
  personId: string;
  name: string;
  role: PlatformRole;
}

export async function currentAdmin(): Promise<PlatformAdmin | null> {
  const personId = await currentPersonId();
  if (!personId) return null;

  try {
    const { data } = await supabaseServer()
      .from("platform_admin")
      .select("role, person:person_id(full_name)")
      .eq("person_id", personId)
      .is("revoked_at", null)
      .maybeSingle();

    if (!data) return null;
    return {
      personId,
      name:
        (data.person as unknown as { full_name: string } | null)?.full_name ??
        "Ascend",
      role: data.role as PlatformRole,
    };
  } catch {
    // A lookup that fails is not an admin. Failing closed is the only safe
    // direction for a check whose whole job is to keep people out.
    return null;
  }
}

// Granting and revoking is the admin role's own right, kept separate from
// moderating so that deciding what is listed does not also mean deciding
// who decides.
export function canGrantAdmin(admin: PlatformAdmin | null): boolean {
  return admin?.role === "admin";
}
