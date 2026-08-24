import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import DeviceManager, { type DeviceRow } from "@/components/pos/DeviceManager";
import StaffPinManager, { type StaffRow } from "@/components/pos/StaffPinManager";

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
    const { data: membership } = await db
      .from("business_membership")
      .select("business_id")
      .eq("person_id", personId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
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
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Your tills</h1>
          <p className="text-sm text-mid-grey">
            Set up a new till, see which ones are selling, and stop one you no
            longer trust.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to manage your tills.
          </p>
        ) : (
          <>
            <DeviceManager
              businessId={data.businessId}
              locationId={data.locationId}
              devices={data.devices}
            />
            <StaffPinManager businessId={data.businessId} staff={data.staff} />
          </>
        )}
      </div>
    </main>
  );
}
