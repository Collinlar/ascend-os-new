import { redirect } from "next/navigation";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import ApprovalsDesk from "@/components/office/ApprovalsDesk";
import { MODULES, officeTabs } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { loadApprovals, officeContext } from "@/lib/office/load";

export const dynamic = "force-dynamic";

// Office, Approvals (Modules M2). Every request that waits on a yes: a
// refund from the till, money spent above the business's limit, something
// to buy, time off. One at a time, with what the decider needs beside it.
// Whoever runs the place sees them all; anyone else sees only their own.

export default async function Approvals({ searchParams }: { searchParams: { id?: string } }) {
  await checkPageAccess("/work/approvals");
  const ctx = await officeContext();
  if (ctx === "not_included") redirect("/grow");
  if (ctx === "signed_out" || ctx === "unreadable") {
    return (
      <ModulePage identity={MODULES.office} title="Approvals">
        <EmptyState
          title={ctx === "signed_out" ? "Sign in to see what is waiting." : "We could not open Approvals just now."}
          detail={ctx === "signed_out" ? "We send a code to the WhatsApp number your business is set up with." : "Refresh in a moment. Nothing has changed."}
        />
      </ModulePage>
    );
  }
  if (!ctx.modules.approvals) redirect("/work");

  const all = await loadApprovals(ctx).catch(() => null);
  const items = all ? (ctx.runsThePlace ? all : all.filter((a) => a.isOwnRequest)) : null;
  const waiting = items?.filter((a) => a.status === "requested" && !a.isOwnRequest).length ?? 0;

  return (
    <ModulePage
      identity={MODULES.office}
      title="Approvals"
      tabs={officeTabs(ctx.capabilities, "/work/approvals", { runsThePlace: ctx.runsThePlace, waiting })}
    >
      {items === null ? (
        <EmptyState title="We could not load the requests just now." detail="Refresh in a moment. Nothing has been decided." />
      ) : (
        <ApprovalsDesk items={items} startWith={/^[0-9a-f-]{36}$/i.test(searchParams.id ?? "") ? searchParams.id : null} />
      )}
    </ModulePage>
  );
}
