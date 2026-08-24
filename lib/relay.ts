// Outbox relay: claims pending business events and fans them out to
// consumers. Today the consumer is the evidence engine; messaging and
// analytics join the same loop later. Consumers are idempotent, so a
// re-delivered event is harmless (ARC-007).

import { supabaseServer } from "@/lib/supabase";
import { processEventForEvidence } from "@/lib/domains/evidence";
import { dispatchQueuedMessages } from "@/lib/messaging/send";
import type { BusinessEventType } from "@/lib/domains/events";

interface OutboxRow {
  event_id: string;
  event_type: BusinessEventType;
  business_id: string;
  verification: "merchant_declared" | "customer_confirmed" | "provider_confirmed" | null;
  correction_of: string | null;
  business_date: string | null;
}

export interface RelayResult {
  claimed: number;
  dispatched: number;
  failed: number;
  messagesSent: number;
  messagesFailed: number;
}

export async function processOutboxBatch(limit = 50): Promise<RelayResult> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("claim_outbox_batch", { p_limit: limit });
  if (error) throw new Error(`Outbox claim failed: ${error.message}`);

  const events = (data ?? []) as OutboxRow[];
  let dispatched = 0;
  let failed = 0;
  const touchedBusinesses = new Set<string>();

  for (const event of events) {
    try {
      await processEventForEvidence(event);
      await db.rpc("mark_outbox_dispatched", { p_event_id: event.event_id });
      touchedBusinesses.add(event.business_id);
      dispatched += 1;
    } catch (err) {
      failed += 1;
      await db.rpc("mark_outbox_failed", {
        p_event_id: event.event_id,
        p_error: err instanceof Error ? err.message : "unknown consumer error",
      });
    }
  }

  // Rescore only the businesses whose evidence actually moved. Scoring the
  // whole book on every tick would be wasteful and would rewrite results
  // that nothing changed.
  for (const businessId of Array.from(touchedBusinesses)) {
    try {
      await db.rpc("compute_readiness", { p_business: businessId });
    } catch {
      // A scoring failure must not block the outbox; the next tick retries.
    }
  }

  // Outbound messages ride the same worker: a merchant should never wait on
  // WhatsApp during a page load.
  const messages = await dispatchQueuedMessages(25).catch(() => ({
    attempted: 0,
    sent: 0,
    failed: 0,
  }));

  // Abandoned deposit checkouts return their slot to the calendar. Without
  // this a single unpaid booking would block a provider's time forever.
  // Supabase returns errors in the result rather than throwing, and a
  // failure here must not stop the rest of the relay.
  try {
    await db.rpc("release_expired_holds");
  } catch {
    // Transport failure only; the next relay tick retries.
  }

  return {
    claimed: events.length,
    dispatched,
    failed,
    messagesSent: messages.sent,
    messagesFailed: messages.failed,
  };
}
