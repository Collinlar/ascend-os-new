
import { ModulePage } from "@/components/shell/Module";
import { MODULES, currentCapabilities, officeTabs } from "@/lib/nav/modules";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { effectiveAccess } from "@/lib/domains/entitlements";
import { canEnterOffice, officeModules, type OfficeModules } from "@/lib/office/access";
import { activeMembership } from "@/lib/auth/active-business";
import { loadCommandCentre, type CommandCentre } from "@/lib/office/command-centre";
import CommandCentreView from "@/components/office/CommandCentre";
import { loadSchedule, type ScheduleEntry } from "@/lib/office/schedule";
import Schedule from "@/components/office/Schedule";
import { checkPageAccess } from "@/lib/authority/page";
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

interface WorkData {
  businessId: string;
  membershipId: string;
  /** owner and manager see the business; everybody else sees their own day. */
  runsThePlace: boolean;
  checkedIn: boolean;
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  team: TeamOption[];
  centre: CommandCentre | null;
  leave: LeaveRow[];
  projects: ProjectRow[];
  schedule: ScheduleEntry[];
  /** Which sections this business has. The server refuses the rest too. */
  modules: OfficeModules;
}

// Why there is nothing to show, so the page can say the true thing rather
// than telling someone who is signed in to verify their number.
type Loaded = WorkData | "signed_out" | "unreadable" | "not_included";

async function load(): Promise<Loaded> {
  try {
    const personId = await currentPersonId();
    if (!personId) return "signed_out";

    const db = supabaseServer();
    const membership = await activeMembership<{
      id: string;
      business_id: string;
      role: { key: string } | null;
    }>(personId, "id, business_id, role:role_id(key)");
    if (!membership) return "signed_out";

    // The nav only shows this to a business that holds something Office
    // carries, but a link hidden is not a door shut. Ask the same question
    // here, from the same table the route uses.
    const access = await effectiveAccess(membership.business_id).catch(() => null);
    if (!access) return "unreadable";
    if (!canEnterOffice(access.capabilities)) return "not_included";
    const modules = officeModules(access.capabilities);

    const roleKey = (membership.role as unknown as { key: string } | null)?.key;
    const runsThePlace = roleKey === "owner" || roleKey === "manager";
    const none = Promise.resolve({ data: null });

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
      // Each section is read only if this business has it, so a business
      // that never took Office is not handed its data either.
      modules.tasks ? (runsThePlace
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
            .limit(40)) : none,
      modules.approvals
        ? db
            .from("approval_request")
            .select(
              "id, kind, amount, currency_code, created_at, requested_by, note, source_entity_type, source_entity_id, requester:requested_by(person:person_id(full_name))"
            )
            .eq("business_id", membership.business_id)
            .eq("status", "requested")
            .order("created_at", { ascending: true })
            .limit(20)
        : none,
      modules.attendance
        ? db
            .from("attendance_record")
            .select("id")
            .eq("membership_id", membership.id)
            .is("check_out", null)
            .limit(1)
            .maybeSingle()
        : none,
      // Who work can be handed to. Names only: this is a picker, not the
      // staff directory.
      db
        .from("business_membership")
        .select("id, person:person_id(full_name)")
        .eq("business_id", membership.business_id)
        .eq("status", "active")
        .limit(50),
      modules.commandCentre
        ? loadCommandCentre(membership.business_id as string)
        : Promise.resolve(null),
      modules.leave
        ? db.rpc("staff_leave", { p_business: membership.business_id })
        : none,
      modules.projects
        ? db.rpc("business_projects", { p_business: membership.business_id })
        : none,
      modules.schedule
        ? loadSchedule(membership.business_id as string)
        : Promise.resolve([] as ScheduleEntry[]),
    ]);

    // Which sale a refund is for, by its receipt number, so the owner can
    // find it and is not deciding blind.
    const saleIds = (approvals.data ?? [])
      .filter((a) => a.source_entity_type === "sale" && a.source_entity_id)
      .map((a) => a.source_entity_id as string);
    const receipts = new Map<string, string>();
    if (saleIds.length > 0) {
      const { data: sales } = await db
        .from("sale")
        .select("id, receipt_number")
        .eq("business_id", membership.business_id)
        .in("id", saleIds);
      for (const s of sales ?? []) receipts.set(s.id as string, s.receipt_number as string);
    }

    // What came back with each refund (0128), read on its own so Work keeps
    // working on a database that does not have the column yet.
    const returned = new Map<string, string>();
    const refundIds = (approvals.data ?? []).filter((a) => a.kind === "refund").map((a) => a.id as string);
    if (refundIds.length > 0) {
      const { data: conds } = await db.from("approval_request").select("id, return_condition").in("id", refundIds);
      for (const c of (conds ?? []) as { id: string; return_condition: string | null }[]) {
        if (c.return_condition) returned.set(c.id, c.return_condition);
      }
    }

    return {
      businessId: membership.business_id as string,
      membershipId: membership.id as string,
      runsThePlace,
      checkedIn: Boolean(openAttendance.data),
      centre,
      schedule,
      modules,
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
          reason: (a.note as string | null) ?? null,
          receipt: a.source_entity_id ? (receipts.get(a.source_entity_id as string) ?? null) : null,
          returned: (returned.get(a.id as string) as "restock" | "damaged" | "not_returned" | undefined) ?? null,
          // Whether this person may decide it is enforced server-side; the
          // UI only avoids offering an action that would be refused.
          isOwnRequest: a.requested_by === membership.id,
        };
      }),
    };
  } catch {
    return "unreadable";
  }
}

export default async function Work() {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/work");

  const data = await load();

  // A business that holds nothing Office carries has no work screen. Send it
  // to the place where it can add something, as Services and Shop do.
  if (data === "not_included") redirect("/grow");

  return (
    <ModulePage identity={MODULES.office} tabs={officeTabs(await currentCapabilities(), "/work")}>

      <div className="max-w-3xl">
        {data === "signed_out" ? (
          <p className="py-16 text-center text-ink-muted">
            Verify your WhatsApp number to see your work.
          </p>
        ) : data === "unreadable" ? (
          <p className="py-16 text-center text-ink-muted">
            We could not load your work just now. Refresh in a moment.
          </p>
        ) : (
          <div className="space-y-6">
            {/* The business view, for whoever runs it. A cashier gets the
                counters for their own day instead, further down. */}
            {data.runsThePlace && data.centre && (
              <CommandCentreView
                data={data.centre}
                approvalsWaiting={data.approvals.length}
              />
            )}
            {data.modules.schedule && <Schedule entries={data.schedule} />}
            <WorkBoard
              checkedIn={data.checkedIn}
              tasks={data.tasks}
              approvals={data.approvals}
              team={data.team}
              leave={data.leave}
              projects={data.projects}
              runsThePlace={data.runsThePlace}
              modules={data.modules}
            />
          </div>
        )}
      </div>
    </ModulePage>
  );
}
