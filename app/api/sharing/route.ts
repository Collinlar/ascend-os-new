// Business-side consent: grant a scoped report share, or end one.
// Owners only — sharing a business's record is not a staff decision.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { hashShareToken, newShareToken, shareUrl } from "@/lib/sharing/share";

async function ownerMembership(personId: string) {
  const data = await activeMembership<{
    id: string;
    business_id: string;
    role: { key: string } | null;
  }>(personId, "id, business_id, role:role_id(key)");
  if (!data) return null;
  const roleKey = (data.role as unknown as { key: string } | null)?.key;
  if (roleKey !== "owner") return null;
  return { membershipId: data.id as string, businessId: data.business_id as string };
}

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: {
    fields?: string[];
    purpose?: string;
    periodFrom?: string;
    periodTo?: string;
    expiresInDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const owner = await ownerMembership(personId);
  if (!owner) {
    return NextResponse.json(
      { error: "Only the owner can share the business record." },
      { status: 403 }
    );
  }
  if (!body.fields?.length) {
    return NextResponse.json(
      { error: "Choose at least one thing to share." },
      { status: 422 }
    );
  }
  if (!(body.purpose ?? "").trim()) {
    return NextResponse.json(
      { error: "Say who this is for and why. It is recorded with the share." },
      { status: 422 }
    );
  }

  const token = newShareToken();
  const days = Math.min(Math.max(body.expiresInDays ?? 30, 1), 180);
  const db = supabaseServer();

  const { data, error } = await db.rpc("grant_report_share", {
    p: {
      business_id: owner.businessId,
      consent_granted_by: owner.membershipId,
      authorized_fields: body.fields,
      purpose: body.purpose,
      period_from: body.periodFrom ?? "",
      period_to: body.periodTo ?? "",
      token_hash: hashShareToken(token),
      expires_at: new Date(Date.now() + days * 86400_000).toISOString(),
    },
  });

  if (error) {
    if (/field_not_shareable/.test(error.message)) {
      return NextResponse.json(
        { error: "One of those cannot be shared. Refresh and choose again." },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: "We could not create that share. Tap again in a moment." },
      { status: 500 }
    );
  }

  // Shown once. The link is the credential.
  return NextResponse.json({
    shareId: data.share_id,
    url: shareUrl(token),
    expiresInDays: days,
  });
}

export async function DELETE(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { shareId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const owner = await ownerMembership(personId);
  if (!owner) {
    return NextResponse.json(
      { error: "Only the owner can stop a share." },
      { status: 403 }
    );
  }
  if (!body.shareId) {
    return NextResponse.json({ error: "Pick which share to stop." }, { status: 422 });
  }

  const db = supabaseServer();
  const { data: share } = await db
    .from("report_share")
    .select("id, business_id")
    .eq("id", body.shareId)
    .maybeSingle();
  if (!share || share.business_id !== owner.businessId) {
    return NextResponse.json({ error: "We could not find that share." }, { status: 404 });
  }

  const { error } = await db.rpc("revoke_report_share", {
    p: { share_id: share.id, actor_membership_id: owner.membershipId },
  });
  if (error) {
    return NextResponse.json(
      { error: "We could not stop that share. Tap again in a moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ revoked: true });
}
