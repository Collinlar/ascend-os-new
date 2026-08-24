// Taking on another product set, or setting one down.
//
// This is what turns a till business into one that also sells online, and
// it is the mechanism the whole start-where-you-are promise rests on. Owner
// or manager only: it changes what the business is, not just what a screen
// shows.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The sets a merchant can switch on themselves. Discover and readiness are
// platform-managed, and office arrives with the sets that embed it.
const SELF_SERVE = ["shop", "services", "documents", "pos"] as const;

async function actor(personId: string, businessId: string) {
  const db = supabaseServer();
  const { data } = await db
    .from("business_membership")
    .select("id, role:role_id(key)")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const roleKey = (data.role as unknown as { key: string } | null)?.key;
  if (roleKey !== "owner" && roleKey !== "manager") return null;
  return { membershipId: data.id as string };
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { businessId?: string; productSet?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const key = String(body.productSet ?? "");
  if (!body.businessId || !SELF_SERVE.includes(key as never)) {
    return NextResponse.json({ error: "Pick something you can turn on." }, { status: 422 });
  }

  const acting = await actor(personId, body.businessId);
  if (!acting) {
    return NextResponse.json(
      { error: "Only the owner or a manager can change this." },
      { status: 403 }
    );
  }

  const turningOn = body.enabled !== false;
  const { error } = await supabaseServer().rpc(
    turningOn ? "enable_product_set" : "disable_product_set",
    {
      p: {
        business_id: body.businessId,
        product_set_key: key,
        actor_membership_id: acting.membershipId,
      },
    }
  );

  if (error) {
    if (/cannot_disable_last_set/.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "This is the only part of your business still running. Add another before you set this one down.",
        },
        { status: 422 }
      );
    }
    // The merchant gets something they can act on. The cause goes to the
    // server log, because a 500 whose reason is thrown away is how a
    // missing function reads as a network problem for a week.
    console.error("product_set change failed", {
      productSet: key,
      turningOn,
      cause: error.message,
    });
    return NextResponse.json(
      { error: "We could not change that just now. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ productSet: key, enabled: turningOn });
}
