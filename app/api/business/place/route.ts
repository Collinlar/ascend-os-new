// Which place to look at (Modules M1): the top bar's place switcher.
//
// The cookie is only a selector. This checks the place is an active place
// of the business you have open and that your membership reaches it; the
// workspace resolver checks again on every read.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { choosePlace } from "@/lib/auth/current-place";
import { currentWorkspace } from "@/lib/nav/workspace";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handlePOST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json({ error: "Your session timed out. Sign in to pick up where you left off." }, { status: 401 });
  }
  let body: { locationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) {
    return NextResponse.json({ error: "You do not have access to a business yet." }, { status: 403 });
  }
  const place = workspace.places.find((p) => p.id === body.locationId);
  if (!place) {
    return NextResponse.json({ error: "That place is not one of yours. Pick one from the list." }, { status: 422 });
  }
  choosePlace(place.id);
  return NextResponse.json({ locationId: place.id, name: place.name });
}

export const POST = withAuthority("business/place", "POST", handlePOST);
