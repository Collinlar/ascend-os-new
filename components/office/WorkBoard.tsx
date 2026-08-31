"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatGHS } from "@/lib/money";

export interface TaskRow {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  sourceType: string | null;
}

export interface ApprovalRow {
  id: string;
  kind: string;
  amount: number | null;
  createdAt: string;
  requesterName: string;
  isOwnRequest: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  shop_order: "From a shop order",
  service_booking: "From a booking",
  document: "From a document",
  sale: "From a sale",
};

const KIND_LABEL: Record<string, string> = {
  expense: "Money spent",
  refund: "Refund",
  discount: "Discount",
  purchase: "Purchase",
  leave: "Time off",
};

export default function WorkBoard({
  checkedIn,
  tasks,
  approvals,
}: {
  checkedIn: boolean;
  tasks: TaskRow[];
  approvals: ApprovalRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExpense, setShowExpense] = useState(false);
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function post(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not do that. Tap again.");
        return null;
      }
      router.refresh();
      return data;
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function submitExpense() {
    const value = parseFloat(amount);
    if (!(value > 0) || detail.trim().length < 2) {
      setError("Enter how much was spent and what it was for.");
      return;
    }
    const data = await post("expense", {
      action: "submit_expense",
      amount: value,
      detail: detail.trim(),
    });
    if (data) {
      setAmount("");
      setDetail("");
      setShowExpense(false);
      setNotice(
        data.needsApproval
          ? "Recorded. It needs approval before it counts as a cost."
          : "Recorded."
      );
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="border border-gold bg-gold-light px-4 py-3 text-sm text-gold-ink">
          {error}
        </p>
      )}
      {notice && (
        <p className="border border-teal bg-teal-light px-4 py-3 text-sm text-teal-dark">
          {notice}
        </p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white px-4 py-3">
        <p className="text-sm text-ink">
          {checkedIn ? "You are checked in." : "You are not checked in."}
        </p>
        <button
          onClick={() => post("attendance", { action: "attendance" })}
          disabled={busy === "attendance"}
          className="tap border border-teal px-4 py-2.5 text-sm font-medium text-teal-dark disabled:opacity-60"
        >
          {busy === "attendance"
            ? "Saving..."
            : checkedIn
              ? "Check out"
              : "Check in"}
        </button>
      </section>

      {approvals.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-muted">Waiting on a decision</h2>
          <div className="mt-3 space-y-2">
            {approvals.map((approval) => (
              <div
                key={approval.id}
                className="border border-l-4 border-line border-l-gold bg-white px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {KIND_LABEL[approval.kind] ?? approval.kind}
                      {approval.amount !== null && ` · ${formatGHS(approval.amount)}`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {approval.requesterName} · {timeAgo(approval.createdAt)}
                    </p>
                  </div>
                </div>

                {approval.isOwnRequest ? (
                  <p className="mt-3 text-sm text-ink-muted">
                    This is your own request. Someone else has to decide it.
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        post(approval.id, {
                          action: "decide_approval",
                          approvalId: approval.id,
                          approved: true,
                        })
                      }
                      disabled={busy === approval.id}
                      className="tap bg-teal px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        post(approval.id, {
                          action: "decide_approval",
                          approvalId: approval.id,
                          approved: false,
                        })
                      }
                      disabled={busy === approval.id}
                      className="tap border border-line px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-60"
                    >
                      Turn it down
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-ink-muted">What you need to do</h2>
        <div className="mt-3 space-y-2">
          {tasks.length === 0 ? (
            <p className="border border-line bg-white px-4 py-4 text-sm text-ink-muted">
              Nothing outstanding.
            </p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col justify-between gap-2 border border-line bg-white px-4 py-3 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{task.title}</p>
                  <p className="text-xs text-ink-muted">
                    {task.sourceType && SOURCE_LABEL[task.sourceType]
                      ? SOURCE_LABEL[task.sourceType]
                      : "Added by hand"}
                    {task.dueAt && ` · due ${formatDue(task.dueAt)}`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    post(task.id, { action: "complete_task", taskId: task.id })
                  }
                  disabled={busy === task.id}
                  className="tap self-start whitespace-nowrap border border-teal px-4 py-2 text-sm font-medium text-teal-dark disabled:opacity-60 sm:self-auto"
                >
                  {busy === task.id ? "Saving..." : "Mark done"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border border-line bg-white p-5">
        <h2 className="font-medium text-ink">Money you spent</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Record it here. Above your business&apos;s limit it goes for approval
          first.
        </p>

        {showExpense ? (
          <div className="mt-4 space-y-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="How much?"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="What was it for?"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-slate-grey focus:border-teal focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowExpense(false)}
                className="tap flex-1 border border-line py-2.5 text-sm font-medium text-ink"
              >
                Cancel
              </button>
              <button
                onClick={submitExpense}
                disabled={busy === "expense"}
                className="tap flex-[2] bg-teal py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy === "expense" ? "Saving..." : "Record it"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowExpense(true)}
            className="tap mt-3 w-full border border-teal px-4 py-3 font-medium text-teal-dark"
          >
            Record money spent
          </button>
        )}
      </section>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  if (today) return "today";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
