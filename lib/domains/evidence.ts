// Evidence engine: converts business events into explainable evidence
// (Master PRD §13). Not every event becomes positive evidence (EVT-009).
// Processing is idempotent per (source_event_id, evidence_type) (EVT-006).

import { supabaseServer } from "@/lib/supabase";
import type { BusinessEventType } from "./events";

// 2026.11-1 (0094): corrections reach the evidence through
// evidence_correct_event; the hand-made shop.order.refunded rule is retired
// (the generic correction replaces it); credit notes are not documentation.
//
// 2026.11-2 (0099): commerce evidence comes from the commerce core
// (record_commerce_evidence, run by compute_readiness), so the rules for
// sales, fulfilled orders, completed bookings, paid documents and confirmed
// payments are gone from here. Their old records are retired from counting
// in the database; writing new ones would only add records that never count.
//
// 2026.11-3 (Inventory Core I5): a posted stock count is operational
// evidence, weighted low, and says nothing about the business's money. A
// count that found nothing missing earns more than one that found a gap.
export const EVIDENCE_RULE_VERSION = "2026.11-3";

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
  // Sales, fulfilled orders, completed bookings, paid documents and
  // confirmed payments earn their evidence from the commerce core (0099),
  // once per earned transaction, with refunds, credits and reversals taken
  // off in proportion there. Order placement stays here: it is a demand
  // signal, not money earned.
  "documents.document.issued": {
    dimension: "documentation_compliance",
    evidenceType: "issued_document",
    weights: { merchant_declared: 1 },
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
  // Both of these have been emitted since Office was built and neither had
  // a rule, so a business that ran its work through the platform earned
  // nothing for it.
  //
  // Finishing work is evidence that the business is organised, not that it
  // is profitable, so it sits in operational_structure and is weighted
  // lightly. Volume is not quality: the scoring layer applies diminishing
  // returns, which matters most here because tasks are the cheapest thing
  // in the system to create.
  "office.task.completed": {
    dimension: "operational_structure",
    evidenceType: "completed_work",
    weights: { merchant_declared: 0.4 },
  },
  // A business that records what it spends is keeping books, which is a
  // documentation habit rather than a financial result. It earns more when
  // the spend went through an approval, because a declared cost nobody
  // checked is worth less than one somebody signed off.
  "office.expense.submitted": {
    dimension: "documentation_compliance",
    evidenceType: "recorded_spending",
    weights: { merchant_declared: 0.5, customer_confirmed: 1 },
  },
  // Counting the shelf is a habit of control, not a financial result
  // (Inventory Core decision 7). The weight is set from what the count found,
  // below: 0.5 when nothing was missing, 0.2 when stock was short.
  "inventory.count.posted": {
    dimension: "operational_structure",
    evidenceType: "stock_count",
    weights: { merchant_declared: 0.5 },
  },
};

/** A count that found stock missing still shows the habit, but earns less. */
function countWeight(payload: Record<string, unknown> | null | undefined, base: number): number {
  const short = Number(payload?.write_down_value ?? 0);
  return short > 0 ? 0.2 : base;
}

interface OutboxEvent {
  event_id: string;
  event_type: BusinessEventType;
  business_id: string;
  verification:
    | "merchant_declared"
    | "system_recorded"
    | "customer_confirmed"
    | "provider_confirmed"
    | "institution_verified"
    | null;
  correction_of: string | null;
  /** The event this one undoes (0093). */
  reversal_of?: string | null;
  payload?: Record<string, unknown> | null;
  business_date: string | null;
}

// Consume one event. Corrections write a negative adjustment referencing the
// original evidence rather than deleting history (EVT-005, EVT-013).
export async function processEventForEvidence(event: OutboxEvent): Promise<void> {
  const db = supabaseServer();

  // An event that undoes another (a reversal, a refund) corrects the
  // evidence the original earned, in proportion, beside it (0094).
  if (event.reversal_of || event.correction_of) {
    const { error } = await db.rpc("evidence_correct_event", { p_event_id: event.event_id });
    if (error) throw new Error(`Evidence correction failed: ${error.message}`);
    return;
  }

  // A credit note undoes part of an invoice; it is not documentation.
  if (event.event_type === "documents.document.issued" && event.payload?.type === "credit_note") return;

  const rule = RULES[event.event_type];
  if (!rule) return; // event is auditable activity but not scoring evidence

  const verification = event.verification ?? "merchant_declared";
  const listed =
    rule.weights[verification as keyof EvidenceRule["weights"]] ?? rule.weights.merchant_declared;
  const weight = event.event_type === "inventory.count.posted" ? countWeight(event.payload, listed) : listed;

  const { error } = await db.from("evidence_record").insert({
    business_id: event.business_id,
    source_event_id: event.event_id,
    dimension: rule.dimension,
    evidence_type: rule.evidenceType,
    verification:
      verification === "provider_confirmed" ? "payment_verified" : verification,
    weight,
    rule_version: EVIDENCE_RULE_VERSION,
    detail:
      event.event_type === "inventory.count.posted"
        ? { lines: event.payload?.lines ?? null, differing: event.payload?.differing ?? null, short: event.payload?.write_down_value ?? null }
        : {},
  });

  // Unique (source_event_id, evidence_type) makes retries safe (EVT-006).
  if (error && !error.message.includes("duplicate key")) {
    throw new Error(`Evidence write failed: ${error.message}`);
  }
}
