import Link from "next/link";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, primaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import TaskBoard from "@/components/office/TaskBoard";
import { MODULES, officeTabs } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { loadApprovals, loadMembers, loadTasks, officeContext } from "@/lib/office/load";

export const dynamic = "force-dynamic";

// Office, the Work board (Modules M2). Everything open, by column, and what
// was finished this week. Work handed out by Shop and Services shows here
// with what it came from, beside the jobs the business runs itself.

export default async function Board({ searchParams }: { searchParams: { new?: string } }) {
  await checkPageAccess("/work/board");
  const ctx = await officeContext();
  if (ctx === "not_included") redirect("/grow");
  if (ctx === "signed_out" || ctx === "unreadable") {
    return (
      <ModulePage identity={MODULES.office} title="Work">
        <EmptyState
          title={ctx === "signed_out" ? "Sign in to see the work." : "We could not open the board just now."}
          detail={ctx === "signed_out" ? "We send a code to the WhatsApp number your business is set up with." : "Refresh in a moment. Nothing has moved."}
        />
      </ModulePage>
    );
  }
  if (!ctx.modules.tasks) redirect("/work");

  const [tasks, members, approvals] = await Promise.all([
    loadTasks(ctx).catch(() => null),
    loadMembers(ctx.businessId),
    ctx.modules.approvals && ctx.runsThePlace ? loadApprovals(ctx).catch(() => []) : Promise.resolve([]),
  ]);
  const waiting = approvals.filter((a) => a.status === "requested" && !a.isOwnRequest).length;

  return (
    <ModulePage
      identity={MODULES.office}
      title="Work"
      tabs={officeTabs(ctx.capabilities, "/work/board", { runsThePlace: ctx.runsThePlace, waiting })}
      action={
        ctx.modules.projects ? (
          <Link href="/work/board?new=task" className={primaryAction}>
            <Icon name="plus" size={16} />
            New task
          </Link>
        ) : undefined
      }
    >
      {tasks === null ? (
        <EmptyState title="We could not load the board just now." detail="Refresh in a moment. Nothing has moved." />
      ) : (
        <TaskBoard
          tasks={tasks}
          team={members.map((m) => ({ membershipId: m.membershipId, name: m.name }))}
          me={ctx.membershipId}
          runsThePlace={ctx.runsThePlace}
          canAdd={ctx.modules.projects}
          startAdding={searchParams.new === "task" && ctx.modules.projects}
        />
      )}
    </ModulePage>
  );
}
