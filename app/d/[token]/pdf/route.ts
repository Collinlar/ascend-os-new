// The customer's copy, from the same secure link they were sent.
//
// No account, no login: the token is the authorisation, exactly as it is for
// the page itself (CHN-004, DOC-007). The same expiry and revocation rules
// apply, because a link that stops working should stop working everywhere.
//
// A link that is gone and a database we could not reach are told apart
// (lib/documents/customer-link.ts): a dropped connection says "try again",
// not "this link is no longer active".

import { NextRequest, NextResponse } from "next/server";
import { buildDocumentPdf } from "@/lib/documents/build-pdf";
import { lookUpDocumentLink } from "@/lib/documents/customer-link";

export const dynamic = "force-dynamic";

function tryAgain() {
  return NextResponse.json(
    { error: "We could not prepare your copy just now. The connection dropped for a moment. Open it again in a few seconds." },
    { status: 503, headers: { "retry-after": "5" } }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await lookUpDocumentLink(params.token);
  if (link.state === "unreachable") return tryAgain();
  if (link.state === "gone") {
    return NextResponse.json(
      { error: link.why === "expired" ? "That link has expired." : "That link is no longer active." },
      { status: 404 }
    );
  }

  // The link points at a document that exists (the token references it), so
  // a build that comes back empty is a read that failed, not a missing
  // document: say try again.
  let built: Awaited<ReturnType<typeof buildDocumentPdf>> = null;
  try {
    built = await buildDocumentPdf(link.access.document_id, {
      verifyUrl: `${request.nextUrl.origin}/d/${params.token}`,
    });
  } catch {
    built = null;
  }
  if (!built) return tryAgain();

  return new NextResponse(built.bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${built.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
