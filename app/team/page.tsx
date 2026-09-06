import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import TeamDirectory, { type TeamRow } from "@/components/office/TeamDirectory";
import Locations, { type LocationRow } from "@/components/office/Locations";

export const dynamic = "force-dynamic";

// The staff directory. add_team_member and remove_team_member have existed
// since the POS work and have never had a screen of their own: the only way
// to add somebody was through the till's PIN manager, which a merchant
// reaches only if they run a till.

async function load(): Promise<{
  businessId: string;
  team: TeamRow[];
  locations: LocationRow[];
  canManage: boolean;
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ id: string; business_id: string }>(
      personId,
      "id, business_id"
    );
    if (!membership) return null;

    const [{ data }, places, tills, bookings] = await Promise.all([
      db
      .from("business_membership")
      .select("id, status, person:person_id(full_name, phone_e164), role:role_id(key)")
      .eq("business_id", membership.business_id)
      .in("status", ["active", "invited", "suspended"])
      .limit(100),
      db
        .from("location")
        .select("id, name, address, city, active")
        .eq("business_id", membership.business_id)
        .order("name")
        .limit(50),
      // A place with a till or a booking against it is one somebody is
      // actually using, which is worth saying before they close it.
      db
        .from("pos_shift")
        .select("location_id")
        .eq("business_id", membership.business_id)
        .limit(200),
      db
        .from("service_booking")
        .select("location_id")
        .eq("business_id", membership.business_id)
        .limit(200),
    ]);

    const used = new Set<string>();
    for (const row of [...(tills.data ?? []), ...(bookings.data ?? [])]) {
      if (row.location_id) used.add(row.location_id as string);
    }

    const rows: TeamRow[] = (data ?? []).map((m) => {
      const person = m.person as unknown as {
        full_name: string | null;
        phone_e164: string | null;
      } | null;
      return {
        membershipId: m.id,
        name: person?.full_name ?? "A team member",
        phone: person?.phone_e164 ?? null,
        roleKey: (m.role as unknown as { key: string } | null)?.key ?? "staff",
        status: m.status,
        isSelf: m.id === membership.id,
      };
    });

    // Owner first, then manager, then everyone by name. A directory that
    // opens on whoever happened to be inserted first is a list, not an
    // answer to "who works here".
    const rank: Record<string, number> = {
      owner: 0,
      manager: 1,
      accountant: 2,
      cashier: 3,
      staff: 4,
    };
    rows.sort(
      (a, b) =>
        (rank[a.roleKey] ?? 9) - (rank[b.roleKey] ?? 9) || a.name.localeCompare(b.name)
    );

    const me = rows.find((r) => r.isSelf);
    return {
      businessId: membership.business_id,
      team: rows,
      locations: (places.data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        address: l.address,
        city: l.city,
        active: l.active,
        inUse: used.has(l.id),
      })),
      // The same rule the API enforces. This only decides whether to offer
      // the action; the server decides whether to allow it.
      canManage: me?.roleKey === "owner" || me?.roleKey === "manager",
    };
  } catch {
    return null;
  }
}

export default async function Team() {
  const data = await load();

  return (
    <PageShell>
      <PageHeader
        title="Your team"
        intro="Everyone who works here, and what each of them is allowed to do. Their hours, sales and approvals all count toward what your business can show a lender."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to see your team."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <>
          <TeamDirectory
            businessId={data.businessId}
            team={data.team}
            canManage={data.canManage}
          />
          <Locations locations={data.locations} canManage={data.canManage} />
        </>
      )}
    </PageShell>
  );
}
