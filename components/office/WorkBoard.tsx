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

export interface TeamOption {
  membershipId: string;
  name: string;
}

export interface LeaveRow {
  id: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: string;
  isSelf: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  detail: string | null;
  customerName: string | null;
  dueOn: string | null;
  tasksTotal: number;
  tasksDone: number;
  milestonesTotal: number;
  milestonesReached: number;
  nextMilestone: string | null;
  nextMilestoneDue: string | null;
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
  team,
  leave,
  projects,
}: {
  checkedIn: boolean;
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  team: TeamOption[];
  leave: LeaveRow[];
  projects: ProjectRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExpense, setShowExpense] = useState(false);
  const [amount, setAmount] = useState("");
  const [detail, setDetail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showTask, setShowTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetail, setTaskDetail] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [showLeave, setShowLeave] = useState(false);
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [showProject, setShowProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDue, setProjectDue] = useState("");
  const [projectSteps, setProjectSteps] = useState("");

  async function askForLeave() {
    if (!leaveFrom || !leaveTo) {
      setError("Say which days you need off.");
      return;
    }
    setBusy("leave");
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_leave",
          // A day off means the whole day, so the range covers both ends.
          startsAt: new Date(`${leaveFrom}T00:00:00`).toISOString(),
          endsAt: new Date(`${leaveTo}T23:59:59`).toISOString(),
          detail: leaveReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not send that request. Tap again.");
        return;
      }
      setShowLeave(false);
      setLeaveFrom("");
      setLeaveTo("");
      setLeaveReason("");
      setNotice("Asked. Your manager decides it.");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function addProject() {
    if (projectName.trim().length < 2) {
      setError("Give the job a name.");
      return;
    }
    setBusy("project");
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_project",
          name: projectName,
          dueOn: projectDue || undefined,
          // One step per line, which is how somebody writes a list when
          // nobody has given them a form for it.
          milestones: projectSteps
            .split(/\r?\n/)
            .map((line) => ({ title: line.trim() }))
            .filter((m) => m.title),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not save that job. Tap again.");
        return;
      }
      setShowProject(false);
      setProjectName("");
      setProjectDue("");
      setProjectSteps("");
      setNotice("Job added.");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function addTask() {
    if (taskTitle.trim().length < 2) {
      setError("Say what needs doing.");
      return;
    }
    setBusy("new-task");
    setError(null);
    try {
      const res = await fetch("/api/office/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_task",
          title: taskTitle,
          detail: taskDetail,
          assigneeMembershipId: taskAssignee || undefined,
          // A date with no time means the end of that day, which is what a
          // person means when they say "by Friday".
          dueAt: taskDue ? new Date(`${taskDue}T17:00:00`).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We could not add that. Tap again.");
        return;
      }
      setShowTask(false);
      setTaskTitle("");
      setTaskDetail("");
      setTaskAssignee("");
      setTaskDue("");
      setNotice("Added to the list.");
      router.refresh();
    } catch {
      setError("We could not reach the network just now. Tap again in a moment.");
    } finally {
      setBusy(null);
    }
  }

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
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-muted">What you need to do</h2>
          {!showTask && (
            <button
              onClick={() => setShowTask(true)}
              className="tap text-sm font-semibold text-teal-dark"
            >
              Add something
            </button>
          )}
        </div>

        {showTask && (
          <div className="mt-3 border border-line bg-white p-4">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs doing?"
              aria-label="What needs doing"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none"
            />
            <input
              value={taskDetail}
              onChange={(e) => setTaskDetail(e.target.value)}
              placeholder="Anything else worth knowing"
              aria-label="Task detail"
              className="mt-2 w-full border border-line px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none"
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {/* Unassigned is allowed and common: a small team picks work
                  up rather than being handed it. */}
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                aria-label="Who should do it"
                className="w-full border border-line bg-white px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
              >
                <option value="">Anyone on the team</option>
                {team.map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                aria-label="When it is needed by"
                className="w-full border border-line px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={addTask}
                disabled={busy === "new-task"}
                className="tap border border-teal bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "new-task" ? "Adding..." : "Add it to the list"}
              </button>
              <button
                onClick={() => setShowTask(false)}
                className="tap border border-line px-4 py-2 text-sm font-medium text-ink-slate"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

      {/* Jobs with more than one step to them. A caterer with a wedding in
          three weeks needs to know what is left, not a Gantt chart. */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-muted">Jobs on</h2>
          {!showProject && (
            <button
              onClick={() => setShowProject(true)}
              className="tap text-sm font-semibold text-teal-dark"
            >
              Start a job
            </button>
          )}
        </div>

        {showProject && (
          <div className="mt-3 border border-line bg-white p-4">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="What is the job?"
              aria-label="Job name"
              className="w-full border border-line px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none"
            />
            <input
              type="date"
              value={projectDue}
              onChange={(e) => setProjectDue(e.target.value)}
              aria-label="When the job is due"
              className="mt-2 w-full border border-line px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
            />
            <textarea
              value={projectSteps}
              onChange={(e) => setProjectSteps(e.target.value)}
              rows={4}
              placeholder={"The steps, one per line\nBook the venue\nConfirm the menu\nDeliver"}
              aria-label="Steps, one per line"
              className="mt-2 w-full border border-line px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={addProject}
                disabled={busy === "project"}
                className="tap border border-teal bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "project" ? "Saving..." : "Save the job"}
              </button>
              <button
                onClick={() => setShowProject(false)}
                className="tap border border-line px-4 py-2 text-sm font-medium text-ink-slate"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {projects.length === 0 ? (
            <p className="border border-line bg-white px-4 py-4 text-sm text-ink-muted">
              No jobs on at the moment.
            </p>
          ) : (
            projects.map((p) => (
              <div key={p.id} className="border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{p.name}</p>
                  <p className="num text-xs font-bold text-ink-muted">
                    {p.milestonesReached}/{p.milestonesTotal || 0} steps
                    {p.tasksTotal > 0 && ` · ${p.tasksDone}/${p.tasksTotal} tasks`}
                  </p>
                </div>
                <p className="text-xs text-ink-muted">
                  {p.nextMilestone ? `Next: ${p.nextMilestone}` : "Nothing left on the list"}
                  {p.dueOn && ` · due ${formatDue(p.dueOn)}`}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Time off. Staff ask constantly and there has never been anywhere
          to do it, so it was asked for over WhatsApp and forgotten. */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-muted">Time off</h2>
          {!showLeave && (
            <button
              onClick={() => setShowLeave(true)}
              className="tap text-sm font-semibold text-teal-dark"
            >
              Ask for days off
            </button>
          )}
        </div>

        {showLeave && (
          <div className="mt-3 border border-line bg-white p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-muted">
                First day
                <input
                  type="date"
                  value={leaveFrom}
                  onChange={(e) => setLeaveFrom(e.target.value)}
                  className="mt-1 w-full border border-line px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
                />
              </label>
              <label className="text-xs font-medium text-ink-muted">
                Last day
                <input
                  type="date"
                  value={leaveTo}
                  onChange={(e) => setLeaveTo(e.target.value)}
                  className="mt-1 w-full border border-line px-3 py-2.5 text-ink focus:border-teal focus:outline-none"
                />
              </label>
            </div>
            <input
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Why, if you want to say"
              aria-label="Reason"
              className="mt-2 w-full border border-line px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-teal focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={askForLeave}
                disabled={busy === "leave"}
                className="tap border border-teal bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "leave" ? "Asking..." : "Ask for these days"}
              </button>
              <button
                onClick={() => setShowLeave(false)}
                className="tap border border-line px-4 py-2 text-sm font-medium text-ink-slate"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {leave.length > 0 && (
          <div className="mt-3 space-y-2">
            {leave.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-line bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {l.isSelf ? "You" : l.staffName}
                    {l.reason && `, ${l.reason}`}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDue(l.startsAt)} to {formatDue(l.endsAt)}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap px-2.5 py-[3px] text-xs font-bold ${
                    l.status === "approved"
                      ? "bg-teal-light text-teal-dark"
                      : l.status === "declined"
                        ? "bg-danger-tint text-danger-ink"
                        : "bg-gold-light text-gold-ink"
                  }`}
                >
                  {l.status === "requested"
                    ? "Waiting"
                    : l.status === "approved"
                      ? "Agreed"
                      : "Not agreed"}
                </span>
              </div>
            ))}
          </div>
        )}
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
