import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { loadCommandCentre, type CommandCentre } from "@/lib/office/command-centre";
import CommandCentreView from "@/components/office/CommandCentre";
import { loadSchedule, type ScheduleEntry } from "@/lib/office/schedule";
import Schedule from "@/components/office/Schedule";
import WorkBoard, {
  type ApprovalRow,
  type LeaveRow,
  type ProjectRow,
  type TaskRow,
  type TeamOption,
} from "@/components/office/WorkBoard";

export const dynamic = "force-dynamic";

// Ascend Office. Decisions waiting on this person come first, then their
// own work (OFF-008). Tasks show what they came from, because a fulfilment
// task without its order is just a sentence.
//
// The screen is role-aware, which is what Office PRD 27 asks for. It says
// Business Mobile "should not reproduce the complete Office web
// application" and lists different priorities for the two audiences: an
// owner wants approvals, who is in, what is overdue and what is going
// wrong; a member of staff wants what they have to do, when, where, and
// what they have asked for. Same URL, different screen.
//
// It is also a privacy rule, not only a layout one. A cashier has no
// business seeing what the team spent this week or who else asked for
// Friday off (OFF-MOB-026).

async function load(): Promise<{
  businessId: string;
  membershipId: string;
  /** owner and manager see the business; everybody else sees their own day. */
  runsThePlace: boolean;
  checkedIn: boolean;
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  team: TeamOption[];
  centre: CommandCentre;
  leave: LeaveRow[];
  projects: ProjectRow[];
  schedule: ScheduleEntry[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{
      id: string;
      business_id: string;
      role: { key: string } | null;
    }>(personId, "id, business_id, role:role_id(key)");
    if (!membership) return null;

    const roleKey = (membership.role as unknown as { key: string } | null)?.key;
    const runsThePlace = roleKey === "owner" || roleKey === "manager";

    const [
      tasks,
      approvals,
      openAttendance,
      team,
      centre,
      leave,
      projects,
      schedule,
    ] = await Promise.all([
      // A manager sees the whole board. Everybody else sees what is theirs
      // and what nobody has picked up, which is the honest answer to "what
      // do I need to do" and avoids handing a cashier the team's workload.
      (runsThePlace
        ? db
            .from("task")
            .select("id, title, detail, status, due_at, source_entity_type, source_entity_id, assigned_membership_id")
            .eq("business_id", membership.business_id)
            .in("status", ["open", "in_progress", "blocked"])
            .order("due_at", { ascending: true, nullsFirst: false })
            .limit(40)
        : db
            .from("task")
            .select("id, title, detail, status, due_at, source_entity_type, source_entity_id, assigned_membership_id")
            .eq("business_id", membership.business_id)
            .in("status", ["open", "in_progress", "blocked"])
            .or(`assigned_membership_id.eq.${membership.id},assigned_membership_id.is.null`)
            .order("due_at", { ascending: true, nullsFirst: false })
            .limit(40)),
      db
        .from("approval_request")
        .select(
          "id, kind, amount, currency_code, created_at, requested_by, requester:requested_by(person:person_id(full_name))"
        )
        .eq("business_id", membership.business_id)
        .eq("status", "requested")
        .order("created_at", { ascending: true })
        .limit(20),
      db
        .from("attendance_record")
        .select("id")
        .eq("membership_id", membership.id)
        .is("check_out", null)
        .limit(1)
        .maybeSingle(),
      // Who work can be handed to. Names only: this is a picker, not the
      // staff directory.
      db
        .from("business_membership")
        .select("id, person:person_id(full_name)")
        .eq("business_id", membership.business_id)
        .eq("status", "active")
        .limit(50),
      loadCommandCentre(membership.business_id as string),
      db.rpc("staff_leave", { p_business: membership.business_id }),
      db.rpc("business_projects", { p_business: membership.business_id }),
      loadSchedule(membership.business_id as string),
    ]);

    return {
      businessId: membership.business_id as string,
      membershipId: membership.id as string,
      runsThePlace,
      checkedIn: Boolean(openAttendance.data),
      centre,
      schedule,
      leave: ((leave.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
        id: l.id as string,
        staffName: l.staff_name as string,
        startsAt: l.starts_at as string,
        endsAt: l.ends_at as string,
        reason: (l.reason as string) ?? null,
        status: l.status as string,
        isSelf: l.membership_id === membership.id,
      })).filter((l) => runsThePlace || l.isSelf),
      projects: ((projects.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        detail: (p.detail as string) ?? null,
        customerName: (p.customer_name as string) ?? null,
        dueOn: (p.due_on as string) ?? null,
        tasksTotal: Number(p.tasks_total ?? 0),
        tasksDone: Number(p.tasks_done ?? 0),
        milestonesTotal: Number(p.milestones_total ?? 0),
        milestonesReached: Number(p.milestones_reached ?? 0),
        nextMilestone: (p.next_milestone as string) ?? null,
        nextMilestoneDue: (p.next_milestone_due as string) ?? null,
      })),
      team: (team.data ?? []).map((m) => ({
        membershipId: m.id,
        name:
          (m.person as unknown as { full_name: string } | null)?.full_name ??
          "A team member",
      })),
      tasks: (tasks.data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.detail,
        status: t.status,
        dueAt: t.due_at,
        sourceType: t.source_entity_type,
      })),
      approvals: (approvals.data ?? []).map((a) => {
        const requester = a.requester as unknown as {
          person: { full_name: string } | null;
        } | null;
        return {
          id: a.id,
          kind: a.kind,
          amount: a.amount === null ? null : Number(a.amount),
          createdAt: a.created_at,
          requesterName: requester?.person?.full_name ?? "A team member",
          // Whether this person may decide it is enforced server-side; the
          // UI only avoids offering an action that would be refused.
          isOwnRequest: a.requested_by === membership.id,
        };
      }),
    };
  } catch {
    return null;
  }
}

export default async function Work() {
  const data = await load();

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Your work</h1>
          <p className="text-sm text-ink-muted">
            What is late, who is here, and what needs deciding.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-ink-muted">
            Verify your WhatsApp number to see your work.
          </p>
        ) : (
          <div className="space-y-6">
            {/* The business view, for whoever runs it. A cashier gets the
                counters for their own day instead, further down. */}
            {data.runsThePlace && (
              <CommandCentreView
                data={data.centre}
                approvalsWaiting={data.approvals.length}
              />
            )}
            <Schedule entries={data.schedule} />
            <WorkBoard
              checkedIn={data.checkedIn}
              tasks={data.tasks}
              approvals={data.approvals}
              team={data.team}
              leave={data.leave}
              projects={data.projects}
              runsThePlace={data.runsThePlace}
            />
          </div>
        )}
      </div>
    </main>
  );
}
