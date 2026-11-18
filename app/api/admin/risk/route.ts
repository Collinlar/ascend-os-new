// The Risk desk (Risk and Trust R4 to R6, spec 09 and 11).
//
// Everything a BVM admin does to a business on risk grounds goes through
// here, and every one of them goes through a database function that checks
// the admin again, refuses without a written reason, and writes the case
// history. This route only turns the page's request into that call and the
// database's refusal into a sentence.
//
// Suspending or terminating is a request until a second admin confirms it.
// An appeal against a suspension is heard by an admin who did not make it.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";
import { deskError } from "@/lib/risk/desk";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { action?: string };

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Each action: the database function, and how the page's fields map to it.
// `min` is the shortest written reason the action takes (checked again in
// the database); `field` names that reason for the message.
const ACTIONS: Record<
  string,
  { rpc: string; params: (b: Body) => Record<string, unknown>; min?: number; field?: string }
> = {
  open_case: {
    rpc: "open_risk_case",
    params: (b) => ({
      business_id: s(b.businessId),
      domain: s(b.domain) || "other",
      trigger: s(b.trigger),
      evidence: typeof b.evidence === "object" && b.evidence ? b.evidence : {},
    }),
    min: 10,
    field: "trigger",
  },
  add_note: { rpc: "add_risk_case_note", params: (b) => ({ case_id: s(b.caseId), note: s(b.note) }), min: 3, field: "note" },
  set_state: {
    rpc: "set_risk_state",
    params: (b) => ({ case_id: s(b.caseId), state: s(b.state), reason: s(b.reason) }),
    min: 10,
    field: "reason",
  },
  confirm_state: { rpc: "confirm_risk_state", params: (b) => ({ case_id: s(b.caseId) }) },
  decline_state: {
    rpc: "decline_risk_state",
    params: (b) => ({ case_id: s(b.caseId), reason: s(b.reason) }),
    min: 10,
    field: "reason",
  },
  set_restriction: {
    rpc: "set_business_restriction",
    params: (b) => ({ case_id: s(b.caseId), control: s(b.control), reason: s(b.reason) }),
    min: 10,
    field: "reason",
  },
  lift_restriction: {
    rpc: "lift_business_restriction",
    params: (b) => ({ case_id: s(b.caseId), control: s(b.control), reason: s(b.reason) }),
    min: 10,
    field: "reason",
  },
  set_business_message: {
    rpc: "set_case_business_message",
    params: (b) => ({ case_id: s(b.caseId), message: s(b.message) || null }),
  },
  resolve_case: {
    rpc: "resolve_risk_case",
    params: (b) => ({ case_id: s(b.caseId), resolution: s(b.resolution) }),
    min: 10,
    field: "resolution",
  },
  review_report: {
    rpc: "review_customer_report",
    params: (b) => ({ report_id: s(b.reportId), outcome: s(b.outcome), case_id: s(b.caseId) || null, note: s(b.note) }),
    min: 10,
    field: "note",
  },
  decide_appeal: {
    rpc: "decide_risk_appeal",
    params: (b) => ({
      appeal_id: s(b.appealId),
      outcome: s(b.decision),
      new_state: s(b.newState) || "monitor",
      note: s(b.note),
    }),
    min: 10,
    field: "note",
  },
};

const TOO_SHORT: Record<string, string> = {
  trigger: "Say what started this case, in a sentence. It is the first line of the case.",
  note: "Write the note first.",
  reason: "Say why, in a sentence. It goes on the case for the next admin to read.",
  resolution: "Say how the case ended, in a sentence.",
};

async function handlePOST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (admin.role !== "admin") {
    return NextResponse.json(
      { error: "Only a BVM admin can do this. Moderators can read the desk, not act on it." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Try again." }, { status: 400 });
  }

  // Finding a business to open a case on: by name or shop link, read only.
  if (body.action === "find_business") {
    const q = s(body.query).replace(/^.*\/(s|b)\//, "").replace(/[%_,()]/g, "");
    if (q.length < 2) return NextResponse.json({ businesses: [] });
    const { data, error } = await supabaseServer()
      .from("business")
      .select("id, name, shop_slug, status, created_at")
      .or(`name.ilike.%${q}%,shop_slug.eq.${q}`)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) {
      return NextResponse.json({ error: "We could not search just now. Try again." }, { status: 500 });
    }
    return NextResponse.json({ businesses: data ?? [] });
  }

  const spec = body.action ? ACTIONS[body.action] : undefined;
  if (!spec) return NextResponse.json({ error: "That is not something this desk does." }, { status: 422 });

  const params = spec.params(body);
  if (spec.min && spec.field) {
    const text = String(params[spec.field] ?? "");
    if (text.length < spec.min) {
      return NextResponse.json({ error: TOO_SHORT[spec.field] }, { status: 422 });
    }
  }

  const { data, error } = await supabaseServer().rpc(spec.rpc, {
    p: { ...params, admin_person_id: admin.personId },
  });
  if (error) {
    const { message, status } = deskError(error.message);
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ok: true, outcome: data });
}

export const POST = withAuthority("admin/risk", "POST", handlePOST);
