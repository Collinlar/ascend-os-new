import { supabaseServer } from "@/lib/supabase";
import { EmptyState, PageHeader, PageShell } from "@/components/shell/Page";
import { currentPersonId } from "@/lib/auth/session";
import { activeMembership } from "@/lib/auth/active-business";
import AvailabilityEditor, {
  type DaySchedule,
  type TimeOffRow,
} from "@/components/services/AvailabilityEditor";

export const dynamic = "force-dynamic";

// A provider's own working week and time off. Without this page,
// availability had to be seeded directly in the database, which meant no
// real provider could set their own hours.

async function load(): Promise<{
  businessId: string;
  days: DaySchedule[];
  timeOff: TimeOffRow[];
} | null> {
  try {
    const personId = await currentPersonId();
    if (!personId) return null;

    const db = supabaseServer();
    const membership = await activeMembership<{ id: string; business_id: string }>(personId, "id, business_id");
    if (!membership) return null;

    const [availability, timeOff] = await Promise.all([
      db
        .from("staff_availability")
        .select("day_of_week, start_time, end_time")
        .eq("membership_id", membership.id),
      db
        .from("staff_time_off")
        .select("id, starts_at, ends_at, reason")
        .eq("membership_id", membership.id)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at"),
    ]);

    const byDay = new Map(
      (availability.data ?? []).map((a) => [
        a.day_of_week as number,
        { start: a.start_time as string, end: a.end_time as string },
      ])
    );

    const days: DaySchedule[] = Array.from({ length: 7 }, (_, dow) => {
      const existing = byDay.get(dow);
      return {
        dayOfWeek: dow,
        closed: !existing,
        startTime: existing?.start.slice(0, 5) ?? "09:00",
        endTime: existing?.end.slice(0, 5) ?? "17:00",
      };
    });

    return {
      businessId: membership.business_id as string,
      days,
      timeOff: (timeOff.data ?? []).map((t) => ({
        id: t.id,
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        reason: t.reason,
      })),
    };
  } catch {
    return null;
  }
}

export default async function Availability() {
  const data = await load();

  return (
    <PageShell>
      <PageHeader
        title="When you are free"
        intro="Your normal week, and the days you are shut. Customers only ever see times that survive both."
      />

      {data === null ? (
        <EmptyState
          title="Sign in to set your hours."
          detail="We send a code to the WhatsApp number your business is set up with."
        />
      ) : (
        <AvailabilityEditor
          businessId={data.businessId}
          initialDays={data.days}
          initialTimeOff={data.timeOff}
        />
      )}
    </PageShell>
  );
}
