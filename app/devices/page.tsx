import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import DeviceManager, { type DeviceRow } from "@/components/pos/DeviceManager";
import StaffPinManager, { type StaffRow } from "@/components/pos/StaffPinManager";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// Owner view of registered tills: what is out there, when each last checked
// in, how much is still sitting unsent, and the ability to stop a lost one
// (POS-013, POS-022, HWD-001).

interface PageData {
  businessId: string;
  locationId: string | null;
  devices: DeviceRow[];
  staff: StaffRow[];
}

async function load(): Promise<PageData | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ business_id: string }>(personId);
    if (!membership) return null;

    const { data: location } = await db
      .from("location")
      .select("id")
      .eq("business_id", membership.business_id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    const { data: devices } = await db
      .from("device_registration")
      .select("id, label, status, model, last_sync_at, pending_transaction_count, offline_lease_expires_at, paired_at")
      .eq("business_id", membership.business_id)
      .order("paired_at", { ascending: false, nullsFirst: false });

    // What each till has actually taken today. A card that says a till is
    // selling without saying how much is a status light, not a report.
    const today = new Date().toISOString().slice(0, 10);
    const { data: todaysSales } = await db
      .from("sale")
      .select("device_id, total")
      .eq("business_id", membership.business_id)
      .eq("business_date", today)
      .eq("status", "completed");

    const takings = new Map<string, number>();
    for (const row of todaysSales ?? []) {
      if (!row.device_id) continue;
      takings.set(row.device_id, (takings.get(row.device_id) ?? 0) + Number(row.total));
    }

    // Which tills have somebody behind them right now.
    const { data: openShifts } = await db
      .from("pos_shift")
      .select("device_id")
      .eq("business_id", membership.business_id)
      .eq("status", "open");
    const selling = new Set(
      (openShifts ?? []).map((r) => r.device_id).filter(Boolean) as string[]
    );

    // Who could stand at a till, and whether they can open one yet. A till
    // gates on a PIN, so a business with none has paired hardware it cannot
    // sell from.
    const { data: members } = await db
      .from("business_membership")
      .select("id, staff_pin_hash, person:person_id(full_name), role:role_id(key)")
      .eq("business_id", membership.business_id)
      .eq("status", "active");

    const staff: StaffRow[] = (members ?? [])
      .map((m) => ({
        membershipId: m.id as string,
        displayName:
          (m.person as unknown as { full_name: string } | null)?.full_name ?? "Team member",
        roleKey: (m.role as unknown as { key: string } | null)?.key ?? "cashier",
        hasPin: Boolean(m.staff_pin_hash),
      }))
      .filter((m) => ["owner", "manager", "cashier"].includes(m.roleKey));

    return {
      businessId: membership.business_id,
      locationId: location?.id ?? null,
      staff,
      devices: (devices ?? []).map((d) => ({
        id: d.id,
        label: d.label ?? "Till",
        status: d.status,
        model: d.model,
        lastSyncAt: d.last_sync_at,
        takingsToday: takings.get(d.id) ?? 0,
      selling: selling.has(d.id),
      pendingCount: d.pending_transaction_count ?? 0,
        leaseExpiresAt: d.offline_lease_expires_at,
      })),
    };
  } catch {
    return null;
  }
}

export default async function Devices() {
  const data = await load();

  return (
    <PageShell>
      <PageHeader
        title="Your tills"
        intro="Set up a new till, see which ones are selling, and stop one you no longer trust."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to manage your tills."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <DeviceManager
            businessId={data.businessId}
            locationId={data.locationId}
            devices={data.devices}
          />
          <StaffPinManager businessId={data.businessId} staff={data.staff} />
        </div>
      )}
    </PageShell>
  );
}
