import "server-only";

// The one authority check in front of every API route (Phase 1).
//
// For each request it works out what the decision is and records it in
// authority_decision. What happens next depends on the route's group:
//
//   SHADOW (the default): the route runs exactly as before, whatever the
//   decision. Any failure inside the check is recorded as "error" and never
//   reaches the person using the app.
//
//   ENFORCED (groups listed in AUTHORITY_ENFORCE, see enforce.ts): a refusal
//   is returned to the person with a plain reason, and if the check itself
//   cannot run, the request is refused rather than let through.
//
// Every exported handler in app/api must be wrapped by this function;
// scripts/check-authority.mjs fails the build check if one is not.

import type { NextRequest } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { currentAdmin } from "@/lib/auth/admin";
import { ROUTE_POLICY, type Method, type MemberRule } from "./policy";
import { resolveAuthority, resolveBusinessId } from "./context";
import { decideMember, mergeRules, type Outcome } from "./decide";
import { recordDecision } from "./log";
import { routeEnforced, refusal, checkUnavailable } from "./enforce";

type RouteContext = { params?: Record<string, string> } | undefined;

async function readBody(request: NextRequest, method: string): Promise<Record<string, unknown>> {
  if (method === "GET") return {};
  try {
    const parsed = await request.clone().json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Returns the decision, or null where the route is not about a person in a
 *  business and checks itself (public, webhook, cron, device). */
async function evaluate(
  route: string,
  method: Method,
  request: NextRequest,
  context: RouteContext,
  enforced: boolean
): Promise<Outcome | null> {
  const refuse = enforced ? "deny" : "would_deny";
  const mode = enforced ? "enforce" : "shadow";

  const policy = ROUTE_POLICY[route]?.[method];
  if (!policy) {
    const outcome: Outcome = { decision: refuse, reason: "no_policy_for_route", required: {} };
    await recordDecision({ surface: "api", route, method, mode, outcome });
    return outcome;
  }

  if (policy.kind === "public" || policy.kind === "webhook" || policy.kind === "cron" || policy.kind === "device") {
    return null;
  }

  const personId = await currentPersonId();

  if (policy.kind === "session") {
    const outcome: Outcome = personId
      ? { decision: "allow", reason: null, required: {} }
      : { decision: refuse, reason: "not_signed_in", required: {} };
    await recordDecision({ surface: "api", route, method, mode, personId, outcome });
    return outcome;
  }

  if (policy.kind === "admin") {
    const admin = personId ? await currentAdmin() : null;
    const outcome: Outcome = admin
      ? { decision: "allow", reason: null, required: { permission: ["platform.admin"] } }
      : { decision: refuse, reason: "not_a_platform_admin", required: { permission: ["platform.admin"] } };
    await recordDecision({ surface: "api", route, method, mode, personId, outcome });
    return outcome;
  }

  // A member of a business.
  const body = await readBody(request, method);
  const action = typeof body.action === "string" ? body.action : null;

  const whenResult = policy.when ? policy.when(body) : null;
  if (whenResult === "public") return null;

  let rule: MemberRule = { permission: policy.permission, capability: policy.capability, gap: policy.gap };
  if (policy.byAction) {
    const actionRule = action ? policy.byAction[action] : undefined;
    if (!actionRule) {
      // The route itself refuses an action it does not know.
      await recordDecision({
        surface: "api", route, method, mode, action, personId,
        outcome: { decision: "not_applicable", reason: "unknown_action_route_refuses_it", required: {} },
      });
      return null;
    }
    rule = mergeRules(rule, actionRule);
  }
  rule = mergeRules(rule, whenResult);

  let outcome: Outcome;
  let ctx = null;
  if (!personId) {
    outcome = { decision: refuse, reason: "not_signed_in", required: {} };
  } else {
    const businessId = await resolveBusinessId(policy.business, personId, {
      body,
      url: new URL(request.url),
      params: context?.params,
    });
    ctx = await resolveAuthority(personId, businessId);
    outcome = decideMember(ctx, rule, refuse);
  }

  await recordDecision({
    surface: "api", route, method, mode, action,
    personId,
    businessId: ctx?.businessId ?? null,
    membershipId: ctx?.membershipId ?? null,
    role: ctx?.role ?? null,
    outcome,
  });
  return outcome;
}

export function withAuthority<C extends RouteContext>(
  route: string,
  method: Method,
  handler: (request: NextRequest, context: C) => Promise<Response> | Response
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request: NextRequest, context: C) => {
    const enforced = routeEnforced(route);
    try {
      const outcome = await evaluate(route, method, request, context, enforced);
      if (enforced && outcome?.decision === "deny") return refusal(outcome.reason);
    } catch (e) {
      await recordDecision({
        surface: "api", route, method, mode: enforced ? "enforce" : "shadow",
        outcome: {
          decision: "error",
          reason: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          required: {},
        },
      });
      // An enforced route that cannot check access does not guess.
      if (enforced) return checkUnavailable();
    }
    return handler(request, context);
  };
}
