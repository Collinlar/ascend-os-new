// Create a document draft, optionally issuing it in the same request.
// Session-guarded and membership-scoped.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { createDraft, issueDocument, type DocumentLine } from "@/lib/domains/documents";
import type { DocumentType } from "@/lib/domains/types";

const CREATABLE: DocumentType[] = ["quotation", "proforma", "invoice", "receipt"];

interface Body {
  businessId?: string;
  type?: DocumentType;
  customerName?: string;
  customerPhone?: string;
  lines?: Array<{ description?: string; quantity?: number; unitPrice?: number }>;
  dueDate?: string;
  issueNow?: boolean;
}

export async function POST(request: NextRequest) {
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

  const type = body.type ?? "invoice";
  if (!body.businessId || !CREATABLE.includes(type)) {
    return NextResponse.json(
      { error: "Pick what kind of document you are creating." },
      { status: 422 }
    );
  }

  const lines: DocumentLine[] = (body.lines ?? [])
    .filter((l) => (l.description ?? "").trim().length > 0)
    .map((l) => {
      const quantity = Number(l.quantity) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      return {
        description: (l.description ?? "").trim(),
        quantity,
        unitPrice,
        lineTotal: Math.round(quantity * unitPrice * 100) / 100,
      };
    })
    .filter((l) => l.quantity > 0);

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Add at least one line with a description and quantity." },
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

  // Reuse the shared customer record rather than creating a parallel one
  // (CAP-003).
  let customerId: string | undefined;
  const phone = body.customerPhone?.trim();
  const name = body.customerName?.trim();
  if (name) {
    if (phone) {
      const { data: existing } = await db
        .from("customer")
        .select("id")
        .eq("business_id", body.businessId)
        .eq("phone_e164", phone)
        .maybeSingle();
      customerId = existing?.id;
    }
    if (!customerId) {
      const { data: created } = await db
        .from("customer")
        .insert({
          business_id: body.businessId,
          display_name: name,
          phone_e164: phone ?? null,
          created_via: "documents",
        })
        .select("id")
        .single();
      customerId = created?.id;
    }
  }

  try {
    const documentId = await createDraft({
      businessId: body.businessId,
      customerId,
      type,
      lines,
      dueDate: body.dueDate,
      createdBy: membership.id,
    });

    if (body.issueNow) {
      const issued = await issueDocument(documentId, membership.id);
      return NextResponse.json({ documentId, number: issued.number, issued: true });
    }

    return NextResponse.json({ documentId, issued: false });
  } catch {
    return NextResponse.json(
      { error: "We could not save this document just now. Tap again in a moment." },
      { status: 500 }
    );
  }
}
