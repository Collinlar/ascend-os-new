// The Risk desk (Risk and Trust R4; the full desk is R6). For now, one
// thing: a BVM admin reads a customer report and dismisses it, opens a case
// from it, or adds it to the business's open case. The database checks the
// admin again and refuses a review without a note.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "review_report";
  reportId?: string;
  outcome?: "dismiss" | "open_case" | "add_to_case";
  caseId?: string;
  note?: string;
}

async function handlePOST(request: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (admin.role !== "admin") {
    return NextResponse.json(
      { error: "Only a BVM admin can do this. Moderators can read reports, not act on them." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That did not go through. Try again." }, { status: 400 });
  }

  if (body.action !== "review_report") {
    return NextResponse.json({ error: "That is not something this desk does." }, { status: 422 });
  }
  const note = (body.note ?? "").trim();
  if (!body.reportId || !body.outcome) {
    return NextResponse.json({ error: "Pick the report and what to do with it." }, { status: 422 });
  }
  if (note.length < 10) {
    return NextResponse.json(
      { error: "Say what you found. It goes on the report, and on the case if there is one." },
      { status: 422 }
    );
  }

  const { data, error } = await supabaseServer().rpc("review_customer_report", {
    p: {
      report_id: body.reportId,
      outcome: body.outcome,
      case_id: body.caseId ?? null,
      note,
      admin_person_id: admin.personId,
    },
  });
  if (error) {
    const closed = /case_not_open_for_business/.test(error.message);
    return NextResponse.json(
      {
        error: closed
          ? "That case is closed now. Open a new case from this report instead."
          : "We could not save that review. Nothing was changed. Try again.",
      },
      { status: closed ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, outcome: data });
}

export const POST = withAuthority("admin/risk", "POST", handlePOST);
