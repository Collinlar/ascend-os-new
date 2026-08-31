import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import { supabaseServer } from "@/lib/supabase";
import { PageHeader, PageShell } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// The platform's own desk.
//
// Deliberately thin. Everything here is something Ascend does to a
// business rather than for one, so each of them should be easy to find,
// easy to explain, and hard to do by accident.

async function counts() {
  const db = supabaseServer();
  const [appeals, suspended, listed] = await Promise.all([
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended")
      .not("appeal_note", "is", null),
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspended"),
    db
      .from("discover_listing")
      .select("id", { count: "exact", head: true })
      .eq("status", "eligible"),
  ]);
  return {
    appeals: appeals.count ?? 0,
    suspended: suspended.count ?? 0,
    listed: listed.count ?? 0,
  };
}

export default async function Admin() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  const { appeals, suspended, listed } = await counts().catch(() => ({
    appeals: 0,
    suspended: 0,
    listed: 0,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Ascend"
        intro={`Signed in as ${admin.name}, ${admin.role}.`}
      />

      <Link
        href="/admin/discover"
        className="tap block rounded-[18px] border border-line-soft bg-white px-[22px] py-5 shadow-lift"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
              Discover moderation
            </p>
            <p className="mt-1 text-sm font-medium text-slate-grey">
              {listed} listed · {suspended} suspended
            </p>
          </div>
          {appeals > 0 ? (
            <span className="num rounded-full bg-gold-tint px-3 py-1 text-[12.5px] font-extrabold text-gold-ink">
              {appeals} waiting on you
            </span>
          ) : (
            <span className="text-sm font-bold text-teal-dark">Open</span>
          )}
        </div>
      </Link>
    </PageShell>
  );
}
