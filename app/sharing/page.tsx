import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import ShareManager, { type ShareRow } from "@/components/sharing/ShareManager";

export const dynamic = "force-dynamic";

// Who can see the business's record, what they can see, and every time they
// looked. Consent is only meaningful if the business can inspect and end it
// (INS-005, RDY-015).

async function load(): Promise<{ isOwner: boolean; shares: ShareRow[] } | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ id: string; business_id: string; role: { key: string } | null }>(personId, "id, business_id, role:role_id(key)");
    if (!membership) return null;

    const isOwner =
      (membership.role as unknown as { key: string } | null)?.key === "owner";

    const { data: shares } = await db
      .from("report_share")
      .select("id, report_kind, authorized_fields, purpose, status, granted_at, expires_at, revoked_at")
      .eq("business_id", membership.business_id)
      .order("granted_at", { ascending: false })
      .limit(20);

    // How often each share has actually been read.
    const shareIds = (shares ?? []).map((s) => s.id as string);
    const accessCounts = new Map<string, { count: number; last: string | null }>();
    if (shareIds.length > 0) {
      const { data: logs } = await db
        .from("report_access_log")
        .select("share_id, accessed_at")
        .in("share_id", shareIds);
      for (const log of logs ?? []) {
        const existing = accessCounts.get(log.share_id as string) ?? {
          count: 0,
          last: null,
        };
        const at = log.accessed_at as string;
        accessCounts.set(log.share_id as string, {
          count: existing.count + 1,
          last: !existing.last || at > existing.last ? at : existing.last,
        });
      }
    }

    return {
      isOwner,
      shares: (shares ?? []).map((s) => {
        const access = accessCounts.get(s.id as string);
        return {
          id: s.id,
          purpose: s.purpose,
          fields: (s.authorized_fields ?? []) as string[],
          status: s.status,
          grantedAt: s.granted_at,
          expiresAt: s.expires_at,
          viewCount: access?.count ?? 0,
          lastViewedAt: access?.last ?? null,
        };
      }),
    };
  } catch {
    return null;
  }
}

export default async function Sharing() {
  const data = await load();

  return (
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">Who can see your record</h1>
          <p className="text-sm text-mid-grey">
            You choose what to share, with whom, and for how long. You can stop
            any of it at any moment.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {data === null ? (
          <p className="py-16 text-center text-mid-grey">
            Verify your WhatsApp number to manage sharing.
          </p>
        ) : !data.isOwner ? (
          <p className="border border-line bg-white px-5 py-6 text-sm text-mid-grey">
            Only the owner can share the business record.
          </p>
        ) : (
          <ShareManager shares={data.shares} />
        )}
      </div>
    </main>
  );
}
