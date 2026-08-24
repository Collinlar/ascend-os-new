// Business event contracts and the outbox publisher (Master PRD §13).
// Every meaningful business change produces a standard event (EVT-001).
// Events are written in the same transaction as the domain change wherever
// the domain service is a Postgres function; this helper covers TS-side
// domain services that already hold a committed record.

import { supabaseServer } from "@/lib/supabase";
import type { Channel, ProductSetKey, UUID } from "./types";

// Governed event naming: {product_set}.{entity}.{action} (ANA-011)
export type BusinessEventType =
  | "business.created"
  | "business.product_set.enabled"
  | "pos.sale.completed"
  | "pos.sale.reversed"
  | "pos.refund.requested"
  | "pos.sales.unaccounted"
  | "pos.sequence.regressed"
  | "catalogue.barcode.attached"
  | "pos.shift.opened"
  | "pos.shift.closed"
  | "shop.order.placed"
  | "shop.order.progressed"
  | "shop.order.fulfilled"
  | "shop.order.cancelled"
  | "shop.order.refunded"
  | "shop.catalogue.published"
  | "services.booking.requested"
  | "services.booking.progressed"
  | "services.booking.confirmed"
  | "services.booking.completed"
  | "services.booking.no_show"
  | "documents.document.issued"
  | "documents.document.accepted"
  | "documents.document.paid"
  | "finance.payment.confirmed"
  | "finance.payment.refunded"
  | "inventory.movement.recorded"
  | "office.task.completed"
  | "office.expense.submitted"
  | "office.approval.decided"
  | "office.attendance.recorded"
  | "commercial.entitlement.activated"
  | "commercial.balance.deducted"
  | "discover.promotion.purchased"
  | "readiness.report.shared"
  | "readiness.mot.completed";

export interface BusinessEvent {
  eventType: BusinessEventType;
  businessId: UUID;
  locationId?: UUID;
  actorMembershipId?: UUID;
  channel: Channel;
  productSet: ProductSetKey;
  entityType: string;
  entityId: UUID;
  amount?: number;
  currencyCode?: string;
  verification?: "merchant_declared" | "customer_confirmed" | "provider_confirmed";
  correctionOf?: UUID; // original event id for reversals (EVT-005)
  payload?: Record<string, unknown>;
  businessDate?: string;
  occurredAt?: string;
}

// Publish to the transactional outbox. The relay dispatches asynchronously;
// consumers (evidence engine, analytics, messaging) process idempotently
// keyed on event_id (ARC-006, ARC-007).
export async function publishEvent(event: BusinessEvent): Promise<UUID> {
  const db = supabaseServer();
  const { data, error } = await db
    .from("event_outbox")
    .insert({
      event_type: event.eventType,
      business_id: event.businessId,
      location_id: event.locationId ?? null,
      actor_membership_id: event.actorMembershipId ?? null,
      channel: event.channel,
      product_set: event.productSet,
      entity_type: event.entityType,
      entity_id: event.entityId,
      amount: event.amount ?? null,
      currency_code: event.currencyCode ?? null,
      verification: event.verification ?? null,
      correction_of: event.correctionOf ?? null,
      payload: event.payload ?? {},
      business_date: event.businessDate ?? null,
      occurred_at: event.occurredAt ?? new Date().toISOString(),
    })
    .select("event_id")
    .single();

  if (error) throw new Error(`Event publish failed: ${error.message}`);
  return data.event_id as UUID;
}
