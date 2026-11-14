// When the database itself refuses an action (Phase 1 step 1d: the
// high-risk functions call require_permission), the person should be told
// their role does not allow it, not "tap again", which would never work.
// "permission_denied" only ever comes from require_permission, so this
// cannot mislabel any other error.

import { NextResponse } from "next/server";

export function deniedByDatabase(error: { message?: string } | null | undefined): NextResponse | null {
  if (!error?.message || !/permission_denied/.test(error.message)) return null;
  return NextResponse.json(
    { error: "Your role does not allow this. Ask the owner or a manager." },
    { status: 403 }
  );
}
