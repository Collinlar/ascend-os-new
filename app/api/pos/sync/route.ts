// POS terminal sync endpoint. The device posts its dependency-ordered
// outbox; each item is applied idempotently and receives a stable server
// mapping (POS §18.1, POS-SYN-001..006).
//
// Business and location come from the authenticated device, never from the
// request body: a terminal can only ever write to the business it was
// paired with (POS-SYN-003).

import { NextRequest, NextResponse } from "next/server";
import {
  closeShift,
  completeSale,
  openShift,
  SyncRejection,
} from "@/lib/domains/pos";
import { authenticateDevice } from "@/lib/pos/device-auth";
import { supabaseServer } from "@/lib/supabase";
import type { CompleteSaleInput } from "@/lib/domains/types";

// The terminal never sends business, location or device: those are the
// server's to decide from the token.
type TerminalSalePayload = Omit<
  CompleteSaleInput,
  "businessId" | "locationId" | "deviceId"
> & { shiftClientRef?: string };

interface ShiftOpenPayload {
  clientRef: string;
  openingCash?: number;
  openedAt: string;
  cashierMembershipId?: string;
}

interface ShiftClosePayload {
  clientRef: string;
  shiftClientRef: string;
  cashierMembershipId?: string;
  declaredCash?: number;
  deviceExpectedCash?: number;
  differenceNote?: string;
  closingNote?: string;
  expenses?: Array<{
    clientRef: string;
    amount: number;
    reason: string;
    occurredAt: string;
  }>;
  closedAt: string;
}

interface BarcodeAttachPayload {
  clientRef: string;
  itemId: string;
  barcode: string;
  cashierMembershipId?: string;
}

type SyncItem =
  | { kind: "sale.completed"; payload: TerminalSalePayload }
  | { kind: "shift.opened"; payload: ShiftOpenPayload }
  | { kind: "shift.closed"; payload: ShiftClosePayload }
  | { kind: "catalogue.barcode.attached"; payload: BarcodeAttachPayload };

interface SyncItemResult {
  clientRef: string;
  status: "accepted" | "duplicate" | "rejected_temporary" | "rejected_permanent";
  serverId?: string;
  receiptNumber?: string;
  expectedCash?: number;
  difference?: number | null;
  error?: string;
}

export async function POST(request: NextRequest) {
  const device = await authenticateDevice(request);
  if (!device) {
    // A revoked or unknown till must stop, not retry forever.
    return NextResponse.json(
      { error: "This till is no longer active. Ask the owner to set it up again." },
      { status: 401 }
    );
  }

  let batch: {
    items: SyncItem[];
    // What the till believes it has issued and still holds. Compared with
    // what the server actually received, this is what turns lost sales
    // from silent into reported (POS-013).
    watermark?: { receiptSeqHigh?: number; pendingCount?: number };
  };
  try {
    batch = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That did not go through. Check the sync package and tap retry." },
      { status: 400 }
    );
  }

  const results: SyncItemResult[] = [];

  // Dependency order is preserved by processing sequentially (POS-SYN-002):
  // a shift always lands before the sales that belong to it.
  for (const item of batch.items ?? []) {
    try {
      if (item.kind === "shift.opened") {
        const result = await openShift({
          clientRef: item.payload.clientRef,
          businessId: device.businessId,
          locationId: device.locationId,
          deviceId: device.deviceId,
          openingCash: item.payload.openingCash,
          openedAt: item.payload.openedAt,
          cashierMembershipId: item.payload.cashierMembershipId,
        });
        results.push({
          clientRef: item.payload.clientRef,
          status: result.duplicate ? "duplicate" : "accepted",
          serverId: result.shiftId,
        });
      } else if (item.kind === "shift.closed") {
        const result = await closeShift({
          shiftClientRef: item.payload.shiftClientRef,
          declaredCash: item.payload.declaredCash,
          deviceExpectedCash: item.payload.deviceExpectedCash,
          differenceNote: item.payload.differenceNote,
          closingNote: item.payload.closingNote,
          expenses: item.payload.expenses,
          closedAt: item.payload.closedAt,
        });
        results.push({
          clientRef: item.payload.clientRef,
          status: result.duplicate ? "duplicate" : "accepted",
          serverId: result.shiftId,
          expectedCash: result.expectedCash,
          difference: result.difference,
        });
      } else if (item.kind === "sale.completed") {
        const result = await completeSale({
          ...item.payload,
          businessId: device.businessId,
          locationId: device.locationId,
          deviceId: device.deviceId,
        });
        results.push({
          clientRef: item.payload.clientRef,
          status: result.duplicate ? "duplicate" : "accepted",
          serverId: result.saleId,
          receiptNumber: result.receiptNumber,
        });
      } else if (item.kind === "catalogue.barcode.attached") {
        // Queued from the counter, so it arrives whenever the shop is back
        // online rather than being lost because the network was down at the
        // moment somebody scanned an unknown item.
        const { data, error } = await supabaseServer().rpc("attach_item_barcode", {
          p: {
            business_id: device.businessId,
            item_id: item.payload.itemId,
            barcode: item.payload.barcode,
            actor_membership_id: item.payload.cashierMembershipId ?? "",
          },
        });

        if (error) {
          // A barcode already on another product is a decision for a person,
          // not something to retry forever.
          const permanent =
            /barcode_taken|item_not_found|barcode_required/.test(error.message);
          results.push({
            clientRef: item.payload.clientRef,
            status: permanent ? "rejected_permanent" : "rejected_temporary",
            error: error.message.slice(0, 120),
          });
          if (!permanent) break;
        } else {
          results.push({
            clientRef: item.payload.clientRef,
            status: data?.already ? "duplicate" : "accepted",
            serverId: item.payload.itemId,
          });
        }
      } else {
        const unknown = item as { payload?: { clientRef?: string } };
        results.push({
          clientRef: unknown.payload?.clientRef ?? "unknown",
          status: "rejected_permanent",
          error: "unsupported_item_kind",
        });
        continue;
      }
    } catch (err) {
      const clientRef = item.payload?.clientRef ?? "unknown";
      if (err instanceof SyncRejection) {
        results.push({
          clientRef,
          status: err.kind === "temporary" ? "rejected_temporary" : "rejected_permanent",
          error: err.message,
        });
        // Rejected events stay recoverable on the device (POS-SYN-004);
        // a temporary failure stops the batch so order is preserved.
        if (err.kind === "temporary") break;
      } else {
        results.push({ clientRef, status: "rejected_temporary", error: "server_error" });
        break;
      }
    }
  }

  // Recorded after the batch, so the counts reflect what just landed.
  let health: unknown = null;
  if (batch.watermark) {
    try {
      const { data } = await supabaseServer().rpc("record_device_watermark", {
        p: {
          device_id: device.deviceId,
          receipt_seq_high: batch.watermark.receiptSeqHigh ?? 0,
          pending_count: batch.watermark.pendingCount ?? 0,
        },
      });
      health = data ?? null;
    } catch {
      // A watermark is a report about the till, never a condition of
      // accepting its sales. Losing it must not fail the sync.
    }
  }

  return NextResponse.json({
    results,
    leaseExpiresAt: device.leaseExpiresAt,
    health,
  });
}
