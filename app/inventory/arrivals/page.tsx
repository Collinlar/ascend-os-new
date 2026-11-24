import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { checkPageAccess } from "@/lib/authority/page";
import { resolveAuthority } from "@/lib/authority/context";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/shell/Page";
import TransferArrival from "@/components/inventory/TransferArrival";
import { stockTransfers } from "@/lib/domains/inventory";

export const dynamic = "force-dynamic";

// Goods on the way (Advanced Inventory A1, 0131). Open to anyone on the
// team, so whoever is at the branch when the goods come can count them in
// on their own phone. A person kept to certain places sees only what is
// coming to those places.

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default async function Arrivals() {
  await checkPageAccess("/inventory/arrivals");
  const personId = await currentPersonId();
  const membership = personId
    ? await activeMembership<{ business_id: string; role: { key: string } | null }>(personId, "business_id, role:role_id(key)")
    : null;
  if (!personId || !membership) {
    return (
      <PageShell>
        <PageHeader title="Goods on the way" />
        <EmptyState title="Sign in to receive stock." detail="We send a code to the WhatsApp number your business is set up with." />
      </PageShell>
    );
  }
  const businessId = membership.business_id;
  const [authority, transfers] = await Promise.all([resolveAuthority(personId, businessId), stockTransfers(businessId, { onTheWayOnly: true, limit: 50 })]);
  const scope = authority.locationScope?.length ? authority.locationScope : null;
  const mine = scope ? transfers.filter((t) => scope.includes(t.toId)) : transfers;
  const canManage = ["owner", "manager"].includes(membership.role?.key ?? "");

  return (
    <PageShell>
      {canManage && (
        <Link href="/inventory?tab=transfers" className="tap -mt-2 mb-2 inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-teal-800">
          Back to Inventory
        </Link>
      )}
      <PageHeader title="Goods on the way" intro="When they arrive, count what is in the box and type it here." />
      {mine.length === 0 ? (
        <EmptyState title="Nothing is on the way to you." detail="When stock is sent to your place, it appears here for you to count in." />
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          {mine.map((t) => (
            <Panel key={t.id} className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-neutral-500">To {t.to}</p>
              <h2 className="mt-1 font-heading text-[17px] font-bold text-ink-heading">
                {t.lines.length} {t.lines.length === 1 ? "product" : "products"} from {t.from}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-neutral-600">
                Sent by {t.sentBy}, {when(t.sentAt)}
                {t.note ? ` · “${t.note}”` : ""}
              </p>
              <div className="mt-3">
                <TransferArrival key={t.id} businessId={businessId} transfer={{ id: t.id, from: t.from, toId: t.toId, lines: t.lines.map((l) => ({ itemId: l.itemId, item: l.item })) }} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
