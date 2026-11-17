// Payment provider abstraction (PAY-014). Ascend owns the payment
// experience and the reconciliation record; the provider is replaceable and
// country-specific. Paystack is the Ghana implementation: MTN MoMo,
// Telecel Cash, card and bank transfer.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export interface InitiateInput {
  reference: string;
  amount: number; // major units, e.g. GHS 25.50
  currencyCode: string;
  customerContact: string; // email or phone
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitiateResult {
  ok: boolean;
  checkoutUrl?: string;
  providerReference?: string;
  error?: string;
}

export interface RefundInput {
  transactionReference: string; // the original payment's provider reference
  amount: number; // major units
  reason?: string;
}

export interface RefundResult {
  ok: boolean;
  providerReference?: string;
  error?: string;
}

/**
 * What the provider says about one payment when Ascend asks (0091). Only
 * "succeeded" and "failed" close a payment; "unknown" means no definite
 * answer, and is never treated as a failure.
 */
export interface VerifyResult {
  status: "succeeded" | "failed" | "abandoned" | "pending" | "unknown";
  amount?: number; // major units
  currencyCode?: string;
  providerReference?: string;
  method?: "mobile_money" | "card" | "bank_transfer";
  paidAt?: string;
  /** In words, for the intent's resolution note. */
  note?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Ask the provider what happened to a payment, by Ascend's reference. */
  verify(reference: string): Promise<VerifyResult>;
  verifySignature(rawBody: string, signature: string | null): boolean;
  parseEvent(rawBody: string): ProviderEvent | null;
}

export interface ProviderEvent {
  kind:
    | "succeeded"
    | "failed"
    | "refund_completed"
    | "refund_failed"
    | "settled"
    | "ignored";
  reference: string;
  providerReference?: string;
  amount?: number; // major units
  method?: "mobile_money" | "card" | "bank_transfer";
  paidAt?: string;
  settlement?: {
    grossAmount: number;
    fees: number;
    netAmount: number;
    settledAt: string;
  };
}

export function newPaymentReference(): string {
  return `asc_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

// Paystack works in the smallest currency unit (pesewas for GHS).
function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}
function fromMinorUnits(amount: number): number {
  return Math.round(amount) / 100;
}

const PAYSTACK_CHANNEL_MAP: Record<string, ProviderEvent["method"]> = {
  mobile_money: "mobile_money",
  card: "card",
  bank: "bank_transfer",
  bank_transfer: "bank_transfer",
};

class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";

  private secret(): string {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
    return key;
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    try {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secret()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference: input.reference,
          amount: toMinorUnits(input.amount),
          currency: input.currencyCode,
          email: contactAsEmail(input.customerContact),
          callback_url: input.callbackUrl,
          channels: ["mobile_money", "card", "bank_transfer"],
          metadata: input.metadata ?? {},
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url?: string; reference?: string };
      };

      if (!response.ok || !payload.status || !payload.data?.authorization_url) {
        return { ok: false, error: payload.message ?? `provider error ${response.status}` };
      }
      return {
        ok: true,
        checkoutUrl: payload.data.authorization_url,
        providerReference: payload.data.reference,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "provider unreachable" };
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    try {
      const response = await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secret()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction: input.transactionReference,
          amount: toMinorUnits(input.amount),
          merchant_note: input.reason,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        status?: boolean;
        message?: string;
        data?: { id?: number | string };
      };

      if (!response.ok || !payload.status) {
        return { ok: false, error: payload.message ?? `provider error ${response.status}` };
      }
      // The refund is now pending at the provider; the webhook confirms it.
      return { ok: true, providerReference: payload.data?.id ? String(payload.data.id) : undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "provider unreachable" };
    }
  }

  async verify(reference: string): Promise<VerifyResult> {
    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${this.secret()}` },
          signal: AbortSignal.timeout(10_000),
        }
      );
      const payload = await response.json().catch(() => null);
      return paystackVerifyResult(response.status, payload);
    } catch (err) {
      return {
        status: "unknown",
        note: `could not reach Paystack: ${err instanceof Error ? err.message : "no answer"}`,
      };
    }
  }

  // Paystack signs the raw body with HMAC SHA512 using the secret key.
  // Compared in constant time: a timing-leaky compare on a webhook signature
  // is a real vulnerability, not a theoretical one.
  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!signature) return false;
    const expected = createHmac("sha512", this.secret()).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseEvent(rawBody: string): ProviderEvent | null {
    let payload: {
      event?: string;
      data?: {
        reference?: string;
        id?: number | string;
        amount?: number;
        status?: string;
        channel?: string;
        paid_at?: string;
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const reference = payload.data?.reference;
    if (!reference) return null;

    if (payload.event === "charge.success" && payload.data?.status === "success") {
      return {
        kind: "succeeded",
        reference,
        providerReference: payload.data.id ? String(payload.data.id) : undefined,
        amount:
          payload.data.amount !== undefined
            ? fromMinorUnits(payload.data.amount)
            : undefined,
        method: PAYSTACK_CHANNEL_MAP[payload.data.channel ?? ""] ?? "mobile_money",
        paidAt: payload.data.paid_at,
      };
    }

    if (payload.event === "charge.failed") {
      return { kind: "failed", reference };
    }

    if (payload.event === "refund.processed") {
      return {
        kind: "refund_completed",
        reference,
        providerReference: payload.data?.id ? String(payload.data.id) : undefined,
        amount:
          payload.data?.amount !== undefined
            ? fromMinorUnits(payload.data.amount)
            : undefined,
      };
    }

    if (payload.event === "refund.failed") {
      return {
        kind: "refund_failed",
        reference,
        providerReference: payload.data?.id ? String(payload.data.id) : undefined,
      };
    }

    return { kind: "ignored", reference };
  }
}

/**
 * Turns Paystack's answer to GET /transaction/verify/:reference into a
 * VerifyResult. Kept separate and free of I/O so it can be checked against
 * each answer Paystack documents. Only "success" and "failed" are definite;
 * "reversed" and anything unrecognised are left for a person ("unknown").
 */
export function paystackVerifyResult(httpStatus: number, payload: unknown): VerifyResult {
  const p = (payload ?? {}) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      id?: number | string;
      channel?: string;
      paid_at?: string;
      gateway_response?: string;
    };
  };
  if (httpStatus >= 500 || httpStatus === 429) {
    return { status: "unknown", note: `Paystack answered ${httpStatus}; will ask again` };
  }
  if (!p.status || !p.data) {
    return {
      status: "unknown",
      note: `Paystack did not confirm the reference (${httpStatus}${p.message ? `: ${p.message}` : ""})`,
    };
  }
  const d = p.data;
  const base = {
    amount: d.amount !== undefined ? fromMinorUnits(d.amount) : undefined,
    currencyCode: d.currency,
    providerReference: d.id !== undefined ? String(d.id) : undefined,
    method: PAYSTACK_CHANNEL_MAP[d.channel ?? ""],
    paidAt: d.paid_at ?? undefined,
  };
  switch (d.status) {
    case "success":
      return { ...base, status: "succeeded" };
    case "failed":
      return { ...base, status: "failed", note: d.gateway_response ?? "failed at Paystack" };
    case "abandoned":
      return { ...base, status: "abandoned", note: "the customer did not complete the payment" };
    case "ongoing":
    case "pending":
    case "processing":
    case "queued":
      return { ...base, status: "pending", note: `Paystack says ${d.status}` };
    case "reversed":
      return { ...base, status: "unknown", note: "Paystack reversed this payment; a person should look at it" };
    default:
      return { ...base, status: "unknown", note: `Paystack answered "${d.status ?? "nothing"}"` };
  }
}

// Paystack requires an email. Ghanaian customers pay with a phone number, so
// a stable placeholder keeps checkout working without inventing contact
// details we would then hold (PAY-013).
function contactAsEmail(contact: string): string {
  if (contact.includes("@")) return contact;
  const digits = contact.replace(/[^0-9]/g, "");
  return `${digits || "customer"}@customers.ascendsme.africa`;
}

export function paymentProvider(): PaymentProvider {
  return new PaystackProvider();
}
