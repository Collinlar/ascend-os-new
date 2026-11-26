// What is waiting on the owner, for the top bar's bell (Modules M1).
//
// Asked for by the browser after the page has drawn, so no module page
// waits on Home's figures to open. The same rows Home shows.

import { NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { currentWorkspace } from "@/lib/nav/workspace";
import { loadAttention } from "@/lib/reporting/attention";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handleGET() {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Sign in to pick up where you left off." }, { status: 401 });
  }
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return NextResponse.json({ error: "You do not have access to a business yet." }, { status: 403 });
  }
  const rows = await loadAttention(personId, workspace.businessId, workspace.capabilities);
  if (!rows) {
    return NextResponse.json({ error: "We could not check what needs you just now." }, { status: 503 });
  }
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withAuthority("attention", "GET", handleGET);
