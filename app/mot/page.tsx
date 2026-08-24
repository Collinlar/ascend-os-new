import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { currentPersonId } from "@/lib/auth/session";
import MotReview, { type MotCheck } from "@/components/readiness/MotReview";

export const dynamic = "force-dynamic";

// The MOT: a structured review of operating condition, not a score. It
// answers "what is wrong right now and what should I do", which is a
// different question from "how strong is my record" (RDY-002).

async function load() {
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

    const { data: review } = await db
      .from("mot_review")
      .select("overall, checks, actions, reviewed_at, next_due_at, period_from, period_to")
      .eq("business_id", membership.business_id)
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      hasReview: Boolean(review),
      overall: (review?.overall as string) ?? "pass",
      checks: ((review?.checks ?? []) as MotCheck[]),
      reviewedAt: review?.reviewed_at as string | undefined,
      nextDueAt: review?.next_due_at as string | undefined,
    };
  } catch {
    return null;
  }
}

export default async function Mot() {
  const data = await load();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-14">
        <p className="text-sm font-medium text-teal-dark">Business MOT</p>
        <h1 className="mt-6 max-w-md text-3xl font-semibold leading-display text-ink">
          A check-up on how your business is running
        </h1>
        <p className="mt-3 max-w-lg text-mid-grey">
          This is not your score. Your score says how strong your record is.
          This says what needs fixing right now, and what to do about each
          thing.
        </p>

        {data === null ? (
          <p className="mt-10 text-mid-grey">
            Verify your WhatsApp number to run a check-up.
          </p>
        ) : (
          <MotReview
            hasReview={data.hasReview}
            overall={data.overall}
            checks={data.checks}
            reviewedAt={data.reviewedAt}
            nextDueAt={data.nextDueAt}
          />
        )}

        <p className="mt-12 text-sm text-mid-grey">
          Looking for your Sustainability Score instead?{" "}
          <Link href="/readiness" className="tap font-medium text-teal-dark underline">
            See what your record shows
          </Link>
        </p>
      </div>
    </main>
  );
}
