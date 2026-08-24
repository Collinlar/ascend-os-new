// Photo-to-catalogue suggestion (SHP-001, SHP-002). Session-guarded. Returns
// a suggestion for merchant review; publication happens only through the
// approval endpoint (SHP-003).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { AiUnavailable, suggestCatalogueFromPhoto } from "@/lib/groq";

export const maxDuration = 60;

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  // Naming the missing piece. Without this the route fails on every photo
  // and the merchant is told to try again in a moment, forever.
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Photo naming is not switched on for this site yet. Type the name and price yourself for now.",
      },
      { status: 503 }
    );
  }

  const personId = await currentPersonId();
  if (!personId) {
    return NextResponse.json(
      { error: "Your session timed out. Verify your WhatsApp number to continue." },
      { status: 401 }
    );
  }

  let body: { imageBase64?: string; mediaType?: string; hint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That photo did not go through. Tap upload again." },
      { status: 400 }
    );
  }

  const mediaType = body.mediaType as (typeof SUPPORTED_TYPES)[number];
  if (!body.imageBase64 || !SUPPORTED_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: "Use a JPG, PNG or WebP photo of your product." },
      { status: 422 }
    );
  }
  if (Buffer.byteLength(body.imageBase64, "base64") > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "That photo is too heavy. Use one under 5MB and tap again." },
      { status: 422 }
    );
  }

  try {
    const suggestion = await suggestCatalogueFromPhoto(
      body.imageBase64,
      mediaType,
      body.hint
    );
    return NextResponse.json({ suggestion });
  } catch (err) {
    // Each of these fails differently and the merchant can act on the
    // difference: wait, type it yourself, or tell whoever runs the site.
    if (err instanceof AiUnavailable) {
      if (err.kind === "rate_limited") {
        return NextResponse.json(
          {
            error:
              "Photo naming is busy right now. Wait a minute and tap again, or type the name yourself.",
          },
          { status: 429 }
        );
      }
      if (err.kind === "bad_model" || err.kind === "unconfigured") {
        return NextResponse.json(
          {
            error:
              "Photo naming is not set up correctly on this site. Type the name and price yourself for now.",
          },
          { status: 503 }
        );
      }
    }
    return NextResponse.json(
      { error: "We could not read that photo just now. Tap again in a moment." },
      { status: 502 }
    );
  }
}
