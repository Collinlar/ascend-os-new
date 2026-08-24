// Storing a product photo.
//
// Session-guarded and filed under the business the caller actually belongs
// to, so a photo cannot be written into somebody else's shelf. The upload
// runs with the service role, which is why no write policy is granted to
// anon on the bucket.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";

export const maxDuration = 30;

const BUCKET = "catalogue";
const ALLOWED = ["image/webp", "image/jpeg", "image/png"] as const;
// The browser downscales before sending. Anything near this is not a
// downscaled product photo.
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { businessId?: string; imageBase64?: string; mediaType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That photo did not go through. Tap upload again." },
      { status: 400 }
    );
  }

  const mediaType = String(body.mediaType ?? "");
  if (!body.businessId || !body.imageBase64 || !ALLOWED.includes(mediaType as never)) {
    return NextResponse.json(
      { error: "Use a JPG, PNG or WebP photo of your product." },
      { status: 422 }
    );
  }

  const bytes = Buffer.from(body.imageBase64, "base64");
  if (bytes.byteLength === 0) {
    return NextResponse.json(
      { error: "That photo did not go through. Tap upload again." },
      { status: 422 }
    );
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "That photo is too heavy. Try a smaller one." },
      { status: 422 }
    );
  }

  const db = supabaseServer();
  const { data: membership } = await db
    .from("business_membership")
    .select("id")
    .eq("business_id", body.businessId)
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to this business." },
      { status: 403 }
    );
  }

  const extension = mediaType === "image/webp" ? "webp" : mediaType === "image/png" ? "png" : "jpg";
  // Filed per business, so one merchant's photos are never mixed with
  // another's even inside the bucket.
  const path = `${body.businessId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: mediaType,
    // Product photos are immutable once written; a changed photo is a new
    // object, so this can be cached hard.
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Photo storage is not set up on this site yet. Your product still saves without a picture.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "We could not save that photo just now. Tap again in a moment." },
      { status: 502 }
    );
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, path });
}
