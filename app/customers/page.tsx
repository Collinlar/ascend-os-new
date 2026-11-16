import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import CustomerList, { type CustomerRow } from "@/components/customers/CustomerList";
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
  query: string;
  canRecordConsent: boolean;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ id: string; business_id: string }>(personId, "id, business_id");
    if (!membership) return null;

    const { data } = await db.rpc("business_customers", {
      p_business: membership.business_id,
      p_query: query || null,
    });

    // Spent and owed come from the commerce core: business_customers()
    // takes them from commerce_customer_money() since 0090 (Phase 2, 2d.5).
    const customers: CustomerRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
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

    // Recording consent needs customers.manage (0088), read from the same
    // source the server check uses, so nobody is offered a switch the server
    // will refuse.
    const { data: authority } = await db.rpc("membership_authority", { p_membership: membership.id });
    const permissions = new Set<string>(
      ((authority as { permissions?: string[] } | null)?.permissions) ?? []
    );

    return { query, customers, canRecordConsent: permissions.has("customers.manage") };
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
        <CustomerList
          customers={data.customers}
          query={data.query}
          canRecordConsent={data.canRecordConsent}
        />
      )}
    </PageShell>
  );
}
