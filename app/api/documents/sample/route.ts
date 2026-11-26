// A sample document in the business's saved look, as a PDF (Modules R2).
// Nothing is stored and nothing is numbered: it shows what customers will
// receive before the business sends anything for real.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { SAMPLE_TYPES, samplePdfDocument, type SampleType } from "@/lib/documents/sample";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }
  const businessId = request.nextUrl.searchParams.get("businessId") ?? "";
  const type = (request.nextUrl.searchParams.get("type") ?? "invoice") as SampleType;
  if (!businessId || !SAMPLE_TYPES.includes(type)) {
    return NextResponse.json({ error: "Pick which document to see a sample of." }, { status: 422 });
  }

  const { data: membership } = await supabaseServer()
    .from("business_membership")
    .select("id")
    .eq("business_id", businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "You do not have access to this business." }, { status: 403 });
  }

  const bytes = renderDocumentPdf(await samplePdfDocument(businessId, type));
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="sample-${type.replace("_", "-")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

export const GET = withAuthority("documents/sample", "GET", handleGET);
