// Attaching a barcode from the counter.
//
// Written locally first and queued, exactly like a sale. A cashier meets an
// unknown barcode most often in a busy shop with a poor connection, and the
// attachment has to survive that: the till starts recognising the product
// immediately, and the server finds out when the network returns.

import { newClientRef } from "@/lib/ids";
import { get, put, STORE, type LocalItem, type OutboxItem } from "./db";

export async function attachBarcodeLocally(
  itemId: string,
  barcode: string,
  cashierMembershipId?: string
): Promise<LocalItem | undefined> {
  const code = barcode.trim();
  if (!code) return undefined;

  const item = await get<LocalItem>(STORE.catalogue, itemId);
  if (!item) return undefined;

  const updated: LocalItem = { ...item, barcode: code };
  await put(STORE.catalogue, updated);

  const clientRef = newClientRef("barcode");
  const now = new Date().toISOString();
  const queued: OutboxItem = {
    clientRef,
    kind: "catalogue.barcode.attached",
    payload: { clientRef, itemId, barcode: code, cashierMembershipId },
    state: "pending",
    retryCount: 0,
    createdAt: now,
    lastAttemptAt: null,
    nextAttemptAt: now,
    lastError: null,
  };
  await put(STORE.outbox, queued);

  return updated;
}
