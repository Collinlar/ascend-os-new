// Create a document draft, optionally issuing it in the same request.
// Session-guarded and membership-scoped.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import { createDraft, issueDocument, type DocumentLine } from "@/lib/domains/documents";
import type { DocumentType } from "@/lib/domains/types";

const CREATABLE: DocumentType[] = [
  "quotation",
  "proforma",
  "invoice",
  "receipt",
  "purchase_order",
];

interface Body {
  businessId?: string;
  type?: DocumentType;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Purchase orders only: who the business is buying from. */
  supplierName?: string;
  supplierPhone?: string;
  lines?: Array<{
    itemId?: string | null;
    description?: string;
    quantity?: number;
    unitPrice?: number;
  }>;
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

  // A line needs a quantity and something to call itself, which is either
  // its own wording or a catalogue item that supplies one.
  const rawLines = (body.lines ?? [])
    .map((l) => ({
      itemId: typeof l.itemId === "string" && l.itemId ? l.itemId : null,
      description: (l.description ?? "").trim(),
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }))
    .filter((l) => l.quantity > 0 && (l.description.length > 0 || l.itemId));

  if (rawLines.length === 0) {
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

  // Resolve the catalogue links. The item has to belong to this business:
  // the service-role client bypasses RLS, so an id from the request is not
  // evidence of anything until it has been checked here.
  //
  // The name comes from the catalogue so a document says what the business
  // actually sells. The price comes from the request, because a merchant
  // discounts, rounds and negotiates, and a document that silently
  // overwrote what they typed would be worse than useless.
  const wantedIds = Array.from(
    new Set(rawLines.map((l) => l.itemId).filter((id): id is string => Boolean(id)))
  );

  const catalogue = new Map<string, { name: string; basePrice: number | null }>();
  if (wantedIds.length > 0) {
    const { data: items } = await db
      .from("catalogue_item")
      .select("id, name, base_price")
      .eq("business_id", body.businessId)
      .in("id", wantedIds);
    for (const item of items ?? []) {
      catalogue.set(item.id, {
        name: item.name,
        basePrice: item.base_price === null ? null : Number(item.base_price),
      });
    }
  }

  const lines: DocumentLine[] = rawLines.map((l) => {
    const item = l.itemId ? catalogue.get(l.itemId) : undefined;
    const description = item?.name ?? l.description;
    const unitPrice = l.unitPrice || item?.basePrice || 0;
    return {
      // An id that did not resolve is dropped rather than stored. A link
      // that points nowhere is worse than no link, because everything
      // downstream would trust it.
      itemId: item ? l.itemId : null,
      description,
      quantity: l.quantity,
      unitPrice,
      lineTotal: Math.round(l.quantity * unitPrice * 100) / 100,
    };
  });

  if (lines.some((l) => !l.description)) {
    return NextResponse.json(
      { error: "One of those lines has nothing to charge for. Add a description." },
      { status: 422 }
    );
  }

  // A purchase order faces the other way: it is addressed to a supplier
  // and never to a customer, which the schema enforces (0054).
  let supplierId: string | undefined;
  if (type === "purchase_order") {
    const supplierName = body.supplierName?.trim();
    if (!supplierName) {
      return NextResponse.json(
        { error: "Say who you are ordering from." },
        { status: 422 }
      );
    }
    // Matched on the name the merchant typed, case and spacing ignored, so
    // ordering from Melcom twice does not create two Melcoms and split the
    // purchase history down the middle.
    const { data: existing } = await db
      .from("supplier")
      .select("id")
      .eq("business_id", body.businessId)
      .eq("active", true)
      .ilike("name", supplierName)
      .maybeSingle();

    if (existing) {
      supplierId = existing.id;
    } else {
      const { data: created, error: supplierError } = await db
        .from("supplier")
        .insert({
          business_id: body.businessId,
          name: supplierName,
          phone_e164: body.supplierPhone?.trim() || null,
        })
        .select("id")
        .single();
      if (supplierError || !created) {
        return NextResponse.json(
          { error: "We could not save that supplier. Tap again in a moment." },
          { status: 500 }
        );
      }
      supplierId = created.id;
    }
  }

  // Reuse the shared customer record rather than creating a parallel one
  // (CAP-003).
  let customerId: string | undefined;
  const phone = body.customerPhone?.trim();
  const email = body.customerEmail?.trim() || null;
  const name = body.customerName?.trim();
  if (name && type !== "purchase_order") {
    // One way in, shared with Shop and Services (0064). Documents used to
    // do its own lookup here on the raw phone string, which is how the same
    // person ended up as two customer records on one business.
    const { data: found, error: customerError } = await db.rpc(
      "find_or_create_customer",
      {
        p: {
          business_id: body.businessId,
          name,
          phone: phone ?? "",
          email: email ?? "",
          created_via: "documents",
        },
      }
    );
    if (customerError) {
      console.error("customer lookup failed:", customerError.message);
      return NextResponse.json(
        { error: "We could not save that customer. Tap again in a moment." },
        { status: 500 }
      );
    }
    customerId = (found?.customer_id as string) ?? undefined;
  }

  try {
    const documentId = await createDraft({
      businessId: body.businessId,
      customerId,
      supplierId,
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
