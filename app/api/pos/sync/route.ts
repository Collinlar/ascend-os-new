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
import { withAuthority } from "@/lib/authority/with-authority";
import { normalizePhone } from "@/lib/auth/phone";

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

// A cashier asking for a refund on a sale this till made. Queued like the
// sale, so it can be asked with no network; the till knows the sale only by
// its own reference, which is turned into the sale here.
interface RefundRequestPayload {
  clientRef: string;
  saleClientRef: string;
  reason: string;
  cashierMembershipId?: string;
  /** What came back (0128). Older tills send nothing: back on the shelf. */
  returnCondition?: "restock" | "damaged" | "not_returned";
}

// The cashier saying they have handed an approved refund back from the
// drawer (0123). The amount is the server's to work out, not the till's.
interface RefundPaidPayload {
  clientRef: string;
  approvalId: string;
  shiftClientRef: string;
  paidAt: string;
  cashierMembershipId?: string;
}

interface BarcodeAttachPayload {
  clientRef: string;
  itemId: string;
  barcode: string;
  cashierMembershipId?: string;
}

// Goods from another place, counted in at this counter (0131). Blind: the
// till only ever knew the products, not how many were sent.
interface TransferReceivedPayload {
  clientRef: string;
  transferId: string;
  lines: { itemId: string; received: number }[];
  note?: string;
  cashierMembershipId?: string;
}

type SyncItem =
  | { kind: "sale.completed"; payload: TerminalSalePayload }
  | { kind: "shift.opened"; payload: ShiftOpenPayload }
  | { kind: "shift.closed"; payload: ShiftClosePayload }
  | { kind: "catalogue.barcode.attached"; payload: BarcodeAttachPayload }
  | { kind: "refund.requested"; payload: RefundRequestPayload }
  | { kind: "refund.paid"; payload: RefundPaidPayload }
  | { kind: "transfer.received"; payload: TransferReceivedPayload };

interface SyncItemResult {
  clientRef: string;
  status: "accepted" | "duplicate" | "rejected_temporary" | "rejected_permanent";
  serverId?: string;
  receiptNumber?: string;
  expectedCash?: number;
  difference?: number | null;
  error?: string;
}

async function handlePOST(request: NextRequest) {
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
          businessId: device.businessId,
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
        // A customer added at the till travels with their first sale and is
        // found or created here, by phone, so a person already on the books
        // is matched rather than created twice, and the till never has to
        // invent an id the server might refuse.
        const { newCustomer, ...sale } = item.payload;
        let customerId = sale.customerId;
        if (!customerId && newCustomer) {
          customerId = await customerForTill(device.businessId, newCustomer);
        }
        const result = await completeSale({
          ...sale,
          customerId,
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
      } else if (item.kind === "refund.requested") {
        const db = supabaseServer();
        const { data: sale } = await db
          .from("sale")
          .select("id")
          .eq("business_id", device.businessId)
          .eq("client_ref", item.payload.saleClientRef)
          .maybeSingle();
        // The sale is earlier in this till's queue, so it lands first. If it
        // has not, this waits and tries again rather than being lost.
        if (!sale) throw new SyncRejection("sale_not_yet_synced", "temporary");
        const { data, error } = await db.rpc("request_sale_refund", {
          p: {
            sale_id: sale.id,
            reason: (item.payload.reason ?? "").slice(0, 500),
            requested_by: item.payload.cashierMembershipId ?? "",
            return_condition: ["restock", "damaged", "not_returned"].includes(item.payload.returnCondition ?? "")
              ? item.payload.returnCondition
              : "restock",
          },
        });
        if (error) {
          if (/sale_not_refundable/.test(error.message)) {
            throw new SyncRejection("This sale has already been reversed.", "permanent");
          }
          throw new SyncRejection("refund_not_requested", "temporary");
        }
        results.push({
          clientRef: item.payload.clientRef,
          status: data?.duplicate ? "duplicate" : "accepted",
          serverId: data?.approval_id as string | undefined,
        });
      } else if (item.kind === "refund.paid") {
        const { data, error } = await supabaseServer().rpc("record_till_refund_payout", {
          p: {
            business_id: device.businessId,
            approval_id: item.payload.approvalId,
            shift_client_ref: item.payload.shiftClientRef,
            device_id: device.deviceId,
            paid_by: item.payload.cashierMembershipId ?? "",
            client_ref: item.payload.clientRef,
            paid_at: item.payload.paidAt,
          },
        });
        if (error) {
          if (/refund_not_found|refund_not_approved|refund_not_from_the_drawer/.test(error.message)) {
            throw new SyncRejection(error.message.match(/refund_not_\w+/)?.[0] ?? "refund_not_paid", "permanent");
          }
          throw new SyncRejection(/shift_not_yet_synced/.test(error.message) ? "shift_not_yet_synced" : "refund_not_recorded", "temporary");
        }
        results.push({
          clientRef: item.payload.clientRef,
          status: data?.duplicate ? "duplicate" : "accepted",
          serverId: data?.payout_id as string | undefined,
        });
      } else if (item.kind === "transfer.received") {
        // Only goods going to this till's own place.
        const db = supabaseServer();
        const { data: t } = await db
          .from("stock_transfer")
          .select("id, to_location_id")
          .eq("id", item.payload.transferId)
          .eq("business_id", device.businessId)
          .maybeSingle();
        if (!t) throw new SyncRejection("transfer_not_found", "permanent");
        if (t.to_location_id !== device.locationId) throw new SyncRejection("transfer_for_another_place", "permanent");
        const { data, error } = await db.rpc("receive_stock_transfer", {
          p: {
            business_id: device.businessId,
            transfer_id: item.payload.transferId,
            received_by: item.payload.cashierMembershipId ?? "",
            note: (item.payload.note ?? "").slice(0, 300),
            lines: (item.payload.lines ?? []).map((l) => ({ item_id: l.itemId, received: String(l.received) })),
          },
        });
        if (error) {
          if (/received_more_than_sent|received_required|receiver_not_member|transfer_not_found/.test(error.message)) {
            throw new SyncRejection(error.message.match(/received_more_than_sent|received_required|receiver_not_member|transfer_not_found/)![0], "permanent");
          }
          throw new SyncRejection("transfer_not_received", "temporary");
        }
        results.push({
          clientRef: item.payload.clientRef,
          status: data?.unchanged ? "duplicate" : "accepted",
          serverId: item.payload.transferId,
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

async function customerForTill(
  businessId: string,
  added: { name: string; phone: string }
): Promise<string | undefined> {
  const phone = normalizePhone(added.phone ?? "");
  const name = (added.name ?? "").trim();
  // The till insists on a good number before it lets the cashier save, so
  // a bad one here is a till bug, not a reason to lose the sale: it is
  // recorded without a customer.
  if (!phone.ok || !name) return undefined;
  const { data, error } = await supabaseServer().rpc("find_or_create_customer", {
    p: { business_id: businessId, name, phone: phone.e164, created_via: "pos" },
  });
  if (error) throw new SyncRejection("customer_not_saved", "temporary");
  return (data?.customer_id as string | null) ?? undefined;
}

export const POST = withAuthority("pos/sync", "POST", handlePOST);
