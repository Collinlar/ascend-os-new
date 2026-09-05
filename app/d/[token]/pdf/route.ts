// The customer's copy, from the same secure link they were sent.
//
// No account, no login: the token is the authorisation, exactly as it is for
// the page itself (CHN-004, DOC-007). The same expiry and revocation rules
// apply, because a link that stops working should stop working everywhere.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { hashAccessToken } from "@/lib/messaging/send";
import { buildDocumentPdf } from "@/lib/documents/build-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const db = supabaseServer();

  const { data: access } = await db
    .from("document_access_token")
    .select("document_id, expires_at, revoked_at")
    .eq("token_hash", hashAccessToken(params.token))
    .maybeSingle();

  if (!access || access.revoked_at) {
    return NextResponse.json({ error: "That link is no longer active." }, { status: 404 });
  }
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return NextResponse.json({ error: "That link has expired." }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const built = await buildDocumentPdf(access.document_id, {
    verifyUrl: `${origin}/d/${params.token}`,
  });
  if (!built) {
    return NextResponse.json({ error: "That link is no longer active." }, { status: 404 });
  }

  return new NextResponse(built.bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${built.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
