// POS domain service (POS Core owns Sales; Inventory Core receives movements
// through the shared transaction). The terminal syncs a dependency-ordered
// outbox; this service is the server side of that contract (POS §18.1).

import { supabaseServer } from "@/lib/supabase";
import type { CompleteSaleInput, CompleteSaleResult, UUID } from "./types";

// Validates scope then applies the sale atomically and idempotently via the
// complete_pos_sale Postgres function (POS-SYN-001..006).
export async function completeSale(
  input: CompleteSaleInput
): Promise<CompleteSaleResult> {
  const db = supabaseServer();

  // Server-side scope validation: business, location, device and user
  // (POS-SYN-003). Out-of-scope events are rejected and audited.
  if (input.deviceId) {
    const { data: device } = await db
      .from("device_registration")
      .select("id, business_id, status")
      .eq("id", input.deviceId)
      .single();

    if (!device || device.business_id !== input.businessId) {
      await audit(input.businessId, "sync.rejected.device_scope", input.clientRef);
      throw new SyncRejection("device_out_of_scope", "permanent");
    }
    // A revoked device cannot sync new transactions (OFL-013, POS-022).
    if (device.status === "revoked" || device.status === "retired") {
      await audit(input.businessId, "sync.rejected.device_revoked", input.clientRef);
      throw new SyncRejection("device_revoked", "permanent");
    }
  }

  for (const line of input.lines) {
    if (line.quantity <= 0) {
      throw new SyncRejection("invalid_quantity", "permanent"); // POS-SALE-009
    }
  }

  // The safe wrapper: identical for every ordinary sale, and the difference
  // only shows when a receipt number is already spent, where it renumbers
  // rather than refusing to record the sale at all.
  const { data, error } = await db.rpc("complete_pos_sale_safe", {
    p: {
      client_ref: input.clientRef,
      business_id: input.businessId,
      location_id: input.locationId,
      device_id: input.deviceId ?? "",
      shift_id: input.shiftId ?? "",
      cashier_membership_id: input.cashierMembershipId ?? "",
      customer_id: input.customerId ?? "",
      subtotal: input.subtotal,
      discount_total: input.discountTotal ?? 0,
      tax_total: input.taxTotal ?? 0,
      total: input.total,
      currency_code: input.currencyCode,
      note: input.note ?? null,
      receipt_number: input.receiptNumber,
      occurred_at: input.occurredAt,
      business_date: input.businessDate ?? null,
      lines: input.lines.map((l) => ({
        item_id: l.itemId,
        variant_id: l.variantId ?? "",
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        discount: l.discount ?? 0,
        tax: l.tax ?? 0,
        line_total: l.lineTotal,
        track_stock: l.trackStock,
      })),
      payments: input.payments.map((p) => ({
        seq: p.seq,
        method: p.method,
        amount: p.amount,
        tendered: p.tendered ?? "",
        provider: p.provider ?? null,
        provider_reference: p.providerReference ?? null,
        status: p.status ?? "confirmed",
      })),
    },
  });

  if (error) {
    // Temporary and permanent errors stay distinct so the device retries the
    // right way (POS-SYN-005).
    throw new SyncRejection(error.message, isTransient(error.message) ? "temporary" : "permanent");
  }

  return {
    saleId: data.sale_id as UUID,
    receiptNumber: data.receipt_number as string,
    duplicate: Boolean(data.duplicate),
  };
}

export class SyncRejection extends Error {
  constructor(
    message: string,
    public readonly kind: "temporary" | "permanent"
  ) {
    super(message);
    this.name = "SyncRejection";
  }
}

function isTransient(message: string): boolean {
  // shift_not_yet_synced is ordinary ordering, not a defect: the sale's
  // shift is still earlier in the device's queue and will land first.
  return /timeout|connection|deadlock|too many|shift_not_yet_synced/i.test(message);
}

// ---------------------------------------------------------------------------
// Shift services. Both are idempotent on the device's client_ref so a
// retried sync never opens a second drawer or double-closes a day.
// ---------------------------------------------------------------------------
export interface OpenShiftInput {
  clientRef: string;
  businessId: UUID;
  locationId: UUID;
  deviceId?: UUID;
  cashierMembershipId?: UUID;
  openingCash?: number;
  openedAt: string;
}

export async function openShift(input: OpenShiftInput): Promise<{ shiftId: UUID; duplicate: boolean }> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("open_pos_shift", {
    p: {
      client_ref: input.clientRef,
      business_id: input.businessId,
      location_id: input.locationId,
      device_id: input.deviceId ?? "",
      cashier_membership_id: input.cashierMembershipId ?? "",
      opening_cash: input.openingCash ?? 0,
      opened_at: input.openedAt,
    },
  });
  if (error) {
    throw new SyncRejection(error.message, isTransient(error.message) ? "temporary" : "permanent");
  }
  return { shiftId: data.shift_id as UUID, duplicate: Boolean(data.duplicate) };
}

export interface TillExpenseInput {
  clientRef: string;
  amount: number;
  reason: string;
  occurredAt: string;
}

export interface CloseShiftInput {
  shiftClientRef: string;
  declaredCash?: number;
  deviceExpectedCash?: number;
  differenceNote?: string;
  closingNote?: string;
  expenses?: TillExpenseInput[];
  closedAt: string;
}

export async function closeShift(input: CloseShiftInput): Promise<{
  shiftId: UUID;
  expectedCash: number;
  difference: number | null;
  duplicate: boolean;
}> {
  const db = supabaseServer();
  const { data, error } = await db.rpc("close_pos_shift", {
    p: {
      shift_client_ref: input.shiftClientRef,
      declared_cash: input.declaredCash ?? "",
      device_expected_cash: input.deviceExpectedCash ?? "",
      difference_note: input.differenceNote ?? null,
      closing_note: input.closingNote ?? null,
      expenses: (input.expenses ?? []).map((e) => ({
        client_ref: e.clientRef,
        amount: e.amount,
        reason: e.reason,
        occurred_at: e.occurredAt,
      })),
      closed_at: input.closedAt,
    },
  });
  if (error) {
    // A close whose shift has not synced yet is ordering, not failure.
    const transient = isTransient(error.message) || /shift_not_found/.test(error.message);
    throw new SyncRejection(error.message, transient ? "temporary" : "permanent");
  }
  return {
    shiftId: data.shift_id as UUID,
    expectedCash: Number(data.expected_cash),
    difference: data.difference === null ? null : Number(data.difference),
    duplicate: Boolean(data.duplicate),
  };
}

async function audit(businessId: UUID, action: string, clientRef: string) {
  const db = supabaseServer();
  await db.from("audit_log").insert({
    business_id: businessId,
    action,
    detail: { client_ref: clientRef },
  });
}
