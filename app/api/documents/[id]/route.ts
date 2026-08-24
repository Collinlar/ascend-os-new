// Document actions: issue a draft, or convert an issued document into the
// next document in its chain (DOC-003).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { convertDocument, issueDocument } from "@/lib/domains/documents";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";

interface Body {
  action?: "issue" | "convert";
  toType?: DocumentType;
}

export async function POST(
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

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: doc } = await db
    .from("document")
    .select("id, business_id, type, number")
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

  if (body.action === "issue") {
    try {
      const result = await issueDocument(doc.id, membership.id);
      return NextResponse.json({ number: result.number, duplicate: result.duplicate });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/document_has_no_lines/.test(message)) {
        return NextResponse.json(
          { error: "Add at least one line before you send this out." },
          { status: 422 }
        );
      }
      if (/document_not_draft/.test(message)) {
        return NextResponse.json(
          { error: "This document has already been sent out." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "We could not send this out just now. Tap again in a moment." },
        { status: 500 }
      );
    }
  }

  if (body.action === "convert") {
    const allowed = DOCUMENT_CONVERSIONS[doc.type as DocumentType] ?? [];
    if (!body.toType || !allowed.includes(body.toType)) {
      return NextResponse.json(
        { error: "That document cannot become that kind of document." },
        { status: 422 }
      );
    }
    try {
      const newId = await convertDocument(doc.id, body.toType, membership.id);
      return NextResponse.json({ documentId: newId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/convert_requires_issued_source/.test(message)) {
        return NextResponse.json(
          { error: "Send this document out first, then convert it." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "We could not convert this document. Tap again in a moment." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "That is not a document action." }, { status: 422 });
}
