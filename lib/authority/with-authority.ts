import "server-only";

// The one authority check in front of every API route (Phase 1, step 1b).
//
// SHADOW MODE: it works out what the decision would be, records it in
// authority_decision, and then calls the route exactly as before. It never
// changes a response, and any failure inside it is caught and recorded as
// "error" rather than reaching the person using the app. Enforcement is
// switched on route group by route group in step 1c, once the log and the
// route-by-role test agree.
//
// Every exported handler in app/api must be wrapped by this function;
// scripts/check-authority.mjs fails the build check if one is not.

import type { NextRequest } from "next/server";
import { currentPersonId } from "@/lib/auth/session";
import { currentAdmin } from "@/lib/auth/admin";
import { ROUTE_POLICY, type Method, type MemberRule } from "./policy";
import { resolveAuthority, resolveBusinessId } from "./context";
import { decideMember, mergeRules, type Outcome } from "./decide";
import { recordDecision, AUTHORITY_MODE } from "./log";

const REFUSE = AUTHORITY_MODE === "shadow" ? "would_deny" : "deny";

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

async function evaluate(route: string, method: Method, request: NextRequest, context: RouteContext) {
  const policy = ROUTE_POLICY[route]?.[method];
  if (!policy) {
    await recordDecision({
      surface: "api", route, method,
      outcome: { decision: REFUSE, reason: "no_policy_for_route", required: {} },
    });
    return;
  }

  // Routes that are not about a member of a business check themselves today
  // (a pairing code, a shared token, a device token, the cron secret). They
  // are recorded only where there is a person to check.
  if (policy.kind === "public" || policy.kind === "webhook" || policy.kind === "cron" || policy.kind === "device") {
    return;
  }

  const personId = await currentPersonId();

  if (policy.kind === "session") {
    await recordDecision({
      surface: "api", route, method, personId,
      outcome: personId
        ? { decision: "allow", reason: null, required: {} }
        : { decision: REFUSE, reason: "not_signed_in", required: {} },
    });
    return;
  }

  if (policy.kind === "admin") {
    const admin = personId ? await currentAdmin() : null;
    await recordDecision({
      surface: "api", route, method, personId,
      outcome: admin
        ? { decision: "allow", reason: null, required: { permission: ["platform.admin"] } }
        : { decision: REFUSE, reason: "not_a_platform_admin", required: { permission: ["platform.admin"] } },
    });
    return;
  }

  // A member of a business.
  const body = await readBody(request, method);
  const action = typeof body.action === "string" ? body.action : null;

  const whenResult = policy.when ? policy.when(body) : null;
  if (whenResult === "public") return;

  let rule: MemberRule = { permission: policy.permission, capability: policy.capability, gap: policy.gap };
  if (policy.byAction) {
    const actionRule = action ? policy.byAction[action] : undefined;
    if (!actionRule) {
      await recordDecision({
        surface: "api", route, method, action, personId,
        outcome: { decision: "not_applicable", reason: "unknown_action_route_refuses_it", required: {} },
      });
      return;
    }
    rule = mergeRules(rule, actionRule);
  }
  rule = mergeRules(rule, whenResult);

  let outcome: Outcome;
  let ctx = null;
  if (!personId) {
    outcome = { decision: REFUSE, reason: "not_signed_in", required: {} };
  } else {
    const businessId = await resolveBusinessId(policy.business, personId, {
      body,
      url: new URL(request.url),
      params: context?.params,
    });
    ctx = await resolveAuthority(personId, businessId);
    outcome = decideMember(ctx, rule, REFUSE);
  }

  await recordDecision({
    surface: "api", route, method, action,
    personId,
    businessId: ctx?.businessId ?? null,
    membershipId: ctx?.membershipId ?? null,
    role: ctx?.role ?? null,
    outcome,
  });
}

export function withAuthority<C extends RouteContext>(
  route: string,
  method: Method,
  handler: (request: NextRequest, context: C) => Promise<Response> | Response
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request: NextRequest, context: C) => {
    try {
      await evaluate(route, method, request, context);
    } catch (e) {
      await recordDecision({
        surface: "api", route, method,
        outcome: {
          decision: "error",
          reason: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          required: {},
        },
      });
    }
    // Shadow mode: the route always runs, exactly as before.
    return handler(request, context);
  };
}
