// The Risk desk (Risk and Trust R4 and R5; the full desk is R6). Two things
// so far: a BVM admin reviews a customer report (dismiss, open a case, add
// to the open case), and decides a business's appeal. The database checks
// the admin again, refuses either without a note, and refuses an appeal
// decision from the admin who made a suspension.

import { NextRequest, NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { withAuthority } from "@/lib/authority/with-authority";

export const dynamic = "force-dynamic";

interface Body {
  action?: "review_report" | "decide_appeal";
  appealId?: string;
  decision?: "accepted" | "declined";
  newState?: "monitor" | "normal";
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

  const note = (body.note ?? "").trim();

  if (body.action === "decide_appeal") {
    if (!body.appealId || (body.decision !== "accepted" && body.decision !== "declined")) {
      return NextResponse.json({ error: "Pick the appeal and whether to accept it." }, { status: 422 });
    }
    if (note.length < 10) {
      return NextResponse.json(
        { error: "Write what the business will read. It shows on their page as the answer." },
        { status: 422 }
      );
    }
    const { data, error } = await supabaseServer().rpc("decide_risk_appeal", {
      p: {
        appeal_id: body.appealId,
        outcome: body.decision,
        new_state: body.newState ?? "monitor",
        note,
        admin_person_id: admin.personId,
      },
    });
    if (error) {
      const msg = /another_admin/.test(error.message)
        ? "You made or confirmed this decision, so another admin hears the appeal against it."
        : /state_moved|case_resolved/.test(error.message)
          ? "The business's state has changed since this appeal. Decide it from the case."
          : "We could not save that decision. Nothing was changed. Try again.";
      return NextResponse.json({ error: msg }, { status: /another_admin|state_moved|case_resolved/.test(error.message) ? 409 : 500 });
    }
    return NextResponse.json({ ok: true, outcome: data });
  }

  if (body.action !== "review_report") {
    return NextResponse.json({ error: "That is not something this desk does." }, { status: 422 });
  }
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
