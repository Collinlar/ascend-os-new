import "server-only";

import { supabaseServer } from "@/lib/supabase";

// Today's schedule and the days after it (Office PRD 25).
//
// Deliberately one list rather than a grid. A merchant asking "what is
// happening this week" wants bookings, absences, job deadlines and due work
// interleaved in date order, not four calendars to reconcile in their head.
// A month grid on a 375px screen shows numbers, not answers.
//
// Everything here already exists in another product set. Office does not
// own any of it; it is the one place they can be seen together, which is
// the whole argument for the set.

export type ScheduleKind = "booking" | "leave" | "job" | "task";

export interface ScheduleEntry {
  id: string;
  kind: ScheduleKind;
  at: string;
  /** Set for things with a real clock time, not just a date. */
  timed: boolean;
  title: string;
  who: string | null;
}

const DAYS_AHEAD = 14;

export async function loadSchedule(businessId: string): Promise<ScheduleEntry[]> {
  const db = supabaseServer();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const until = new Date(from.getTime() + DAYS_AHEAD * 864e5);
  const fromIso = from.toISOString();
  const untilIso = until.toISOString();

  const [bookings, leave, jobs, tasks] = await Promise.all([
    db
      .from("service_booking")
      .select("id, scheduled_start, status, item:item_id(name), customer:customer_id(display_name), provider:assigned_membership_id(person:person_id(full_name))")
      .eq("business_id", businessId)
      .gte("scheduled_start", fromIso)
      .lte("scheduled_start", untilIso)
      .not("status", "in", "(cancelled,no_show)")
      .order("scheduled_start")
      .limit(60),
    // Absences are only worth showing once somebody has agreed them.
    db
      .from("staff_time_off")
      .select("id, starts_at, ends_at, status, membership:membership_id(person:person_id(full_name))")
      .eq("business_id", businessId)
      .eq("status", "approved")
      .lte("starts_at", untilIso)
      .gte("ends_at", fromIso)
      .limit(40),
    db
      .from("project")
      .select("id, name, due_on, status")
      .eq("business_id", businessId)
      .eq("status", "active")
      .not("due_on", "is", null)
      .gte("due_on", fromIso.slice(0, 10))
      .lte("due_on", untilIso.slice(0, 10))
      .limit(40),
    db
      .from("task")
      .select("id, title, due_at, assignee:assigned_membership_id(person:person_id(full_name))")
      .eq("business_id", businessId)
      .in("status", ["open", "in_progress", "blocked"])
      .not("due_at", "is", null)
      .gte("due_at", fromIso)
      .lte("due_at", untilIso)
      .order("due_at")
      .limit(60),
  ]);

  const name = (row: unknown): string | null =>
    (row as { person?: { full_name?: string | null } | null } | null)?.person
      ?.full_name ?? null;

  const entries: ScheduleEntry[] = [
    ...(bookings.data ?? []).map((b) => ({
      id: `booking:${b.id}`,
      kind: "booking" as const,
      at: b.scheduled_start as string,
      timed: true,
      title:
        (b.item as unknown as { name: string } | null)?.name ?? "A booking",
      who:
        (b.customer as unknown as { display_name: string } | null)
          ?.display_name ?? name(b.provider),
    })),
    ...(leave.data ?? []).map((l) => ({
      id: `leave:${l.id}`,
      kind: "leave" as const,
      // Shown on the day it starts, or today if it started before.
      at: (l.starts_at as string) < fromIso ? fromIso : (l.starts_at as string),
      timed: false,
      title: "Off work",
      who: name(l.membership),
    })),
    ...(jobs.data ?? []).map((p) => ({
      id: `job:${p.id}`,
      kind: "job" as const,
      at: `${p.due_on}T23:59:00.000Z`,
      timed: false,
      title: `${p.name} due`,
      who: null,
    })),
    ...(tasks.data ?? []).map((t) => ({
      id: `task:${t.id}`,
      kind: "task" as const,
      at: t.due_at as string,
      timed: true,
      title: t.title as string,
      who: name(t.assignee),
    })),
  ];

  return entries.sort((a, b) => (a.at < b.at ? -1 : 1));
}
