// Document actions: issue a draft, or convert an issued document into the
// next document in its chain (DOC-003).

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase";
import {
  convertDocument,
  issueCreditNote,
  issueDocument,
} from "@/lib/domains/documents";
import { DOCUMENT_CONVERSIONS, type DocumentType } from "@/lib/domains/types";
import { withAuthority } from "@/lib/authority/with-authority";
import { deniedByDatabase } from "@/lib/authority/denied";
import { createDocumentLink, documentUrl } from "@/lib/messaging/send";
import { whatsappLink } from "@/lib/inventory/order-message";
import { formatGHS } from "@/lib/money";

// A link in a WhatsApp message has to be whole. Where the app's public
// address is not configured, use the address this request came to.
function absolute(link: string, request: NextRequest): string {
  return link.startsWith("/") ? `${request.nextUrl.origin}${link}` : link;
}

interface Body {
  action?: "issue" | "convert" | "credit" | "record_payment" | "remind" | "share";
  /** record_payment: how it was paid, and the MoMo or bank reference. */
  method?: "cash" | "mobile_money" | "bank_transfer" | "card";
  reference?: string;
  paidOn?: string;
  /** record_payment: the same key on a retry is the same payment. */
  clientRef?: string;
  toType?: DocumentType;
  /** Credit notes only: why the merchant is giving money back. */
  reason?: string;
  /** Credit notes only: leave unset to credit everything still eligible. */
  amount?: number;
}

async function handlePOST(
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

  if (body.action === "credit") {
    const reason = (body.reason ?? "").trim();
    if (reason.length < 4) {
      return NextResponse.json(
        { error: "Say why you are crediting this, so the record explains itself." },
        { status: 422 }
      );
    }
    const amount =
      body.amount === undefined || body.amount === null ? undefined : Number(body.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json(
        { error: "Enter an amount to credit, or leave it blank for the full invoice." },
        { status: 422 }
      );
    }

    try {
      const result = await issueCreditNote(doc.id, reason, amount, membership.id);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/credit_note_needs_an_invoice/.test(message)) {
        return NextResponse.json(
          { error: "Only an invoice can be credited." },
          { status: 422 }
        );
      }
      if (/credit_note_needs_an_issued_invoice/.test(message)) {
        return NextResponse.json(
          { error: "Send the invoice out first. A draft can just be edited." },
          { status: 409 }
        );
      }
      if (/invoice_already_fully_credited/.test(message)) {
        return NextResponse.json(
          { error: "This invoice has already been credited in full." },
          { status: 409 }
        );
      }
      if (/credit_exceeds_eligible_amount/.test(message)) {
        // The function names the remaining figure, which is the one thing
        // the merchant needs in order to fix their entry.
        const remaining = message.match(/of ([0-9.]+) remaining/)?.[1];
        return NextResponse.json(
          {
            error: remaining
              ? `That is more than is left on this invoice. You can still credit GHS ${remaining}.`
              : "That is more than is left on this invoice.",
          },
          { status: 422 }
        );
      }
      if (/credit_note_needs_a_reason/.test(message)) {
        return NextResponse.json(
          { error: "Say why you are crediting this, so the record explains itself." },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: "We could not issue that credit note. Tap again in a moment." },
        { status: 500 }
      );
    }
  }

  // Money the customer paid outside a pay link: cash at the counter, MoMo
  // straight to the merchant's number, a bank transfer (Modules M3, 0140).
  if (body.action === "record_payment") {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter how much they paid, in GHS." }, { status: 422 });
    }
    if (!body.method || !["cash", "mobile_money", "bank_transfer", "card"].includes(body.method)) {
      return NextResponse.json({ error: "Say how they paid: cash, MoMo, bank transfer or card." }, { status: 422 });
    }
    if (!body.clientRef) {
      return NextResponse.json({ error: "That did not go through. Tap again." }, { status: 400 });
    }
    const paidAt = body.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(body.paidOn)
      // A day with no time: midday in Accra, so the day never slips.
      ? new Date(`${body.paidOn}T12:00:00Z`).toISOString()
      : undefined;
    const { data, error } = await db.rpc("record_document_payment", {
      p: {
        business_id: doc.business_id,
        document_id: doc.id,
        amount,
        method: body.method,
        reference: (body.reference ?? "").trim().slice(0, 80),
        paid_at: paidAt && new Date(paidAt) > new Date() ? new Date().toISOString() : paidAt,
        client_ref: `docpay:${body.clientRef}`,
        actor_membership_id: membership.id,
      },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      const m = error.message;
      if (/payment_over_balance/.test(m)) {
        const left = Number(m.match(/payment_over_balance: ([0-9.]+)/)?.[1] ?? NaN);
        return NextResponse.json(
          { error: Number.isFinite(left) ? `That is more than is left. ${formatGHS(left)} is still owed.` : "That is more than is left on this invoice." },
          { status: 422 }
        );
      }
      if (/nothing_owed/.test(m)) return NextResponse.json({ error: "Nothing is owed on this invoice now." }, { status: 409 });
      if (/not_an_invoice/.test(m)) return NextResponse.json({ error: "Only an invoice takes payments." }, { status: 422 });
      if (/invoice_not_open/.test(m)) return NextResponse.json({ error: "Send the invoice out first. A draft is not owed yet." }, { status: 409 });
      if (/paid_at_in_future/.test(m)) return NextResponse.json({ error: "That date has not come yet. Pick today or earlier." }, { status: 422 });
      console.error("record_document_payment failed:", m);
      return NextResponse.json({ error: "We could not record that payment just now. Tap again in a moment." }, { status: 500 });
    }
    // The receipt is made as the payment commits (0052), so it can be read now.
    const { data: receipt } = await db.from("document").select("id, number").eq("payment_id", data.payment_id).maybeSingle();
    return NextResponse.json({
      paymentId: data.payment_id,
      duplicate: Boolean(data.duplicate),
      outstanding: data.outstanding === undefined ? null : Number(data.outstanding),
      receipt: receipt ? { id: receipt.id, number: receipt.number } : null,
    });
  }

  // A reminder now, counted with the weekly ones (0140).
  if (body.action === "remind") {
    let link = "";
    try {
      link = absolute(documentUrl(await createDocumentLink(doc.id, doc.business_id)), request);
    } catch {
      // A reminder without a link still says what is owed.
    }
    const { data, error } = await db.rpc("send_invoice_reminder", {
      p: { business_id: doc.business_id, document_id: doc.id, actor_membership_id: membership.id, link },
    });
    if (error) {
      const denied = deniedByDatabase(error);
      if (denied) return denied;
      const m = error.message;
      if (/reminded_recently/.test(m)) return NextResponse.json({ error: "A reminder went in the last day. Give them a little time." }, { status: 409 });
      if (/reminders_used_up/.test(m)) return NextResponse.json({ error: "Six reminders have gone. Time to call them yourself." }, { status: 409 });
      if (/no_way_to_reach/.test(m)) return NextResponse.json({ error: "There is no WhatsApp number or email for this customer." }, { status: 422 });
      if (/nothing_owed|invoice_not_open/.test(m)) return NextResponse.json({ error: "Nothing is owed on this invoice now." }, { status: 409 });
      console.error("send_invoice_reminder failed:", m);
      return NextResponse.json({ error: "We could not send that reminder just now. Tap again in a moment." }, { status: 500 });
    }
    if (data.status === "queued") return NextResponse.json({ sent: true, sequence: data.sequence });

    // Held back: no Ascend Balance, no consent, or WhatsApp has not approved
    // the reminder message yet. Offer the merchant their own WhatsApp, with
    // the same words, rather than a dead end.
    const { data: full } = await db
      .from("document")
      .select("number, due_date, customer:customer_id(display_name, phone_e164), business:business_id(name)")
      .eq("id", doc.id)
      .maybeSingle();
    const customer = full?.customer as unknown as { display_name: string | null; phone_e164: string | null } | null;
    const businessName = (full?.business as unknown as { name: string } | null)?.name ?? "us";
    const text = `Hello ${customer?.display_name ?? "there"}, a reminder that invoice ${full?.number ?? ""} from ${businessName} has ${formatGHS(Number(data.outstanding ?? 0))} still to pay.${link ? ` You can see it and pay here: ${link}` : ""}`;
    const why =
      data.status === "blocked_no_balance"
        ? "Your Ascend Balance is too low to send it."
        : data.status === "blocked_no_consent"
          ? "This customer has not agreed to messages from Ascend."
          : "WhatsApp has not approved Ascend's reminder message yet.";
    return NextResponse.json({
      sent: false,
      why,
      ownWhatsApp: customer?.phone_e164 ? whatsappLink(customer.phone_e164, text) : null,
    });
  }

  // The merchant sends the document from their own WhatsApp: a link the
  // customer can open, and the words to go with it. For when Ascend's own
  // message cannot go (a template not yet approved, no balance) or the
  // merchant simply prefers to send it themselves.
  if (body.action === "share") {
    const { data: full } = await db
      .from("document")
      .select("type, number, total, customer:customer_id(display_name, phone_e164), supplier:supplier_id(name, phone_e164), business:business_id(name)")
      .eq("id", doc.id)
      .maybeSingle();
    if (!full?.number) {
      return NextResponse.json({ error: "Send it out first, so it has its number." }, { status: 409 });
    }
    let link = "";
    try {
      link = absolute(documentUrl(await createDocumentLink(doc.id, doc.business_id)), request);
    } catch {
      return NextResponse.json({ error: "We could not make the link just now. Tap again in a moment." }, { status: 500 });
    }
    const party =
      (full.supplier as unknown as { name: string | null; phone_e164: string | null } | null) ??
      (() => {
        const c = full.customer as unknown as { display_name: string | null; phone_e164: string | null } | null;
        return c ? { name: c.display_name, phone_e164: c.phone_e164 } : null;
      })();
    const businessName = (full.business as unknown as { name: string } | null)?.name ?? "us";
    const kind = String(full.type).replace("_", " ");
    const text = `Hello ${party?.name ?? "there"}, here is your ${kind} ${full.number} from ${businessName} for ${formatGHS(Number(full.total ?? 0))}. You can see it here: ${link}`;
    return NextResponse.json({
      link,
      text,
      ownWhatsApp: party?.phone_e164 ? whatsappLink(party.phone_e164, text) : `https://wa.me/?text=${encodeURIComponent(text)}`,
    });
  }

  return NextResponse.json({ error: "That is not a document action." }, { status: 422 });
}

export const POST = withAuthority("documents/[id]", "POST", handlePOST);
