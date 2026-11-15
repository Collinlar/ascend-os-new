import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import CustomerList, { type CustomerRow } from "@/components/customers/CustomerList";
import { checkPageAccess } from "@/lib/authority/page";
import { coreCustomerMoney, readersMode, recordDifferences } from "@/lib/reporting/core-readers";

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
  query: string;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data } = await db.rpc("business_customers", {
      p_business: membership.business_id,
      p_query: query || null,
    });

    let customers: CustomerRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
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
        lastSeen: (c.last_seen as string) ?? null,
        marketingConsent: Boolean(c.marketing_consent),
      }));

    // Phase 2, step 2d: spent and owed from the commerce core. In compare
    // mode (the default) today's figures are shown and the whole-business
    // totals are compared on an unfiltered load; with COMMERCE_READERS=core
    // the core's are shown. If the core cannot be read, today's stand.
    const core = await coreCustomerMoney(membership.business_id);
    if (core) {
      if (!query) {
        const total = (pick: (c: { spent: number; owed: number }) => number, rows: Iterable<{ spent: number; owed: number }>) =>
          Math.round(Array.from(rows).reduce((n, r) => n + pick(r), 0) * 100) / 100;
        await recordDifferences(membership.business_id, "customers", new Date().toISOString().slice(0, 10), [
          { figure: "spent_total", current: total((c) => c.spent, customers), core: total((c) => c.spent, core.values()) },
          { figure: "owed_total", current: total((c) => c.owed, customers), core: total((c) => c.owed, core.values()) },
        ]);
      }
      if (readersMode() === "core") {
        customers = customers.map((c) => ({
          ...c,
          spent: core.get(c.id)?.spent ?? 0,
          owed: core.get(c.id)?.owed ?? 0,
        }));
      }
    }

    return { query, customers };
  } catch {
    return null;
  }
}

export default async function Customers({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/customers");

  const data = await load(searchParams.q ?? "");

  return (
    <PageShell>
      <PageHeader
        title="Your customers"
        intro="Everyone who has bought from you, however they did it. A till sale, an online order, a booking and an invoice all sit under one person."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to see your customers."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <CustomerList customers={data.customers} query={data.query} />
      )}
    </PageShell>
  );
}
