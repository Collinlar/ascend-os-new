// Business event contracts (Master PRD §13).
// Every meaningful business change produces a standard event (EVT-001).
// Events are written by the Postgres function that makes the change, in the
// same transaction, so a change and its event either both exist or neither
// does. There is deliberately no way to write one from TypeScript: the last
// helper that did was removed in 0071, because a second call after the change
// can fail on its own and leave a change with no event.

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
  | "inventory.count.posted"
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
