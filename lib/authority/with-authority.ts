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
import { ROUTE_POLICY, HIGH_RISK, type Method, type MemberRule } from "./policy";
import { resolveAuthority, resolveBusinessId, recordColumn, membershipRole, type AuthorityContext } from "./context";
import { supabaseServer } from "@/lib/supabase";
import { decideMember, mergeRules, needsAssignment, type Outcome } from "./decide";
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
  enforced: boolean,
  facts?: AuditFacts
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

  let rule: MemberRule = {
    permission: policy.permission,
    capability: policy.capability,
    assigned: policy.assigned,
    target: policy.target,
    location: policy.location,
    gap: policy.gap,
  };
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

    // Holding only the "assigned" form of a permission means the record must
    // be assigned to this person (staff and their own bookings or orders).
    if (outcome.decision === "allow" && needsAssignment(ctx, rule)) {
      const assignee = await recordColumn(policy.business, rule.assigned!.column, {
        body,
        params: context?.params,
      });
      if (!assignee || assignee !== ctx.membershipId) {
        outcome = { ...outcome, decision: refuse, reason: "not_assigned_to_you" };
      }
    }

    // A member limited to certain locations acts only in those (step 1e).
    if (outcome.decision === "allow" && rule.location && ctx.locationScope?.length) {
      const loc = rule.location === "body" ? body.locationId : new URL(request.url).searchParams.get("locationId");
      if (typeof loc === "string" && loc && !ctx.locationScope.includes(loc)) {
        outcome = { ...outcome, decision: refuse, reason: "outside_your_locations" };
      }
    }

    // Changing a manager or the owner needs more than managing staff.
    if (outcome.decision === "allow" && rule.target && ctx.businessId && !ctx.permissions.has(rule.target.requires)) {
      const targetId = body[rule.target.bodyField];
      // Changing yourself (a manager setting their own PIN) is not changing
      // "another manager".
      if (typeof targetId === "string" && targetId !== ctx.membershipId) {
        const targetRole = await membershipRole(targetId, ctx.businessId);
        if (targetRole && rule.target.elevated.includes(targetRole)) {
          outcome = { ...outcome, decision: refuse, reason: "cannot_manage_that_role" };
        }
      }
    }
  }

  await recordDecision({
    surface: "api", route, method, mode, action,
    personId,
    businessId: ctx?.businessId ?? null,
    membershipId: ctx?.membershipId ?? null,
    role: ctx?.role ?? null,
    outcome,
  });
  if (facts) Object.assign(facts, { rule, ctx, action, body, outcome });
  return outcome;
}

// What the audit needs to know about a member request, filled in by evaluate.
interface AuditFacts {
  rule?: MemberRule;
  ctx?: AuthorityContext | null;
  action?: string | null;
  body?: Record<string, unknown>;
  outcome?: Outcome;
}

// A high-risk action that ran is written to audit_log (Identity spec 13,
// PHASE_1_PLAN.md 3.7): who did it, under what authority, and why if they
// said. In shadow mode a high-risk action by someone the check would refuse
// is recorded too, marked as not authorised, because that is exactly what an
// owner would want to see. Never the reason a request fails.
async function auditHighRisk(route: string, method: Method, facts: AuditFacts, status: number): Promise<void> {
  try {
    if (status >= 400 || !facts.rule || !facts.outcome) return;
    const highRisk = (facts.rule.permission ?? []).filter((p) => HIGH_RISK.has(p));
    if (!highRisk.length) return;
    const ctx = facts.ctx;
    const held = highRisk.filter((p) => ctx?.permissions.has(p));
    const reason = typeof facts.body?.reason === "string" ? facts.body.reason : null;
    await supabaseServer().rpc("record_audit", {
      p: {
        business_id: ctx?.businessId ?? "",
        actor_person_id: ctx?.personId ?? "",
        actor_membership_id: ctx?.membershipId ?? "",
        action: "high_risk:" + route + ":" + method + (facts.action ? ":" + facts.action : ""),
        reason: reason ?? "",
        authorization_source:
          facts.outcome.decision === "allow"
            ? "role:" + (ctx?.role ?? "unknown") + " (" + held.join(", ") + ")"
            : "not authorised (" + (facts.outcome.reason ?? "refused") + ", shadow)",
        detail: { route, method, action: facts.action ?? null, status, required: highRisk },
      },
    });
  } catch {
    // Swallowed on purpose; see above.
  }
}

export function withAuthority<C extends RouteContext>(
  route: string,
  method: Method,
  handler: (request: NextRequest, context: C) => Promise<Response> | Response
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request: NextRequest, context: C) => {
    const enforced = routeEnforced(route);
    const facts: AuditFacts = {};
    try {
      const outcome = await evaluate(route, method, request, context, enforced, facts);
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
    const response = await handler(request, context);
    await auditHighRisk(route, method, facts, response.status);
    return response;
  };
}
