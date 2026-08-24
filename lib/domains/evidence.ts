// Evidence engine: converts business events into explainable evidence
// (Master PRD §13). Not every event becomes positive evidence (EVT-009).
// Processing is idempotent per (source_event_id, evidence_type) (EVT-006).

import { supabaseServer } from "@/lib/supabase";
import type { BusinessEventType } from "./events";

export const EVIDENCE_RULE_VERSION = "2026.07-1";

type Dimension =
  | "identity_stability"
  | "financial_activity"
  | "operational_structure"
  | "customer_market"
  | "documentation_compliance"
  | "governance_control"
  | "digital_presence"
  | "evidence_quality";

interface EvidenceRule {
  dimension: Dimension;
  evidenceType: string;
  // Weight by verification level: declared activity earns less confidence
  // than payment-verified activity (EVT-011). Volume alone is not quality
  // (EVT-009); the scoring layer applies diminishing returns.
  weights: {
    merchant_declared: number;
    customer_confirmed?: number;
    provider_confirmed?: number;
  };
}

// Rules keyed by event type. Login frequency and paid promotion are
// deliberately absent (EVT-016, EVT-017): reach is not reliability.
//
// This absence is also enforced in the database: the
// `evidence_excludes_promotion` trigger (migration 0026) rejects any
// evidence row that looks like promotion activity, so adding a rule here
// for a `discover.*` event would fail loudly rather than quietly turning ad
// spend into creditworthiness.
const RULES: Partial<Record<BusinessEventType, EvidenceRule>> = {
  "pos.sale.completed": {
    dimension: "financial_activity",
    evidenceType: "recorded_sale",
    weights: { merchant_declared: 1, provider_confirmed: 3 },
  },
  "pos.shift.closed": {
    dimension: "governance_control",
    evidenceType: "reconciled_shift",
    weights: { merchant_declared: 2 },
  },
  "shop.order.placed": {
    dimension: "customer_market",
    evidenceType: "received_order",
    weights: { merchant_declared: 0.5, customer_confirmed: 1 },
  },
  "shop.order.fulfilled": {
    dimension: "customer_market",
    evidenceType: "fulfilled_order",
    weights: { merchant_declared: 1, customer_confirmed: 2, provider_confirmed: 3 },
  },
  // A refund reverses the fulfilment evidence rather than deleting it
  // (EVT-005). Cancellations and intermediate progress are operational
  // activity, not evidence of business quality, so they carry no rule.
  "shop.order.refunded": {
    dimension: "customer_market",
    evidenceType: "fulfilled_order_reversed",
    weights: { merchant_declared: -1 },
  },
  "services.booking.completed": {
    dimension: "customer_market",
    evidenceType: "completed_service",
    weights: { merchant_declared: 1, customer_confirmed: 2 },
  },
  "documents.document.issued": {
    dimension: "documentation_compliance",
    evidenceType: "issued_document",
    weights: { merchant_declared: 1 },
  },
  "documents.document.paid": {
    dimension: "financial_activity",
    evidenceType: "collected_receivable",
    weights: { merchant_declared: 1, provider_confirmed: 3 },
  },
  "finance.payment.confirmed": {
    dimension: "financial_activity",
    evidenceType: "verified_payment",
    weights: { merchant_declared: 0, provider_confirmed: 2 },
  },
  "office.approval.decided": {
    dimension: "governance_control",
    evidenceType: "exercised_approval_control",
    weights: { merchant_declared: 1 },
  },
  "office.attendance.recorded": {
    dimension: "operational_structure",
    evidenceType: "staff_attendance",
    weights: { merchant_declared: 0.5 },
  },
};

interface OutboxEvent {
  event_id: string;
  event_type: BusinessEventType;
  business_id: string;
  verification: "merchant_declared" | "customer_confirmed" | "provider_confirmed" | null;
  correction_of: string | null;
  business_date: string | null;
}

// Consume one event. Corrections write a negative adjustment referencing the
// original evidence rather than deleting history (EVT-005, EVT-013).
export async function processEventForEvidence(event: OutboxEvent): Promise<void> {
  const rule = RULES[event.event_type];
  if (!rule) return; // event is auditable activity but not scoring evidence

  const verification = event.verification ?? "merchant_declared";
  const weight = rule.weights[verification] ?? rule.weights.merchant_declared;
  const signedWeight = event.correction_of ? -Math.abs(weight) : weight;

  const db = supabaseServer();
  const { error } = await db.from("evidence_record").insert({
    business_id: event.business_id,
    source_event_id: event.event_id,
    dimension: rule.dimension,
    evidence_type: rule.evidenceType,
    verification:
      verification === "provider_confirmed" ? "payment_verified" : verification,
    weight: signedWeight,
    rule_version: EVIDENCE_RULE_VERSION,
    detail: event.correction_of ? { correction_of: event.correction_of } : {},
  });

  // Unique (source_event_id, evidence_type) makes retries safe (EVT-006).
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(`Evidence write failed: ${error.message}`);
  }
}
