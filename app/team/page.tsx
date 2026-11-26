import { ModulePage } from "@/components/shell/Module";
import Link from "next/link";
import { MODULES, currentCapabilities, officeTabs } from "@/lib/nav/modules";
import { primaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";
import { officeModules } from "@/lib/office/access";
import { loadAttendance } from "@/lib/office/load";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import {EmptyState} from "@/components/shell/Page";
import TeamDirectory, { type TeamRow } from "@/components/office/TeamDirectory";
import Locations, { type LocationRow } from "@/components/office/Locations";
import { checkPageAccess } from "@/lib/authority/page";

export const dynamic = "force-dynamic";

// The staff directory. add_team_member and remove_team_member have existed
// since the POS work and have never had a screen of their own: the only way
// to add somebody was through the till's PIN manager, which a merchant
// reaches only if they run a till.

async function load(): Promise<{
  businessId: string;
  figures: { inNow: number; onLeave: number; leaveWaiting: number; attendance: boolean };
  roles: Array<{ key: string; count: number }>;
  team: TeamRow[];
  locations: LocationRow[];
  canManage: boolean;
  isOwner: boolean;
  canManageLocations: boolean;
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

    const [{ data }, places, tills, bookings, authority] = await Promise.all([
      db
      .from("business_membership")
      .select("id, status, location_scope, person:person_id(full_name, phone_e164), role:role_id(key)")
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
      // What this member may actually do: role plus live delegations, the
      // same answer the server's permission check uses.
      db.rpc("membership_authority", { p_membership: membership.id }),
    ]);
    const permissions = new Set<string>(
      ((authority.data as { permissions?: string[] } | null)?.permissions) ?? []
    );

    // Who is in, who is away, and the week, when the business keeps hours.
    const caps = await currentCapabilities();
    const keepsHours = officeModules(caps).attendance;
    const [attendance, leaveWaiting] = await Promise.all([
      keepsHours ? loadAttendance(membership.business_id).catch(() => null) : Promise.resolve(null),
      db
        .from("approval_request")
        .select("id", { count: "exact", head: true })
        .eq("business_id", membership.business_id)
        .eq("kind", "leave")
        .eq("status", "requested"),
    ]);
    const placeName = new Map((places.data ?? []).map((l) => [l.id as string, l.name as string]));
    const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });
    const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" });
    const placesOf = (scope: string[] | null): string | undefined => {
      if (!scope || scope.length === 0) return (places.data ?? []).length > 1 ? "Every place" : undefined;
      return scope.map((id) => placeName.get(id) ?? "A closed place").join(", ");
    };
    const todayOf = (id: string): Pick<TeamRow, "today" | "week"> => {
      if (!attendance) return {};
      const a = attendance.get(id);
      return {
        today: a?.inSince
          ? { text: `In since ${clock(a.inSince)}`, tone: "ok" }
          : a?.onLeaveUntil
            ? { text: `Off until ${shortDay(a.onLeaveUntil)}`, tone: "info" }
            : { text: "Not in", tone: "mute" },
        week: a && a.daysThisWeek > 0 ? `${a.daysThisWeek} day${a.daysThisWeek === 1 ? "" : "s"}, ${a.hoursThisWeek} hrs` : "Not in yet",
      };
    };

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
        places: placesOf((m as unknown as { location_scope: string[] | null }).location_scope),
        ...todayOf(m.id as string),
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
    const active = rows.filter((r) => r.status === "active");
    const roleCount = new Map<string, number>();
    for (const r of active) roleCount.set(r.roleKey, (roleCount.get(r.roleKey) ?? 0) + 1);
    return {
      businessId: membership.business_id,
      figures: {
        attendance: Boolean(attendance),
        inNow: attendance ? active.filter((r) => attendance.get(r.membershipId)?.inSince).length : 0,
        onLeave: attendance ? active.filter((r) => attendance.get(r.membershipId)?.onLeaveUntil).length : 0,
        leaveWaiting: leaveWaiting.count ?? 0,
      },
      roles: ["owner", "manager", "accountant", "cashier", "staff"]
        .filter((k) => roleCount.has(k))
        .map((k) => ({ key: k, count: roleCount.get(k) ?? 0 })),
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
      isOwner: me?.roleKey === "owner",
      // Where the business trades from is a business setting: the owner's,
      // unless they have delegated it. The database refuses anyone else
      // (0079), so the controls are only offered to someone who holds it.
      canManageLocations: permissions.has("business.settings"),
    };
  } catch {
    return null;
  }
}

const ROLE_PLURAL: Record<string, string> = {
  owner: "Owner",
  manager: "Managers",
  accountant: "Accountants",
  cashier: "Cashiers",
  staff: "Staff",
};

export default async function Team({ searchParams }: { searchParams: { add?: string } }) {
  // Phase 1 authority check: records what it decides here, and acts on it
  // only once this page's group is enforced (lib/authority/enforce.ts).
  await checkPageAccess("/team");

  const data = await load();
  const caps = await currentCapabilities();
  const active = data ? data.team.filter((m) => m.status === "active") : [];
  const placesOpen = data ? data.locations.filter((l) => l.active).length : 0;
  const lacksTeamPass = Boolean(data?.isOwner) && !caps.has("office.work");

  return (
    <ModulePage
      identity={MODULES.office}
      title="People"
      tabs={officeTabs(caps, "/team", { runsThePlace: true })}
      action={
        data?.canManage ? (
          <Link href="/team?add=1" className={primaryAction}>
            <Icon name="plus" size={16} />
            Add someone
          </Link>
        ) : undefined
      }
    >
      {data === null ? (
        <EmptyState
          title="Sign in to see your team."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label="On the team"
              value={`${active.length} ${active.length === 1 ? "person" : "people"}`}
              sub={placesOpen > 1 ? `Across ${placesOpen} places` : "One place"}
            />
            {data.figures.attendance && (
              <>
                <Figure label="Checked in now" value={String(data.figures.inNow)} sub={data.figures.inNow ? "On the clock" : "Nobody yet today"} />
                <Figure label="On time off" value={String(data.figures.onLeave)} sub={data.figures.onLeave ? "Agreed, today" : "Everyone is available"} />
              </>
            )}
            <Figure
              label="Time off asked for"
              value={data.figures.leaveWaiting ? `${data.figures.leaveWaiting} waiting` : "None"}
              sub={data.figures.leaveWaiting ? "Decide it in Approvals" : "Nothing to decide"}
              href={data.figures.leaveWaiting ? "/work/approvals" : undefined}
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-4">
              <TeamDirectory
                businessId={data.businessId}
                team={data.team}
                canManage={data.canManage}
                isOwner={data.isOwner}
                startAdding={searchParams.add === "1"}
              />
              <Locations locations={data.locations} canManage={data.canManageLocations} />
            </div>
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2.5 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <h2 className="font-heading text-base font-bold text-ink-heading">Roles</h2>
                {data.roles.map((r) => (
                  <span key={r.key} className="flex items-center justify-between text-[13.5px]">
                    <span className="text-ink">{ROLE_PLURAL[r.key] ?? r.key}</span>
                    <span className="num font-semibold text-neutral-600">{r.count}</span>
                  </span>
                ))}
                <span className="text-xs leading-relaxed text-neutral-600">
                  An accountant reads the books and changes nothing. For an accountant outside the business, share your records from Sharing instead.
                </span>
              </section>
              {data.figures.attendance && (
                <section className="flex flex-col gap-2 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                  <h2 className="font-heading text-base font-bold text-ink-heading">Hours</h2>
                  <span className="text-[13px] leading-relaxed text-neutral-700">
                    Staff check in on the till when they open a shift, or from Office on their phone. The last 7 days count finished shifts only.
                  </span>
                </section>
              )}
              {lacksTeamPass && (
                <div className="flex flex-col gap-2 rounded-[20px] border border-gold-500/40 bg-gradient-to-br from-gold-100 to-white px-[18px] py-4">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-gold-700">
                    <Icon name="team" size={16} />
                    Office Team Pass
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-neutral-700">
                    Time off, spending approvals and jobs for the whole team, paid for a year. From GHS 600 for up to 5 people.
                  </span>
                  <Link href="/billing" className="tap flex min-h-[40px] items-center gap-1 self-start text-[13px] font-bold text-gold-700">
                    See the Team Pass
                    <Icon name="chev" size={15} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ModulePage>
  );
}

function Figure({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const body = (
    <>
      <span className="text-[12.5px] text-neutral-600">{label}</span>
      <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{value}</span>
      <span className="text-xs text-neutral-600">{sub}</span>
    </>
  );
  return href ? (
    <Link href={href} className="tap flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5 hover:border-teal-brand">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">{body}</div>
  );
}
