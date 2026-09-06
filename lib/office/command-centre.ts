import "server-only";

import { supabaseServer } from "@/lib/supabase";

// The Office daily command centre (Office PRD 13).
//
// "The dashboard is not a vanity analytics page. It should show what the
// user needs to act on next." So this counts what is late, what is due, who
// is actually here, and what the team has just done. Nothing here is a
// chart.
//
// One loader rather than a query per module, because a merchant on a
// Ghanaian mobile connection pays for every round trip.

export interface TeamMemberToday {
  membershipId: string;
  name: string;
  since: string;
  /** Checked in from the till rather than by hand. */
  fromTill: boolean;
}

export interface ActivityItem {
  id: string;
  at: string;
  who: string;
  what: string;
}

export interface Pulse {
  tasksDone7d: number;
  tasksOpen: number;
  spend7d: number;
  approvalsWaiting: number;
  hoursWorked7d: number;
}

export interface OpenShift {
  id: string;
  cashier: string;
  locationName: string | null;
  openedAt: string;
}

export interface CommandCentre {
  dueToday: number;
  atRisk: number;
  inProgress: number;
  teamToday: TeamMemberToday[];
  /** Tills selling right now. Office should be able to see the shop floor
   *  without opening POS (Office PRD 26, shift visibility). */
  openShifts: OpenShift[];
  activity: ActivityItem[];
  pulse: Pulse;
}

function nameOf(row: { person?: { full_name?: string | null } | null } | null): string {
  return row?.person?.full_name ?? "A team member";
}

export async function loadCommandCentre(businessId: string): Promise<CommandCentre> {
  const db = supabaseServer();
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();

  const [openTasks, present, doneTasks, spend, approvals, attendance, shifts] =
    await Promise.all([
      db
        .from("task")
        .select("id, due_at, status")
        .eq("business_id", businessId)
        .in("status", ["open", "in_progress", "blocked"])
        .limit(500),
      // Who is actually here. An open attendance record is somebody at work.
      db
        .from("attendance_record")
        .select("id, membership_id, check_in, source, membership:membership_id(person:person_id(full_name))")
        .eq("business_id", businessId)
        .is("check_out", null)
        .order("check_in", { ascending: true })
        .limit(30),
      db
        .from("task")
        .select("id, title, updated_at, status")
        .eq("business_id", businessId)
        .eq("status", "done")
        .gte("updated_at", weekAgo)
        .order("updated_at", { ascending: false })
        .limit(20),
      db
        .from("expense")
        .select("id, amount, detail, created_at, membership:membership_id(person:person_id(full_name))")
        .eq("business_id", businessId)
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("approval_request")
        .select("id, kind, amount, status, decided_at, created_at, decider:decided_by(person:person_id(full_name))")
        .eq("business_id", businessId)
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("attendance_record")
        .select("check_in, check_out")
        .eq("business_id", businessId)
        .gte("check_in", weekAgo)
        .limit(200),
      db
        .from("pos_shift")
        .select("id, opened_at, location:location_id(name), cashier:cashier_membership_id(person:person_id(full_name))")
        .eq("business_id", businessId)
        .eq("status", "open")
        .order("opened_at", { ascending: true })
        .limit(20),
    ]);

  const tasks = openTasks.data ?? [];
  const endIso = endOfToday.toISOString();
  const nowIso = now.toISOString();

  const dueToday = tasks.filter(
    (t) => t.due_at && t.due_at <= endIso && t.due_at >= nowIso
  ).length;
  // Past its date and still not done. This is the number that should make
  // somebody open the list.
  const atRisk = tasks.filter((t) => t.due_at && t.due_at < nowIso).length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;

  const teamToday: TeamMemberToday[] = (present.data ?? []).map((a) => ({
    membershipId: a.membership_id,
    name: nameOf(a.membership as never),
    since: a.check_in,
    fromTill: a.source === "pos_shift",
  }));

  // The feed is built from what actually happened rather than from an audit
  // table, so it says "Ama recorded 40.00 GHS" instead of naming a row.
  const activity: ActivityItem[] = [
    ...(doneTasks.data ?? []).map((t) => ({
      id: `task:${t.id}`,
      at: t.updated_at as string,
      who: "",
      what: `Finished "${t.title}"`,
    })),
    ...(spend.data ?? []).map((e) => ({
      id: `expense:${e.id}`,
      at: e.created_at as string,
      who: nameOf(e.membership as never),
      what: `Recorded ${Number(e.amount).toFixed(2)} GHS${e.detail ? ` for ${e.detail}` : ""}`,
    })),
    ...(approvals.data ?? [])
      .filter((a) => a.status !== "requested")
      .map((a) => ({
        id: `approval:${a.id}`,
        at: (a.decided_at ?? a.created_at) as string,
        who: nameOf(a.decider as never),
        what: `${a.status === "approved" ? "Approved" : "Turned down"} a ${a.kind}${
          a.amount ? ` of ${Number(a.amount).toFixed(2)} GHS` : ""
        }`,
      })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  // Hours worked, closed records only: somebody still on shift has not
  // finished the hours yet, and counting them would inflate the week.
  const hoursWorked =
    (attendance.data ?? []).reduce((sum, a) => {
      if (!a.check_out) return sum;
      return sum + (new Date(a.check_out).getTime() - new Date(a.check_in).getTime());
    }, 0) / 3600e3;

  const openShifts: OpenShift[] = (shifts.data ?? []).map((s) => ({
    id: s.id,
    cashier: nameOf(s.cashier as never),
    locationName: (s.location as unknown as { name: string } | null)?.name ?? null,
    openedAt: s.opened_at as string,
  }));

  return {
    dueToday,
    atRisk,
    inProgress,
    teamToday,
    openShifts,
    activity,
    pulse: {
      tasksDone7d: (doneTasks.data ?? []).length,
      tasksOpen: tasks.length,
      spend7d: (spend.data ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0),
      approvalsWaiting: (approvals.data ?? []).filter((a) => a.status === "requested")
        .length,
      hoursWorked7d: Math.round(hoursWorked * 10) / 10,
    },
  };
}
