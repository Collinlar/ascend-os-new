// Office actions: complete a task, submit an expense, decide an approval,
// check in or out. One route because they share the same membership
// resolution and each is a single small write.

import { NextRequest, NextResponse } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { supabaseServer } from "@/lib/supabase";
import { publishEvent } from "@/lib/domains/events";

interface Body {
  action?:
    | "create_task"
    | "complete_task"
    | "submit_expense"
    | "decide_approval"
    | "attendance";
  taskId?: string;
  title?: string;
  assigneeMembershipId?: string;
  dueAt?: string;
  amount?: number;
  category?: string;
  detail?: string;
  approvalId?: string;
  approved?: boolean;
  note?: string;
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

  const db = supabaseServer();
  const membership = await activeMembership<{ id: string; business_id: string; location_scope: string | null }>(personId, "id, business_id, location_scope");
  if (!membership) {
    return NextResponse.json(
      { error: "You do not have access to a business yet." },
      { status: 403 }
    );
  }

  const businessId = membership.business_id as string;
  const membershipId = membership.id as string;

  // Work has to be able to get into Office. Until now the board could
  // complete a task and nothing anywhere could create one, which is why the
  // table has been empty since it was built.
  if (body.action === "create_task") {
    const title = (body.title ?? "").trim();
    if (title.length < 2) {
      return NextResponse.json(
        { error: "Say what needs doing." },
        { status: 422 }
      );
    }

    // An assignee has to be someone on this team. The service-role client
    // bypasses RLS, so a membership id in a request proves nothing until it
    // has been checked against the business.
    let assignee: string | null = null;
    if (body.assigneeMembershipId) {
      const { data: member } = await db
        .from("business_membership")
        .select("id")
        .eq("id", body.assigneeMembershipId)
        .eq("business_id", businessId)
        .eq("status", "active")
        .maybeSingle();
      if (!member) {
        return NextResponse.json(
          { error: "That person is not on your team." },
          { status: 422 }
        );
      }
      assignee = member.id;
    }

    const { data, error } = await db.rpc("create_linked_task", {
      p: {
        business_id: businessId,
        title,
        detail: (body.detail ?? "").trim() || null,
        assigned_membership_id: assignee ?? "",
        due_at: body.dueAt || "",
        created_by: membershipId,
      },
    });

    if (error) {
      console.error("create_task failed:", error.message);
      return NextResponse.json(
        { error: "We could not save that just now. Tap again in a moment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ taskId: data.task_id, duplicate: data.duplicate });
  }

  if (body.action === "complete_task") {
    if (!body.taskId) {
      return NextResponse.json({ error: "Pick a task." }, { status: 422 });
    }
    const { data: task } = await db
      .from("task")
      .select("id, business_id, status")
      .eq("id", body.taskId)
      .maybeSingle();
    if (!task || task.business_id !== businessId) {
      return NextResponse.json({ error: "We could not find that task." }, { status: 404 });
    }
    if (task.status === "done") {
      return NextResponse.json({ status: "done", unchanged: true });
    }

    await db
      .from("task")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", task.id);

    await publishEvent({
      eventType: "office.task.completed",
      businessId,
      actorMembershipId: membershipId,
      channel: "business_mobile",
      productSet: "office",
      entityType: "task",
      entityId: task.id,
    });

    return NextResponse.json({ status: "done", unchanged: false });
  }

  if (body.action === "submit_expense") {
    if (!(Number(body.amount) > 0)) {
      return NextResponse.json(
        { error: "Enter how much was spent." },
        { status: 422 }
      );
    }
    if (!(body.detail ?? "").trim()) {
      return NextResponse.json(
        { error: "Say what the money was for." },
        { status: 422 }
      );
    }

    const { data, error } = await db.rpc("submit_expense", {
      p: {
        business_id: businessId,
        membership_id: membershipId,
        amount: body.amount,
        category: body.category ?? null,
        detail: body.detail,
      },
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not record that just now. Tap again in a moment." },
        { status: 500 }
      );
    }
    return NextResponse.json({
      expenseId: data.expense_id,
      needsApproval: data.needs_approval,
    });
  }

  if (body.action === "decide_approval") {
    if (!body.approvalId) {
      return NextResponse.json({ error: "Pick a request." }, { status: 422 });
    }
    const { data: approval } = await db
      .from("approval_request")
      .select("id, business_id")
      .eq("id", body.approvalId)
      .maybeSingle();
    if (!approval || approval.business_id !== businessId) {
      return NextResponse.json({ error: "We could not find that request." }, { status: 404 });
    }

    const { data, error } = await db.rpc("decide_approval", {
      p: {
        approval_id: approval.id,
        decider_membership_id: membershipId,
        approved: body.approved ?? false,
        note: body.note ?? null,
      },
    });

    if (error) {
      if (/cannot_approve_own_request/.test(error.message)) {
        return NextResponse.json(
          { error: "You cannot approve your own request. Someone else must." },
          { status: 403 }
        );
      }
      if (/already_decided/.test(error.message)) {
        return NextResponse.json(
          { error: "Someone already decided this one." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "We could not save that decision. Tap again in a moment." },
        { status: 500 }
      );
    }

    return NextResponse.json({ approved: data.approved });
  }

  if (body.action === "attendance") {
    const { data, error } = await db.rpc("record_attendance", {
      p: {
        business_id: businessId,
        membership_id: membershipId,
        client_ref: `att:${membershipId}:${Date.now()}`,
        source: "mobile",
      },
    });
    if (error) {
      return NextResponse.json(
        { error: "We could not record that. Tap again in a moment." },
        { status: 500 }
      );
    }

    await publishEvent({
      eventType: "office.attendance.recorded",
      businessId,
      actorMembershipId: membershipId,
      channel: "business_mobile",
      productSet: "office",
      entityType: "attendance_record",
      entityId: data.record_id,
      payload: { action: data.action },
    });

    return NextResponse.json({ action: data.action });
  }

  return NextResponse.json({ error: "That is not an action we handle." }, { status: 422 });
}
