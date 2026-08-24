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

export interface PaymentProvider {
  readonly name: string;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  refund(input: RefundInput): Promise<RefundResult>;
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
