// Asking the provider about payments nobody has heard back about (0091).
//
// A payment is closed by the provider's webhook. When no webhook comes, this
// step, run on the relay tick, asks the provider what happened to each
// intent still open a few minutes after it started:
//   succeeded   confirmed exactly as the webhook would (confirm_payment_intent)
//   failed      failed exactly as the webhook would (fail_payment_intent)
//   abandoned   the customer never completed it
//   pending     still in progress at the provider
//   unknown     no definite answer, so Ascend asks again later
// Time alone never fails a payment. A succeeded payment in a different
// currency from the one asked for is not confirmed automatically: it is
// left "unknown" for a person.
//
// Written against two small interfaces rather than the app's clients, so it
// can be checked on its own against the real database functions.

import type { VerifyResult } from "./provider";

export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface Verifier {
  verify(reference: string): Promise<VerifyResult>;
}

export interface ResolveResult {
  checked: number;
  confirmed: number;
  failed: number;
  abandoned: number;
  pending: number;
  unknown: number;
  errors: number;
}

interface OpenIntent {
  reference: string;
  amount: number;
  currency_code: string;
}

export async function resolveOpenIntents(
  db: RpcClient,
  provider: Verifier,
  options: { limit?: number; budgetMs?: number } = {}
): Promise<ResolveResult> {
  const result: ResolveResult = {
    checked: 0, confirmed: 0, failed: 0, abandoned: 0, pending: 0, unknown: 0, errors: 0,
  };
  const started = Date.now();
  const budget = options.budgetMs ?? 4000;

  const { data, error } = await db.rpc("intents_to_resolve", { p_limit: options.limit ?? 20 });
  if (error || !Array.isArray(data)) {
    result.errors += 1;
    return result;
  }

  for (const intent of data as OpenIntent[]) {
    if (Date.now() - started > budget) break;
    result.checked += 1;

    let answer: VerifyResult;
    try {
      answer = await provider.verify(intent.reference);
    } catch (err) {
      answer = {
        status: "unknown",
        note: `could not ask the provider: ${err instanceof Error ? err.message : "no answer"}`,
      };
    }

    // A success in another currency is not confirmed by a machine.
    if (
      answer.status === "succeeded" &&
      answer.currencyCode &&
      answer.currencyCode.toUpperCase() !== String(intent.currency_code).toUpperCase()
    ) {
      answer = {
        status: "unknown",
        note: `paid in ${answer.currencyCode}, asked for ${intent.currency_code}; a person should look at it`,
      };
    }

    let call: { fn: string; args: Record<string, unknown> };
    switch (answer.status) {
      case "succeeded":
        call = {
          fn: "confirm_payment_intent",
          args: {
            p: {
              reference: intent.reference,
              amount: answer.amount ?? intent.amount,
              provider_reference: answer.providerReference ?? null,
              method: answer.method ?? "mobile_money",
            },
          },
        };
        break;
      case "failed":
        call = {
          fn: "fail_payment_intent",
          args: { p: { reference: intent.reference, provider_reference: answer.providerReference ?? null } },
        };
        break;
      default:
        call = {
          fn: "record_intent_check",
          args: { p: { reference: intent.reference, outcome: answer.status, note: answer.note ?? null } },
        };
    }

    const { error: callError } = await db.rpc(call.fn, call.args);
    if (callError) {
      result.errors += 1;
      continue;
    }
    if (answer.status === "succeeded") result.confirmed += 1;
    else if (answer.status === "failed") result.failed += 1;
    else result[answer.status] += 1;
  }
  return result;
}
