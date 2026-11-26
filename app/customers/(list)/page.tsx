import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import Link from "next/link";
import { EmptyState, primaryAction } from "@/components/shell/Page";
import { ModulePage } from "@/components/shell/Module";
import { Icon } from "@/components/shell/icons";
import { MODULES } from "@/lib/nav/modules";
import CustomerList, { type CustomerRow } from "@/components/customers/CustomerList";
import { visitsOf } from "@/lib/customers/visits";
import { formatGHS } from "@/lib/money";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// Who this business sells to.
//
// Nine tables have carried customer_id since the beginning and nothing ever
// joined them, so a merchant could not answer "who are my customers" or
// "what has this person bought before". The record was shared all along;
// there was simply no screen that read it.
//
// This is also where the zero-silo promise becomes visible rather than
// architectural: a till sale, an online order, a booking and an invoice
// appear in one history because they were always one customer underneath.

async function load(query: string): Promise<{
  customers: CustomerRow[];
  /** Everyone, for the figures, whatever the search kept. */
  everyone: CustomerRow[];
  query: string;
  canRecordConsent: boolean;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ id: string; business_id: string }>(personId, "id, business_id");
    if (!membership) return null;

    // Everyone once; the search narrows the list on this side, so the
    // figures above it always describe the whole customer base.
    const { data } = await db.rpc("business_customers", {
      p_business: membership.business_id,
      p_query: null,
    });

    // Spent and owed come from the commerce core: business_customers()
    // takes them from commerce_customer_money() since 0090 (Phase 2, 2d.5).
    const everyone: CustomerRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        name: c.display_name as string,
        phone: (c.phone_e164 as string) ?? null,
        email: (c.email as string) ?? null,
        createdVia: (c.created_via as string) ?? "manual",
        orders: Number(c.orders ?? 0),
        sales: Number(c.sales ?? 0),
        bookings: Number(c.bookings ?? 0),
        documents: Number(c.documents ?? 0),
        spent: Number(c.spent ?? 0),
        owed: Number(c.owed ?? 0),
        // business_customers (0090) answers "never" with the epoch.
        lastSeen: c.last_seen && new Date(c.last_seen as string).getUTCFullYear() > 2000 ? (c.last_seen as string) : null,
        marketingConsent: Boolean(c.marketing_consent),
      }));

    // Recording consent needs customers.manage (0088), read from the same
    // source the server check uses, so nobody is offered a switch the server
    // will refuse.
    const { data: authority } = await db.rpc("membership_authority", { p_membership: membership.id });
    const permissions = new Set<string>(
      ((authority as { permissions?: string[] } | null)?.permissions) ?? []
    );

    const q = query.trim().toLowerCase();
    const customers = q
      ? everyone.filter((c) => [c.name, c.phone ?? "", c.email ?? ""].some((x) => x.toLowerCase().includes(q)) || (c.phone ?? "").replace(/^\+233/, "0").includes(q.replace(/\s/g, "")))
      : everyone;

    return { query, customers, everyone, canRecordConsent: permissions.has("customers.manage") };
  } catch {
    return null;
  }
}

export default async function Customers({
  searchParams,
}: {
  searchParams: { q?: string; add?: string };
}) {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/customers");

  const data = await load(searchParams.q ?? "");

  return (
    <ModulePage
      identity={MODULES.customers}
      search={{
        action: "/customers",
        placeholder: "Search by name or number",
        defaultValue: data?.query ?? "",
      }}
      action={
        data?.canRecordConsent ? (
          <Link href="/customers?add=1" className={primaryAction}>
            <Icon name="plus" size={16} />
            Add customer
          </Link>
        ) : undefined
      }
    >
      {data && data.everyone.length > 0 && <Figures everyone={data.everyone} />}
      {data === null ? (
        <EmptyState
          title="Sign in to see your customers."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <CustomerList
          customers={data.customers}
          query={data.query}
          canRecordConsent={data.canRecordConsent}
          startAdding={searchParams.add === "1"}
        />
      )}
    </ModulePage>
  );
}

// The four figures (Modules M5), from the whole list.
function Figures({ everyone }: { everyone: CustomerRow[] }) {
  const came = everyone.filter((c) => visitsOf(c) >= 1);
  const back = came.filter((c) => visitsOf(c) > 1);
  const ninety = Date.now() - 90 * 864e5;
  const quiet = everyone.filter((c) => c.lastSeen && new Date(c.lastSeen).getTime() < ninety);
  const owing = everyone.filter((c) => c.owed > 0.005);
  const figures = [
    { label: "Customers", value: everyone.length.toLocaleString("en-GH"), sub: "From the till, Shop, bookings and documents" },
    {
      label: "Came back",
      value: came.length ? `${Math.round((back.length / came.length) * 100)}%` : "None yet",
      sub: came.length ? `${back.length} of ${came.length} came more than once` : "Once someone buys twice",
    },
    {
      label: "Not seen in 90 days",
      value: String(quiet.length),
      sub: quiet.length ? `Spent ${formatGHS(quiet.reduce((n, c) => n + c.spent, 0))} before` : "Everyone has been back lately",
    },
    {
      label: "Owe you",
      value: formatGHS(owing.reduce((n, c) => n + c.owed, 0)),
      sub: owing.length ? `${owing.length} customer${owing.length === 1 ? "" : "s"}` : "Nobody owes you",
    },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
          <span className="text-[12.5px] text-neutral-600">{f.label}</span>
          <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{f.value}</span>
          <span className="text-xs text-neutral-600">{f.sub}</span>
        </div>
      ))}
    </div>
  );
}
