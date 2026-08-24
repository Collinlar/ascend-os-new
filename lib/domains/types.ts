// Shared entity types for the zero-silo core (Master PRD §24.1).
// One tenant-aware source of truth per entity (ARC-001). Product sets import
// these types; they never define their own copies (PRI-002, CAP-002).

export type UUID = string;

// ---------------------------------------------------------------------------
// Identity and business
// ---------------------------------------------------------------------------
export type BusinessArchetype =
  | "walk_in_retail"
  | "online_seller"
  | "appointment_service"
  | "field_service"
  | "professional_firm"
  | "multi_channel"
  | "institution_cohort";

export type ProductSetKey =
  | "pos"
  | "shop"
  | "services"
  | "documents"
  | "office"
  | "discover"
  | "readiness";

export type RoleKey = "owner" | "manager" | "cashier" | "accountant" | "staff";

export type Channel =
  | "business_web"
  | "business_mobile"
  | "pos_terminal"
  | "customer_web"
  | "customer_mobile"
  | "system";

export interface Business {
  id: UUID;
  name: string;
  countryCode: string;
  archetype: BusinessArchetype | null;
}

export interface Membership {
  id: UUID;
  businessId: UUID;
  personId: UUID;
  roleKey: RoleKey;
  locationScope: UUID[] | null; // null = all locations
}

// ---------------------------------------------------------------------------
// Catalogue and inventory
// ---------------------------------------------------------------------------
export interface CatalogueItem {
  id: UUID;
  businessId: UUID;
  kind: "product" | "service";
  name: string;
  basePrice: number | null;
  currencyCode: string;
  trackStock: boolean;
  stockEnforcement: "none" | "soft" | "hard"; // POS-INV-003
  barcode?: string | null;
}

export type MovementKind =
  | "opening_balance"
  | "sale"
  | "restock"
  | "customer_return"
  | "damage_loss"
  | "count_correction"
  | "transfer_out"
  | "transfer_in"
  | "reservation"
  | "reservation_release";

// ---------------------------------------------------------------------------
// Payments (PAY-001..PAY-004)
// ---------------------------------------------------------------------------
export type PaymentMethod =
  | "cash"
  | "mobile_money"
  | "card"
  | "bank_transfer"
  | "payment_link"
  | "credit"
  | "balance";

export type PaymentStatus =
  | "initiated"
  | "pending"
  | "confirmed"
  | "failed"
  | "reversed"
  | "refunded"
  | "disputed";

// Evidence confidence ladder (RDY-008). Merchant-declared records are useful
// but are never presented with provider-confirmed confidence (PAY-006).
export type PaymentVerification =
  | "merchant_declared"
  | "customer_confirmed"
  | "provider_confirmed";

// ---------------------------------------------------------------------------
// POS selling
// ---------------------------------------------------------------------------
export interface SaleLineInput {
  itemId: UUID;
  variantId?: UUID;
  description: string;
  quantity: number; // > 0 (POS-SALE-009)
  unitPrice: number; // captured at sale time
  discount?: number;
  tax?: number;
  lineTotal: number;
  trackStock: boolean;
}

export interface SalePaymentInput {
  seq: string;
  method: PaymentMethod;
  amount: number;
  tendered?: number; // cash
  provider?: string; // mtn_momo | telecel_cash
  providerReference?: string;
  status?: PaymentStatus;
}

// The complete offline-safe sale envelope a terminal posts during sync.
export interface CompleteSaleInput {
  clientRef: string; // device-generated ULID (POS-OFF-003)
  businessId: UUID;
  locationId: UUID;
  deviceId?: UUID;
  shiftId?: UUID;
  cashierMembershipId?: UUID;
  customerId?: UUID; // optional: anonymous sales allowed (POS-SALE-004)
  subtotal: number;
  discountTotal?: number;
  taxTotal?: number;
  total: number;
  currencyCode: string;
  note?: string;
  receiptNumber: string;
  occurredAt: string; // ISO, device time
  businessDate?: string;
  lines: SaleLineInput[];
  payments: SalePaymentInput[];
}

export interface CompleteSaleResult {
  saleId: UUID;
  receiptNumber: string;
  duplicate: boolean; // true when a retried sync hit idempotency (POS-SYN-001)
}

// ---------------------------------------------------------------------------
// Documents (DOC-001)
// ---------------------------------------------------------------------------
export type DocumentType =
  | "quotation"
  | "proforma"
  | "invoice"
  | "receipt"
  | "credit_note"
  | "purchase_order"
  | "delivery_note"
  | "agreement"
  | "job_card"
  | "statement";

// Controlled conversions preserve source history (DOC-003).
export const DOCUMENT_CONVERSIONS: Partial<Record<DocumentType, DocumentType[]>> = {
  quotation: ["proforma", "invoice"],
  proforma: ["invoice"],
  invoice: ["receipt", "credit_note"],
};
