import "server-only";

import { supabaseServer } from "@/lib/supabase";

// Work that other product sets raise in Office.
//
// The Office PRD (26) asks for packing tasks from Shop and reconciliation
// exceptions from POS. create_linked_task was written for exactly this and
// had never been called from anywhere, which is why the task table was
// empty since the day it was built.
//
// Called from the app rather than from a database trigger. 0060 adds the
// triggers as well, and the two are safe together: create_linked_task
// deduplicates on business, source and title, so whichever runs first wins
// and the second returns the same task. The trigger is the stronger of the
// two because no code path can forget it; this is what makes the feature
// work in the meantime.
//
// Nothing here may ever fail its caller. An order must not fail to be
// fulfilled, and a shift must not fail to close, because a task could not
// be written. Every function returns quietly and records the reason.

async function raise(
  businessId: string,
  task: {
    title: string;
    detail?: string | null;
    assignedMembershipId?: string | null;
    sourceEntityType: string;
    sourceEntityId: string;
  }
): Promise<void> {
  const db = supabaseServer();
  try {
    const { error } = await db.rpc("create_linked_task", {
      p: {
        business_id: businessId,
        title: task.title,
        detail: task.detail ?? null,
        assigned_membership_id: task.assignedMembershipId ?? "",
        source_entity_type: task.sourceEntityType,
        source_entity_id: task.sourceEntityId,
      },
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    // Written where support can find it, then swallowed.
    await db
      .from("audit_log")
      .insert({
        business_id: businessId,
        action: "office.task.failed",
        entity_type: task.sourceEntityType,
        entity_id: task.sourceEntityId,
        detail: { error: err instanceof Error ? err.message : "unknown" },
      })
      .then(
        () => undefined,
        () => undefined
      );
  }
}

// A confirmed order needs packing. A finished one does not, so the task is
// closed rather than left on somebody's list: the difference between a task
// list and a graveyard.
export async function shopOrderWork(
  orderId: string,
  toStatus: string
): Promise<void> {
  const db = supabaseServer();

  if (toStatus === "confirmed") {
    const { data: order } = await db
      .from("shop_order")
      .select("id, business_id, total, placed_at, assigned_membership_id, customer:customer_id(display_name)")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const customer =
      (order.customer as unknown as { display_name: string } | null)?.display_name ??
      "a customer";
    const placed = order.placed_at
      ? new Date(order.placed_at).toLocaleDateString("en-GH", {
          day: "numeric",
          month: "short",
        })
      : "";

    await raise(order.business_id, {
      title: `Pack order for ${customer}`,
      detail: `Order placed ${placed}, ${Number(order.total ?? 0).toFixed(2)} GHS`,
      // Unassigned is fine and common: a small team picks work up rather
      // than being handed it.
      assignedMembershipId: order.assigned_membership_id,
      sourceEntityType: "shop_order",
      sourceEntityId: order.id,
    });
    return;
  }

  if (["fulfilled", "cancelled", "refunded"].includes(toStatus)) {
    await db
      .from("task")
      .update({
        status: toStatus === "fulfilled" ? "done" : "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("source_entity_type", "shop_order")
      .eq("source_entity_id", orderId)
      .in("status", ["open", "in_progress", "blocked"]);
  }
}

// A till that does not balance is somebody's problem tomorrow morning.
//
// Only where the money is actually out. Two cedis of rounding across a
// day's takings is not an exception, and a task for every closed shift
// would train an owner to ignore the list, which is worse than not having
// one at all.
const VARIANCE_THRESHOLD = 2;

export async function shiftVarianceWork(
  shiftId: string,
  difference: number | null
): Promise<void> {
  if (difference === null || Math.abs(difference) < VARIANCE_THRESHOLD) return;

  const db = supabaseServer();
  const { data: shift } = await db
    .from("pos_shift")
    .select("id, business_id, closed_at, difference_note, cashier:cashier_membership_id(person:person_id(full_name))")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return;

  const cashier =
    (shift.cashier as unknown as { person: { full_name: string } | null } | null)
      ?.person?.full_name ?? "A cashier";
  const when = new Date(shift.closed_at ?? Date.now()).toLocaleString("en-GH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const amount = Math.abs(difference).toFixed(2);

  await raise(shift.business_id, {
    title:
      difference < 0
        ? `Till short by ${amount} GHS`
        : `Till over by ${amount} GHS`,
    detail:
      `${cashier}, shift closed ${when}` +
      (shift.difference_note ? `. Note: ${shift.difference_note}` : ""),
    sourceEntityType: "pos_shift",
    sourceEntityId: shift.id,
  });
}
