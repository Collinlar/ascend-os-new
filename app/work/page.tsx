import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import WorkBoard, {
  type ApprovalRow,
  type TaskRow,
} from "@/components/office/WorkBoard";

export const dynamic = "force-dynamic";

// Ascend Office. Decisions waiting on this person come first, then their
// own work (OFF-008). Tasks show what they came from, because a fulfilment
// task without its order is just a sentence.

async function load(): Promise<{
  businessId: string;
  membershipId: string;
  checkedIn: boolean;
  tasks: TaskRow[];
  approvals: ApprovalRow[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const { data: membership } = await db
      .from("business_membership")
      .select("id, business_id")
      .eq("person_id", personId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return null;

    const [tasks, approvals, openAttendance] = await Promise.all([
      db
        .from("task")
        .select("id, title, detail, status, due_at, source_entity_type, source_entity_id")
        .eq("business_id", membership.business_id)
        .in("status", ["open", "in_progress", "blocked"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(40),
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
    ]);

    return {
      businessId: membership.business_id as string,
      membershipId: membership.id as string,
      checkedIn: Boolean(openAttendance.data),
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
          <p className="text-sm text-mid-grey">
            Decisions waiting on you, then what you need to do.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to see your work.
          </p>
        ) : (
          <WorkBoard
            checkedIn={data.checkedIn}
            tasks={data.tasks}
            approvals={data.approvals}
          />
        )}
      </div>
    </main>
  );
}
