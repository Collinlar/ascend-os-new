import "server-only";

import { supabaseServer } from "@/lib/supabase";

// One booking (Modules M4): who, when, with whom, where and for how much;
// how it has gone so far, read from its own events and payments; the money;
// and the customer behind it, from the one customer record.

export interface BookingDetail {
  id: string;
  status: string;
  model: string;
  start: string | null;
  end: string | null;
  createdAt: string;
  price: number | null;
  depositRequired: number;
  depositPaid: number;
  holdExpiresAt: string | null;
  providerId: string | null;
  providerName: string | null;
  placeName: string | null;
  serviceAddress: string | null;
  notes: string | null;
  cancellationReason: string | null;
  service: { name: string; durationMinutes: number | null };
  customer: { id: string | null; name: string; phone: string | null; email: string | null };
  /** This customer's visits with the business, counting this one. */
  visitNumber: number;
  crm: { spent: number; owed: number; bookings: number; lastSeen: string | null } | null;
  payments: Array<{ id: string; amount: number; method: string; at: string; verification: string; status: string }>;
  flow: Array<{ id: string; at: string; title: string; detail?: string; tone: "teal" | "ok" | "warn" | "bad" | "info" | "mute" }>;
  team: Array<{ membershipId: string; name: string }>;
  businessName: string;
}

const METHOD: Record<string, string> = { cash: "Cash", mobile_money: "Mobile Money", card: "Card", bank_transfer: "Bank transfer", payment_link: "Pay link" };

export async function loadBooking(businessId: string, id: string): Promise<BookingDetail | null> {
  const db = supabaseServer();
  const { data: b } = await db
    .from("service_booking")
    .select(
      "id, status, model, scheduled_start, scheduled_end, created_at, price_quoted, deposit_required, deposit_paid, hold_expires_at, assigned_membership_id, service_address, staff_notes, cancellation_reason, no_show_at, customer_id, customer:customer_id(display_name, phone_e164, email), item:item_id(name, service_attributes), location:location_id(name), provider:assigned_membership_id(person:person_id(full_name))"
    )
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!b) return null;

  const customer = b.customer as unknown as { display_name: string | null; phone_e164: string | null; email: string | null } | null;
  const item = b.item as unknown as { name: string; service_attributes: Record<string, unknown> | null } | null;
  const customerId = (b.customer_id as string | null) ?? null;

  const [payments, events, members, visits, crm, business] = await Promise.all([
    db
      .from("payment")
      .select("id, amount, method, occurred_at, verification, status, reversal_of")
      .eq("business_id", businessId)
      .eq("source_entity_type", "service_booking")
      .eq("source_entity_id", id)
      .order("occurred_at"),
    db
      .from("event_outbox")
      .select("event_type, occurred_at, payload, actor:actor_membership_id(person:person_id(full_name))")
      .eq("business_id", businessId)
      .eq("entity_type", "service_booking")
      .eq("entity_id", id)
      .order("occurred_at"),
    db.from("business_membership").select("id, person:person_id(full_name)").eq("business_id", businessId).eq("status", "active"),
    customerId
      ? db
          .from("service_booking")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("customer_id", customerId)
          .not("status", "in", "(cancelled)")
          .lte("created_at", b.created_at as string)
      : Promise.resolve({ count: 1 }),
    customerId ? db.rpc("business_customers", { p_business: businessId, p_query: customer?.phone_e164 ?? customer?.display_name ?? null }) : Promise.resolve({ data: null }),
    db.from("business").select("name").eq("id", businessId).maybeSingle(),
  ]);

  const me = ((crm.data ?? []) as Array<{ id: string; spent: number | string; owed: number | string; bookings: number; last_seen: string | null }>).find((c) => c.id === customerId);
  const pays = (payments.data ?? [])
    .filter((p) => !p.reversal_of)
    .map((p) => ({
      id: p.id as string,
      amount: Number(p.amount),
      method: METHOD[p.method as string] ?? (p.method as string),
      at: p.occurred_at as string,
      verification: p.verification as string,
      status: p.status as string,
    }));

  // How it has gone: asked for, paid, confirmed, started, done, from the
  // booking's own events and payments.
  const flow: BookingDetail["flow"] = [{ id: "made", at: b.created_at as string, title: b.status === "requested" ? "Asked to book" : "Booked", tone: "teal" }];
  for (const e of events.data ?? []) {
    const who = (e.actor as unknown as { person: { full_name: string } | null } | null)?.person?.full_name;
    const to = (e.payload as Record<string, unknown> | null)?.to_status as string | undefined;
    const t = e.event_type as string;
    const title =
      t === "services.booking.confirmed"
        ? "Confirmed"
        : t === "services.booking.completed"
          ? "Done"
          : t === "services.booking.no_show"
            ? "Did not come"
            : to === "in_progress"
              ? "Started"
              : to === "cancelled"
                ? "Cancelled"
                : to === "quoted"
                  ? "Price sent"
                  : t === "services.booking.requested" || t === "services.booking.created"
                    ? null
                    : null;
    if (!title) continue;
    flow.push({
      id: `${t}:${e.occurred_at}`,
      at: e.occurred_at as string,
      title,
      detail: [who ? `by ${who}` : null, to === "cancelled" && b.cancellation_reason ? `"${b.cancellation_reason}"` : null].filter(Boolean).join(", ") || undefined,
      tone: title === "Did not come" || title === "Cancelled" ? "bad" : title === "Done" ? "ok" : "teal",
    });
  }
  for (const p of pays) {
    flow.push({
      id: `pay:${p.id}`,
      at: p.at,
      title: `GHS ${p.amount.toFixed(2)} paid by ${p.method}`,
      detail: p.verification === "provider_confirmed" ? "Confirmed by the provider" : "Recorded by the business",
      tone: "ok",
    });
  }
  flow.sort((x, y) => (x.at < y.at ? -1 : 1));

  return {
    id: b.id as string,
    status: b.status as string,
    model: b.model as string,
    start: (b.scheduled_start as string | null) ?? null,
    end: (b.scheduled_end as string | null) ?? null,
    createdAt: b.created_at as string,
    price: b.price_quoted === null ? null : Number(b.price_quoted),
    depositRequired: Number(b.deposit_required ?? 0),
    depositPaid: Number(b.deposit_paid ?? 0),
    holdExpiresAt: (b.hold_expires_at as string | null) ?? null,
    providerId: (b.assigned_membership_id as string | null) ?? null,
    providerName: (b.provider as unknown as { person: { full_name: string } | null } | null)?.person?.full_name ?? null,
    placeName: (b.location as unknown as { name: string } | null)?.name ?? null,
    serviceAddress: (b.service_address as string | null) ?? null,
    notes: (b.staff_notes as string | null) ?? null,
    cancellationReason: (b.cancellation_reason as string | null) ?? null,
    service: {
      name: item?.name ?? "A service",
      durationMinutes: item?.service_attributes?.duration_minutes ? Number(item.service_attributes.duration_minutes) : null,
    },
    customer: { id: customerId, name: customer?.display_name ?? "A customer", phone: customer?.phone_e164 ?? null, email: customer?.email ?? null },
    visitNumber: Math.max(1, Number((visits as { count: number | null }).count ?? 1)),
    crm: me ? { spent: Number(me.spent ?? 0), owed: Number(me.owed ?? 0), bookings: Number(me.bookings ?? 0), lastSeen: me.last_seen } : null,
    payments: pays,
    flow,
    team: (members.data ?? []).map((m) => ({ membershipId: m.id as string, name: (m.person as unknown as { full_name: string } | null)?.full_name ?? "A team member" })),
    businessName: (business.data?.name as string | undefined) ?? "us",
  };
}
