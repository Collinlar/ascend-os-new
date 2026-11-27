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
  /** Round 4, S2: who cancelled, a deposit to return, their rating. */
  /** Round 4, S3: a class's seats, travel, a quotation request and its quotation. */
  kind: {
    model: string;
    seats: number;
    travelFee: number | null;
    request: { occasion: string; date: string | null; people: string; where: string; needs: string[]; note: string; photos: string[] } | null;
    quotation: { id: string; number: string | null; status: string; total: number } | null;
  } | null;
  care: {
    cancelledBy: string | null;
    depositToReturn: number | null;
    depositReturned: boolean;
    returnedHow: string | null;
    rating: { stars: number; comment: string | null } | null;
  } | null;
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
      .select("event_type, occurred_at, payload, actor_membership_id")
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
    // No foreign key on the event's actor, so the name comes from the team.
    const who = (members.data ?? []).find((m) => m.id === e.actor_membership_id)?.person as unknown as { full_name: string } | null | undefined;
    const payload = (e.payload as Record<string, unknown> | null) ?? {};
    const to = (payload.to ?? payload.to_status) as string | undefined;
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
    if (t === "services.booking.rescheduled") {
      flow.push({ id: `${t}:${e.occurred_at}`, at: e.occurred_at as string, title: "Moved by the customer", detail: payload.from ? `was ${new Date(payload.from as string).toLocaleString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : undefined, tone: "info" });
      continue;
    }
    if (t === "services.booking.deposit_returned") {
      flow.push({ id: `${t}:${e.occurred_at}`, at: e.occurred_at as string, title: `Deposit of GHS ${Number(payload.amount ?? 0).toFixed(2)} returned`, detail: who?.full_name ? `by ${who.full_name}` : undefined, tone: "mute" });
      continue;
    }
    if (!title) continue;
    flow.push({
      id: `${t}:${e.occurred_at}`,
      at: e.occurred_at as string,
      title,
      detail: [payload.by === "customer" ? "by the customer" : who?.full_name ? `by ${who.full_name}` : null, to === "cancelled" && b.cancellation_reason ? `"${b.cancellation_reason}"` : null].filter(Boolean).join(", ") || undefined,
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
    kind: await (async () => {
      const { data: k, error } = await db.from("service_booking").select("model, seats, travel_fee, request_detail, quotation:quotation_document_id(id, number, status, total)").eq("id", id).maybeSingle();
      if (error || !k) return null;
      const d = (k.request_detail ?? null) as Record<string, unknown> | null;
      const paths = Array.isArray(d?.photos) ? (d!.photos as Array<{ path: string }>).map((p) => p.path).filter(Boolean) : [];
      const signed = paths.length ? ((await db.storage.from("reports").createSignedUrls(paths, 600)).data ?? []).map((x) => x.signedUrl).filter((u): u is string => Boolean(u)) : [];
      const q = k.quotation as unknown as { id: string; number: string | null; status: string; total: number } | null;
      return {
        model: k.model as string,
        seats: Number(k.seats ?? 1),
        travelFee: k.travel_fee === null ? null : Number(k.travel_fee),
        request: d
          ? {
              occasion: String(d.occasion ?? ""),
              date: (d.date as string) ?? null,
              people: String(d.people ?? ""),
              where: String(d.where ?? ""),
              needs: Array.isArray(d.needs) ? (d.needs as string[]) : [],
              note: String(d.note ?? ""),
              photos: signed,
            }
          : null,
        quotation: q ? { id: q.id, number: q.number, status: q.status, total: Number(q.total ?? 0) } : null,
      };
    })(),
    care: await (async () => {
      // Before 0151 these are not there.
      const [c, r] = await Promise.all([
        db.from("service_booking").select("cancelled_by, deposit_to_return, deposit_returned_at, deposit_return_method").eq("id", id).maybeSingle(),
        db.from("booking_rating").select("stars, comment").eq("booking_id", id).maybeSingle(),
      ]);
      if (c.error) return null;
      const row = (c.data ?? {}) as Record<string, unknown>;
      return {
        cancelledBy: (row.cancelled_by as string) ?? null,
        depositToReturn: row.deposit_to_return === null || row.deposit_to_return === undefined ? null : Number(row.deposit_to_return),
        depositReturned: Boolean(row.deposit_returned_at),
        returnedHow: (row.deposit_return_method as string) ?? null,
        rating: r.error || !r.data ? null : { stars: Number(r.data.stars), comment: (r.data.comment as string) ?? null },
      };
    })(),
    flow,
    team: (members.data ?? []).map((m) => ({ membershipId: m.id as string, name: (m.person as unknown as { full_name: string } | null)?.full_name ?? "A team member" })),
    businessName: (business.data?.name as string | undefined) ?? "us",
  };
}
