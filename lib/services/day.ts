import "server-only";

import { supabaseServer } from "@/lib/supabase";

// The Services day (Modules M4): one column per person, every booking on it
// where it sits in the day, the time they are away, and beside it what needs
// the owner: requests to answer and deposits still to come in. Ghana keeps
// GMT all year, so Accra's day is the UTC day.

export interface DayBooking {
  id: string;
  start: string;
  end: string | null;
  status: string;
  customer: string;
  customerPhone: string | null;
  service: string;
  price: number | null;
  depositRequired: number;
  depositPaid: number;
  providerId: string | null;
  placeName: string | null;
  serviceAddress: string | null;
}

/** Where a booking stands, as the schedule colours it. */
export type DayTone = "paid" | "awaiting" | "done" | "no_show" | "cancelled" | "booked" | "requested";

export function toneOf(b: Pick<DayBooking, "status" | "depositRequired" | "depositPaid">): DayTone {
  if (b.status === "completed") return "done";
  if (b.status === "no_show") return "no_show";
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "requested" || b.status === "quoted") return "requested";
  if (b.depositRequired > 0.005) return b.depositPaid + 0.005 >= b.depositRequired ? "paid" : "awaiting";
  return "booked";
}

export interface DayColumn {
  membershipId: string | null;
  name: string;
  bookings: DayBooking[];
  away: Array<{ from: string; to: string }>;
}

export interface ServicesDay {
  day: string;
  columns: DayColumn[];
  figures: { bookings: number; depositsIn: number; bookedValue: number; noShows: number };
  requests: Array<{ id: string; start: string | null; customer: string; service: string; status: string; price: number | null; address: string | null }>;
  deposits: Array<{ id: string; start: string; customer: string; phone: string | null; owed: number; service: string }>;
  businessName: string;
}

export async function loadServicesDay(businessId: string, day: string): Promise<ServicesDay> {
  const db = supabaseServer();
  const from = `${day}T00:00:00Z`;
  const to = new Date(new Date(from).getTime() + 864e5).toISOString();
  const nowIso = new Date().toISOString();
  const cols =
    "id, status, scheduled_start, scheduled_end, price_quoted, deposit_required, deposit_paid, assigned_membership_id, service_address, customer:customer_id(display_name, phone_e164), item:item_id(name), location:location_id(name)";

  const [dayRows, members, away, requests, owing, business] = await Promise.all([
    db.from("service_booking").select(cols).eq("business_id", businessId).gte("scheduled_start", from).lt("scheduled_start", to).order("scheduled_start"),
    db.from("business_membership").select("id, person:person_id(full_name), role:role_id(key)").eq("business_id", businessId).eq("status", "active"),
    db.from("staff_time_off").select("membership_id, starts_at, ends_at").eq("business_id", businessId).eq("status", "approved").lt("starts_at", to).gt("ends_at", from),
    db.from("service_booking").select(cols).eq("business_id", businessId).in("status", ["requested", "quoted"]).order("scheduled_start", { ascending: true, nullsFirst: false }).limit(20),
    db
      .from("service_booking")
      .select(cols)
      .eq("business_id", businessId)
      .in("status", ["requested", "quoted", "confirmed"])
      .gt("deposit_required", 0)
      .gte("scheduled_start", nowIso)
      .order("scheduled_start")
      .limit(40),
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
  ]);

  const toBooking = (b: Record<string, unknown>): DayBooking => {
    const c = b.customer as { display_name: string | null; phone_e164: string | null } | null;
    return {
      id: b.id as string,
      start: b.scheduled_start as string,
      end: (b.scheduled_end as string | null) ?? null,
      status: b.status as string,
      customer: c?.display_name ?? "A customer",
      customerPhone: c?.phone_e164 ?? null,
      service: (b.item as { name: string } | null)?.name ?? "A service",
      price: b.price_quoted === null ? null : Number(b.price_quoted),
      depositRequired: Number(b.deposit_required ?? 0),
      depositPaid: Number(b.deposit_paid ?? 0),
      providerId: (b.assigned_membership_id as string | null) ?? null,
      placeName: (b.location as { name: string } | null)?.name ?? null,
      serviceAddress: (b.service_address as string | null) ?? null,
    };
  };
  const bookings = (dayRows.data ?? []).map((b) => toBooking(b as Record<string, unknown>));

  // A column for everyone with something that day, then anyone who is away,
  // and one for work nobody has been given yet.
  const name = new Map<string, string>();
  for (const m of members.data ?? []) name.set(m.id as string, (m.person as unknown as { full_name: string } | null)?.full_name ?? "A team member");
  const ids = new Set<string>();
  for (const b of bookings) if (b.providerId) ids.add(b.providerId);
  for (const a of away.data ?? []) ids.add(a.membership_id as string);
  // A business with one person gets their column even on an empty day.
  if (ids.size === 0 && (members.data ?? []).length === 1) ids.add(members.data![0].id as string);
  const columns: DayColumn[] = Array.from(ids)
    .map((id) => ({
      membershipId: id,
      name: name.get(id) ?? "A team member",
      bookings: bookings.filter((b) => b.providerId === id),
      away: (away.data ?? []).filter((a) => a.membership_id === id).map((a) => ({ from: a.starts_at as string, to: a.ends_at as string })),
    }))
    .sort((a, b) => b.bookings.length - a.bookings.length || a.name.localeCompare(b.name));
  const nobody = bookings.filter((b) => !b.providerId);
  if (nobody.length > 0) columns.push({ membershipId: null, name: "Not given to anyone", bookings: nobody, away: [] });

  const live = bookings.filter((b) => b.status !== "cancelled");
  return {
    day,
    columns,
    figures: {
      bookings: live.filter((b) => b.status !== "no_show").length,
      depositsIn: live.reduce((n, b) => n + b.depositPaid, 0),
      bookedValue: live.filter((b) => b.status !== "no_show").reduce((n, b) => n + (b.price ?? 0), 0),
      noShows: bookings.filter((b) => b.status === "no_show").length,
    },
    requests: (requests.data ?? []).map((r) => {
      const b = toBooking(r as Record<string, unknown>);
      return { id: b.id, start: (r.scheduled_start as string | null) ?? null, customer: b.customer, service: b.service, status: b.status, price: b.price, address: b.serviceAddress };
    }),
    deposits: (owing.data ?? [])
      .map((r) => toBooking(r as Record<string, unknown>))
      .filter((b) => b.depositRequired - b.depositPaid > 0.005)
      .map((b) => ({ id: b.id, start: b.start, customer: b.customer, phone: b.customerPhone, owed: b.depositRequired - b.depositPaid, service: b.service })),
    businessName: (business.data?.name as string | undefined) ?? "us",
  };
}
