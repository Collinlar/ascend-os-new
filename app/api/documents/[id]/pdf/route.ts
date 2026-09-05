// The merchant's copy of a document, as a file they can keep or send on.
//
// Scoped to the business the document belongs to, like every other document
// action: the service-role client bypasses RLS, so this path checks its own
// membership rather than trusting the id in the URL.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { buildDocumentPdf } from "@/lib/documents/build-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  const db = supabaseServer();
  const { data: doc } = await db
    .from("document")
    .select("id, business_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "We could not find that document." }, { status: 404 });
  }

  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", doc.business_id)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  const built = await buildDocumentPdf(params.id);
  if (!built) {
    return NextResponse.json({ error: "We could not find that document." }, { status: 404 });
  }

  return new NextResponse(built.bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      // inline, so tapping it on a phone opens a reader rather than
      // dropping a file into Downloads the merchant then has to find.
      "content-disposition": `inline; filename="${built.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
