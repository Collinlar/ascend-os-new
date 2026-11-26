import "server-only";

import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { currentWorkspace } from "@/lib/nav/workspace";
import { canEnterOffice, officeModules, type OfficeModules } from "@/lib/office/access";

// What every Office screen reads first (Modules M2): who is looking, what
// they run, and which parts of Office the business has. Today, Approvals,
// the Work board and People each add their own reads on top, so a screen
// pays only for what it shows.

export interface OfficeContext {
  businessId: string;
  membershipId: string;
  personName: string;
  roleKey: string | null;
  /** Owner or manager: a view of the business. Anyone else: their own day. */
  runsThePlace: boolean;
  modules: OfficeModules;
  capabilities: Set<string>;
  places: Array<{ id: string; name: string }>;
  locationId: string | null;
  locationName: string | null;
}

export type OfficeLoad = OfficeContext | "signed_out" | "unreadable" | "not_included";

export async function officeContext(): Promise<OfficeLoad> {
  try {
    const personId = await currentPersonId();
    if (!personId) return "signed_out";
    const workspace = await currentWorkspace();
    if (!workspace) return "signed_out";
    if (!canEnterOffice(workspace.capabilities)) return "not_included";
    const { data: me } = await supabaseServer()
      .from("business_membership")
      .select("id, role:role_id(key)")
      .eq("person_id", personId)
      .eq("business_id", workspace.businessId)
      .eq("status", "active")
      .maybeSingle();
    if (!me) return "signed_out";
    const roleKey = (me.role as unknown as { key: string } | null)?.key ?? null;
    return {
      businessId: workspace.businessId,
      membershipId: me.id as string,
      personName: workspace.personName,
      roleKey,
      runsThePlace: roleKey === "owner" || roleKey === "manager",
      modules: officeModules(workspace.capabilities),
      capabilities: workspace.capabilities,
      places: workspace.places,
      locationId: workspace.locationId,
      locationName: workspace.locationName,
    };
  } catch {
    return "unreadable";
  }
}

// ------------------------------------------------------------------ people --

export interface Member {
  membershipId: string;
  name: string;
  roleKey: string;
}

/** Everyone active on the team, owner first. Names and roles only. */
export async function loadMembers(businessId: string): Promise<Member[]> {
  const { data } = await supabaseServer()
    .from("business_membership")
    .select("id, person:person_id(full_name), role:role_id(key)")
    .eq("business_id", businessId)
    .eq("status", "active")
    .limit(100);
  const rank: Record<string, number> = { owner: 0, manager: 1, accountant: 2, cashier: 3, staff: 4 };
  return (data ?? [])
    .map((m) => ({
      membershipId: m.id as string,
      name: (m.person as unknown as { full_name: string | null } | null)?.full_name ?? "A team member",
      roleKey: (m.role as unknown as { key: string } | null)?.key ?? "staff",
    }))
    .sort((a, b) => (rank[a.roleKey] ?? 9) - (rank[b.roleKey] ?? 9) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------- tasks --

export interface BoardTask {
  id: string;
  title: string;
  detail: string | null;
  status: "open" | "in_progress" | "blocked" | "done";
  dueAt: string | null;
  /** When it was finished, for the Done column. */
  doneAt: string | null;
  sourceType: string | null;
  projectId: string | null;
  projectName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
}

/**
 * The board's tasks: everything open, and what was finished in the last 7
 * days. A manager sees the whole board; anyone else sees what is theirs and
 * what nobody has picked up, which is what the server lets them move.
 */
export async function loadTasks(ctx: OfficeContext): Promise<BoardTask[]> {
  const db = supabaseServer();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const cols =
    "id, title, detail, status, due_at, updated_at, source_entity_type, project_id, assigned_membership_id, project:project_id(name), assignee:assigned_membership_id(person:person_id(full_name))";
  const scope = <T extends { or: (f: string) => T }>(q: T) =>
    ctx.runsThePlace ? q : q.or(`assigned_membership_id.eq.${ctx.membershipId},assigned_membership_id.is.null`);
  const [open, done] = await Promise.all([
    scope(
      db.from("task").select(cols).eq("business_id", ctx.businessId).in("status", ["open", "in_progress", "blocked"])
    )
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    scope(db.from("task").select(cols).eq("business_id", ctx.businessId).eq("status", "done").gte("updated_at", weekAgo))
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);
  return [...(open.data ?? []), ...(done.data ?? [])].map((t) => ({
    id: t.id as string,
    title: t.title as string,
    detail: (t.detail as string | null) ?? null,
    status: t.status as BoardTask["status"],
    dueAt: (t.due_at as string | null) ?? null,
    doneAt: t.status === "done" ? (t.updated_at as string) : null,
    sourceType: (t.source_entity_type as string | null) ?? null,
    projectId: (t.project_id as string | null) ?? null,
    projectName: (t.project as unknown as { name: string } | null)?.name ?? null,
    assigneeId: (t.assigned_membership_id as string | null) ?? null,
    assigneeName:
      (t.assignee as unknown as { person: { full_name: string | null } | null } | null)?.person?.full_name ?? null,
  }));
}

// --------------------------------------------------------------- approvals --

export interface ApprovalItem {
  id: string;
  kind: string;
  amount: number | null;
  status: "requested" | "approved" | "rejected" | string;
  createdAt: string;
  decidedAt: string | null;
  requesterName: string;
  requesterRole: string | null;
  reason: string | null;
  decisionNote: string | null;
  deciderName: string | null;
  /** The receipt of the sale a refund or discount is for. */
  receipt: string | null;
  /** What came back with a refund, as the cashier said (0128). */
  returned: "restock" | "damaged" | "not_returned" | null;
  isOwnRequest: boolean;
  /** The business's own threshold for this kind, if it set one. */
  ruleAbove: number | null;
  /** For time off: the days asked for. */
  days: { from: string; to: string } | null;
}

/** What is waiting, and what was decided in the last 30 days. */
export async function loadApprovals(ctx: OfficeContext): Promise<ApprovalItem[]> {
  const db = supabaseServer();
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const cols =
    "id, kind, amount, status, created_at, decided_at, note, requested_by, source_entity_type, source_entity_id, requester:requested_by(person:person_id(full_name), role:role_id(key)), decider:decided_by(person:person_id(full_name))";
  const [waiting, decided, rules] = await Promise.all([
    db.from("approval_request").select(cols).eq("business_id", ctx.businessId).eq("status", "requested").order("created_at", { ascending: true }).limit(60),
    db
      .from("approval_request")
      .select(cols)
      .eq("business_id", ctx.businessId)
      .neq("status", "requested")
      .gte("decided_at", monthAgo)
      .order("decided_at", { ascending: false })
      .limit(60),
    db.from("approval_rule").select("kind, threshold_amount").eq("business_id", ctx.businessId).eq("active", true),
  ]);
  const rows = [...(waiting.data ?? []), ...(decided.data ?? [])];

  // Which sale a refund is for, by its receipt number, so nobody decides blind.
  const saleIds = rows.filter((a) => a.source_entity_type === "sale" && a.source_entity_id).map((a) => a.source_entity_id as string);
  const receipts = new Map<string, string>();
  if (saleIds.length > 0) {
    const { data: sales } = await db.from("sale").select("id, receipt_number").eq("business_id", ctx.businessId).in("id", saleIds);
    for (const s of sales ?? []) receipts.set(s.id as string, s.receipt_number as string);
  }
  // Read on their own, so Approvals still opens on a database without them:
  // what came back with a refund (0128) and the decider's note (0139).
  const extra = new Map<string, { return_condition?: string | null; decision_note?: string | null }>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id as string);
    const { data: withNotes, error } = await db.from("approval_request").select("id, return_condition, decision_note").in("id", ids);
    if (!error) for (const r of withNotes ?? []) extra.set(r.id as string, r);
    else {
      const { data: conds } = await db.from("approval_request").select("id, return_condition").in("id", ids);
      for (const r of conds ?? []) extra.set(r.id as string, r);
    }
  }
  // Money spent keeps its "what for" on the expense, not the request.
  const spentOn = new Map<string, string>();
  const expenseIds = rows.filter((a) => a.kind === "expense").map((a) => a.id as string);
  if (expenseIds.length > 0) {
    const { data: spent } = await db.from("expense").select("approval_id, detail").in("approval_id", expenseIds);
    for (const x of spent ?? []) if (x.detail) spentOn.set(x.approval_id as string, x.detail as string);
  }
  // Time off keeps its days on the absence it will become (0061).
  const daysOff = new Map<string, { from: string; to: string }>();
  const leaveIds = rows.filter((a) => a.kind === "leave").map((a) => a.id as string);
  if (leaveIds.length > 0) {
    const { data: off } = await db.from("staff_time_off").select("approval_id, starts_at, ends_at").in("approval_id", leaveIds);
    for (const o of off ?? []) daysOff.set(o.approval_id as string, { from: o.starts_at as string, to: o.ends_at as string });
  }
  const ruleFor = new Map<string, number>();
  for (const r of rules.data ?? []) ruleFor.set(r.kind as string, Number(r.threshold_amount));

  return rows.map((a) => {
    const requester = a.requester as unknown as { person: { full_name: string } | null; role: { key: string } | null } | null;
    const decider = a.decider as unknown as { person: { full_name: string } | null } | null;
    const more = extra.get(a.id as string);
    return {
      id: a.id as string,
      kind: a.kind as string,
      amount: a.amount === null ? null : Number(a.amount),
      status: a.status as string,
      createdAt: a.created_at as string,
      decidedAt: (a.decided_at as string | null) ?? null,
      requesterName: requester?.person?.full_name ?? "A team member",
      requesterRole: requester?.role?.key ?? null,
      reason: (a.note as string | null) ?? spentOn.get(a.id as string) ?? null,
      decisionNote: more?.decision_note ?? null,
      deciderName: decider?.person?.full_name ?? null,
      receipt: a.source_entity_id ? (receipts.get(a.source_entity_id as string) ?? null) : null,
      returned: (more?.return_condition as ApprovalItem["returned"]) ?? null,
      isOwnRequest: a.requested_by === ctx.membershipId,
      ruleAbove: ruleFor.get(a.kind as string) ?? null,
      days: daysOff.get(a.id as string) ?? null,
    };
  });
}

// ------------------------------------------------------------- attendance --

export interface PersonToday {
  membershipId: string;
  /** Checked in and not out yet. */
  inSince: string | null;
  inAt: string | null;
  /** Agreed time off covering today. */
  onLeaveUntil: string | null;
  /** Days with a check-in in the last 7, and closed hours in them. */
  daysThisWeek: number;
  hoursThisWeek: number;
}

/** Who is here, who is away, and the week so far, for every member. */
export async function loadAttendance(businessId: string): Promise<Map<string, PersonToday>> {
  const db = supabaseServer();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const [records, leave] = await Promise.all([
    db
      .from("attendance_record")
      .select("membership_id, check_in, check_out, location:location_id(name)")
      .eq("business_id", businessId)
      .gte("check_in", weekAgo)
      .order("check_in", { ascending: true })
      .limit(2000),
    db
      .from("staff_time_off")
      .select("membership_id, starts_at, ends_at")
      .eq("business_id", businessId)
      .eq("status", "approved")
      .lte("starts_at", now.toISOString())
      .gte("ends_at", now.toISOString())
      .limit(100),
  ]);
  const out = new Map<string, PersonToday>();
  const get = (id: string) => {
    let p = out.get(id);
    if (!p) {
      p = { membershipId: id, inSince: null, inAt: null, onLeaveUntil: null, daysThisWeek: 0, hoursThisWeek: 0 };
      out.set(id, p);
    }
    return p;
  };
  const days = new Map<string, Set<string>>();
  for (const r of records.data ?? []) {
    const id = r.membership_id as string;
    const p = get(id);
    const day = new Date(r.check_in as string).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
    if (!days.has(id)) days.set(id, new Set());
    days.get(id)!.add(day);
    if (r.check_out) {
      p.hoursThisWeek += (new Date(r.check_out as string).getTime() - new Date(r.check_in as string).getTime()) / 3600e3;
    } else {
      p.inSince = r.check_in as string;
      p.inAt = (r.location as unknown as { name: string } | null)?.name ?? null;
    }
  }
  days.forEach((set, id) => {
    get(id).daysThisWeek = set.size;
  });
  for (const l of leave.data ?? []) get(l.membership_id as string).onLeaveUntil = l.ends_at as string;
  out.forEach((p) => {
    p.hoursThisWeek = Math.round(p.hoursThisWeek * 10) / 10;
  });
  return out;
}

// ------------------------------------------------------------------ labels --

export const KIND_LABEL: Record<string, string> = {
  expense: "Money spent",
  refund: "Refund",
  discount: "Discount",
  purchase: "Purchase",
  leave: "Time off",
  void: "Cancelled sale",
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  accountant: "Accountant",
  staff: "Staff",
};
