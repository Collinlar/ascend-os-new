import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import CustomerList, { type CustomerRow } from "@/components/customers/CustomerList";

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

    return {
      query,
      customers: ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
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
      })),
    };
  } catch {
    return null;
  }
}

export default async function Customers({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
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
