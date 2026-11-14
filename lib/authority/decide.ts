// The decision itself: given what a route or page requires and who is
// asking, allow or refuse, and say why. Pure, so it can be tested without a
// database.

import type { AuthorityContext } from "./context";
import type { MemberRule } from "./policy";

export type Decision = "allow" | "would_deny" | "deny" | "not_applicable" | "error";

export interface Outcome {
  decision: Decision;
  reason: string | null;
  required: { permission?: string[]; capability?: string[]; gap?: string };
}

export function decideMember(ctx: AuthorityContext, rule: MemberRule, refuse: Decision): Outcome {
  const required = {
    ...(rule.permission?.length ? { permission: rule.permission } : {}),
    ...(rule.capability?.length ? { capability: rule.capability } : {}),
    ...(rule.gap ? { gap: rule.gap } : {}),
  };

  if (!ctx.active) return { decision: refuse, reason: ctx.whyNot ?? "not_a_member", required };

  if (rule.capability?.length && !rule.capability.some((c) => ctx.capabilities.has(c))) {
    return { decision: refuse, reason: "business_lacks_capability", required };
  }

  if (rule.permission?.length && !rule.permission.some((p) => ctx.permissions.has(p))) {
    return { decision: refuse, reason: "missing_permission", required };
  }

  return { decision: "allow", reason: rule.gap ? "allowed_membership_only_gap" : null, required };
}

/** True when the person can act only through the "assigned" permission, so
 *  the record must be theirs. */
export function needsAssignment(ctx: AuthorityContext, rule: MemberRule): boolean {
  if (!rule.assigned) return false;
  const others = (rule.permission ?? []).filter((p) => p !== rule.assigned!.permission);
  return ctx.permissions.has(rule.assigned.permission) && !others.some((p) => ctx.permissions.has(p));
}

/** Merge a route's base rule with an action- or body-specific one. The more
 *  specific rule replaces the base where it says something. */
export function mergeRules(base: MemberRule, specific: MemberRule | null | undefined): MemberRule {
  if (!specific) return base;
  return {
    permission: specific.permission ?? base.permission,
    capability: specific.capability ?? base.capability,
    assigned: specific.assigned ?? base.assigned,
    target: specific.target ?? base.target,
    gap: specific.gap ?? base.gap,
  };
}
