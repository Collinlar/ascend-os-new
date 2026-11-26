import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/shell/Module";
import { EmptyState, primaryAction } from "@/components/shell/Page";
import { Avatar, StatusPill, Tag, type Tone } from "@/components/shell/Parts";
import { Icon, type IconName } from "@/components/shell/icons";
import { AttendanceButton, Shortcuts } from "@/components/office/OfficeForms";
import { MODULES, officeTabs } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { supabaseServer } from "@/lib/supabase";
import { formatGHS } from "@/lib/money";
import { loadCommandCentre } from "@/lib/office/command-centre";
import { loadSchedule } from "@/lib/office/schedule";
import {
  KIND_LABEL,
  loadApprovals,
  loadAttendance,
  loadMembers,
  loadTasks,
  officeContext,
  type BoardTask,
  type OfficeContext,
} from "@/lib/office/load";

export const dynamic = "force-dynamic";

// Office, Today (Modules M2; Office PRD 13 and 27).
//
// Where an owner starts the day: what needs them first, then the work in
// hand, then who is here and what is on. A member of staff gets their own
// day instead: their hours, their tasks and the requests they have made.
// That is a privacy rule as much as a layout one; a cashier has no business
// seeing what the team spent or who asked for Friday off (OFF-MOB-026).

const ACCRA = "Africa/Accra";
const accraDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: ACCRA });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" });

function greeting(): string {
  const hour = Number(new Date().toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function OfficeToday({ searchParams }: { searchParams: { new?: string } }) {
  await checkPageAccess("/work");
  const ctx = await officeContext();
  // A business that holds nothing Office carries has no Office. Send it to
  // where it can add something, as Services and Shop do.
  if (ctx === "not_included") redirect("/grow");
  if (ctx === "signed_out" || ctx === "unreadable") {
    return (
      <ModulePage identity={MODULES.office}>
        <EmptyState
          title={ctx === "signed_out" ? "Sign in to see your work." : "We could not open Office just now."}
          detail={ctx === "signed_out" ? "We send a code to the WhatsApp number your business is set up with." : "Refresh in a moment. Nothing has changed."}
        />
      </ModulePage>
    );
  }
  return ctx.runsThePlace ? <ManagerToday ctx={ctx} openForm={searchParams.new} /> : <StaffToday ctx={ctx} />;
}

// ------------------------------------------------------------ the business --

async function ManagerToday({ ctx, openForm }: { ctx: OfficeContext; openForm?: string }) {
  const m = ctx.modules;
  const db = supabaseServer();
  const [members, tasks, approvals, attendance, centre, schedule, projects] = await Promise.all([
    loadMembers(ctx.businessId),
    m.tasks ? loadTasks(ctx) : Promise.resolve([] as BoardTask[]),
    m.approvals ? loadApprovals(ctx) : Promise.resolve([]),
    m.attendance ? loadAttendance(ctx.businessId) : Promise.resolve(null),
    m.commandCentre ? loadCommandCentre(ctx.businessId).catch(() => null) : Promise.resolve(null),
    m.schedule ? loadSchedule(ctx.businessId).catch(() => []) : Promise.resolve([]),
    m.projects ? db.rpc("business_projects", { p_business: ctx.businessId }) : Promise.resolve({ data: null }),
  ]);

  const today = accraDay(new Date());
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.dueAt && accraDay(new Date(t.dueAt)) < today);
  const dueToday = open.filter((t) => t.dueAt && accraDay(new Date(t.dueAt)) === today);
  const waitingOnOthers = open.filter((t) => t.status === "blocked");
  const waiting = approvals.filter((a) => a.status === "requested" && !a.isOwnRequest);
  const waitingAmount = waiting.reduce((n, a) => n + (a.amount ?? 0), 0);
  const inNow = attendance ? members.filter((p) => attendance.get(p.membershipId)?.inSince) : [];
  const onLeave = attendance ? members.filter((p) => attendance.get(p.membershipId)?.onLeaveUntil) : [];
  const meIn = attendance?.get(ctx.membershipId)?.inSince ?? null;
  const needs = waiting.length + overdue.length + dueToday.length;

  const figures: Array<{ label: string; value: string; sub: string; href?: string; icon: IconName; tone?: "bad" | "warn" }> = [];
  if (m.tasks)
    figures.push({
      label: "Due today",
      value: `${dueToday.length} task${dueToday.length === 1 ? "" : "s"}`,
      sub: overdue.length ? `${overdue.length} overdue from before today` : "Nothing overdue",
      href: "/work/board",
      icon: "clipboard",
      tone: overdue.length ? "warn" : undefined,
    });
  if (m.approvals)
    figures.push({
      label: "Awaiting approval",
      value: `${waiting.length} request${waiting.length === 1 ? "" : "s"}`,
      sub: waitingAmount > 0 ? `${formatGHS(waitingAmount)} waiting on you` : waiting.length ? "No money involved" : "Nothing waiting",
      href: "/work/approvals",
      icon: "shield",
    });
  if (m.tasks)
    figures.push({
      label: "At risk",
      value: `${overdue.length + waitingOnOthers.length} item${overdue.length + waitingOnOthers.length === 1 ? "" : "s"}`,
      sub:
        overdue.length + waitingOnOthers.length === 0
          ? "Nothing late or stuck"
          : [overdue.length && `${overdue.length} overdue`, waitingOnOthers.length && `${waitingOnOthers.length} waiting on someone`].filter(Boolean).join(", "),
      href: "/work/board",
      icon: "alert",
      tone: overdue.length + waitingOnOthers.length ? "bad" : undefined,
    });
  if (attendance)
    figures.push({
      label: "Team in today",
      value: `${inNow.length} of ${members.length}`,
      sub: onLeave.length ? `${onLeave.length} on agreed time off` : inNow.length ? "Checked in now" : "Nobody checked in yet",
      href: "/team",
      icon: "users",
    });

  // What needs this person first, the one thing to do on each.
  const priority: Array<{ id: string; icon: IconName; tone: string; title: string; sub: string; href: string; cta: string }> = [
    ...waiting.slice(0, 5).map((a) => ({
      id: a.id,
      icon: "shield" as IconName,
      tone: "bg-gold-100 text-gold-700",
      title: `${KIND_LABEL[a.kind] ?? a.kind}${a.amount !== null ? ` of ${formatGHS(a.amount)}` : ""} from ${a.requesterName}`,
      sub: `${a.receipt ? `Receipt ${a.receipt} · ` : ""}asked ${shortDay(a.createdAt)} at ${clock(a.createdAt)}`,
      href: `/work/approvals?id=${a.id}`,
      cta: "Decide",
    })),
    ...overdue.slice(0, 4).map((t) => ({
      id: t.id,
      icon: "alert" as IconName,
      tone: "bg-danger-tint text-danger-ink",
      title: t.title,
      sub: `Was due ${shortDay(t.dueAt!)}${t.assigneeName ? ` · ${t.assigneeName}` : " · nobody has it"}`,
      href: "/work/board",
      cta: "Open board",
    })),
    ...dueToday.slice(0, 4).map((t) => ({
      id: t.id,
      icon: "clipboard" as IconName,
      tone: "bg-teal-50 text-teal-800",
      title: t.title,
      sub: `Due today${t.assigneeName ? ` · ${t.assigneeName}` : " · nobody has it"}`,
      href: "/work/board",
      cta: "Open board",
    })),
  ];

  const jobs = ((projects.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    dueOn: (p.due_on as string | null) ?? null,
    done: Number(p.tasks_done ?? 0),
    total: Number(p.tasks_total ?? 0),
    stepsDone: Number(p.milestones_reached ?? 0),
    steps: Number(p.milestones_total ?? 0),
    next: (p.next_milestone as string | null) ?? null,
  }));
  const people = (jobId: string) =>
    Array.from(new Set(tasks.filter((t) => t.projectId === jobId && t.assigneeName).map((t) => t.assigneeName as string))).slice(0, 4);

  const todaysSchedule = schedule.filter((e) => accraDay(new Date(e.at)) === today);
  const first = ctx.personName.split(/\s+/)[0] || ctx.personName;
  const team = members.map((p) => ({ membershipId: p.membershipId, name: p.name }));
  const lacksTeamPass = ctx.roleKey === "owner" && !ctx.capabilities.has("office.work");

  return (
    <ModulePage
      identity={MODULES.office}
      tabs={officeTabs(ctx.capabilities, "/work", { runsThePlace: true, waiting: waiting.length })}
      action={
        m.projects ? (
          <Link href="/work?new=task" className={primaryAction}>
            <Icon name="plus" size={16} />
            New task
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-neutral-600">
              {new Date().toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "long", day: "numeric", month: "long" })}
              {ctx.locationName ? ` · ${ctx.locationName}` : ""}
            </span>
            <h2 className="font-heading text-[22px] font-extrabold leading-tight text-ink-heading">
              {greeting()}, {first}. {needs === 0 ? "Nothing needs you right now." : `${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you.`}
            </h2>
          </div>
          {centre && centre.openShifts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {centre.openShifts.map((s) => (
                <StatusPill key={s.id} tone="ok">
                  {s.locationName ?? "A till"} selling since {clock(s.openedAt)}
                </StatusPill>
              ))}
            </div>
          )}
        </div>

        {figures.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {figures.map((f) => {
              const body = (
                <>
                  <span className="flex items-center justify-between text-[12.5px] text-neutral-600">
                    {f.label}
                    <span className={f.tone === "bad" ? "text-danger-ink" : f.tone === "warn" ? "text-gold-700" : "text-teal-700"}>
                      <Icon name={f.icon} size={17} />
                    </span>
                  </span>
                  <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{f.value}</span>
                  <span className={`text-xs ${f.tone === "bad" ? "text-danger-ink" : f.tone === "warn" ? "text-gold-700" : "text-neutral-600"}`}>{f.sub}</span>
                </>
              );
              return f.href ? (
                <Link key={f.label} href={f.href} className="tap flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5 hover:border-teal-brand">
                  {body}
                </Link>
              ) : (
                <div key={f.label} className="flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-4 py-3.5">
                  {body}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <Card title="Needs you first" aside={<span className="hidden text-xs text-neutral-600 sm:inline">The next action on each</span>}>
              {priority.length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing is waiting on you. No requests, nothing late, nothing due today.</p>
              ) : (
                <div className="flex flex-col">
                  {priority.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                      <span className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] ${p.tone}`}>
                        <Icon name={p.icon} size={17} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[13.5px] font-semibold text-ink">{p.title}</span>
                        <span className="truncate text-xs text-neutral-600">{p.sub}</span>
                      </span>
                      <Link href={p.href} className="tap flex min-h-[40px] flex-none items-center rounded-[10px] border border-line-brand px-3 text-[12.5px] font-bold text-teal-800 hover:border-teal-brand">
                        {p.cta}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {m.projects && (
              <Card title="Jobs in progress" aside={m.tasks ? <Link href="/work/board" className="tap text-[13px] font-semibold text-teal-dark">Open board</Link> : undefined}>
                {jobs.length === 0 ? (
                  <p className="text-sm text-neutral-600">No jobs on. Start one for anything with several steps: a refit, a wedding order, a launch.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {jobs.map((j) => {
                      const total = j.total || j.steps;
                      const done = j.total ? j.done : j.stepsDone;
                      const pct = total ? Math.round((done / total) * 100) : 0;
                      return (
                        <div key={j.id} className="flex flex-col gap-1.5 rounded-panel bg-neutral-100 px-3.5 py-3">
                          <span className="text-[13.5px] font-semibold text-ink">{j.name}</span>
                          <span className="text-xs text-neutral-600">
                            {total ? `${done} of ${total} ${j.total ? "tasks" : "steps"}` : "No steps yet"}
                            {j.dueOn ? ` · due ${shortDay(j.dueOn)}` : ""}
                          </span>
                          <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white">
                            <span className="block h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-700" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-neutral-600">{j.next ? `Next: ${j.next}` : "All steps reached"}</span>
                            <span className="flex -space-x-1.5">
                              {people(j.id).map((n) => (
                                <span key={n} className="rounded-full ring-2 ring-neutral-100">
                                  <Avatar name={n} size={24} />
                                </span>
                              ))}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {m.attendance && (
              <Card title="You">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] text-ink">{meIn ? `Checked in at ${clock(meIn)}` : "You are not checked in."}</span>
                  <AttendanceButton checkedIn={Boolean(meIn)} compact />
                </div>
              </Card>
            )}

            {attendance && (
              <Card title="Team today" aside={<Link href="/team" className="tap text-[13px] font-semibold text-teal-dark">Everyone</Link>}>
                <div className="flex flex-col gap-2.5">
                  {members.slice(0, 8).map((p) => {
                    const a = attendance.get(p.membershipId);
                    const st: { text: string; tone: Tone } = a?.inSince
                      ? { text: `In since ${clock(a.inSince)}`, tone: "ok" }
                      : a?.onLeaveUntil
                        ? { text: `Off until ${shortDay(a.onLeaveUntil)}`, tone: "info" }
                        : { text: "Not in", tone: "mute" };
                    return (
                      <div key={p.membershipId} className="flex items-center gap-2.5">
                        <Avatar name={p.name} size={30} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
                          {a?.inAt && <span className="truncate text-xs text-neutral-600">{a.inAt}</span>}
                        </span>
                        <StatusPill tone={st.tone}>{st.text}</StatusPill>
                      </div>
                    );
                  })}
                  {members.length > 8 && <span className="text-xs text-neutral-600">And {members.length - 8} more on People</span>}
                </div>
              </Card>
            )}

            {m.schedule && (
              <Card title="On today">
                {todaysSchedule.length === 0 ? (
                  <p className="text-sm text-neutral-600">Nothing booked, due or off today.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {todaysSchedule.slice(0, 8).map((e) => (
                      <div key={e.id} className="flex items-baseline gap-2.5 text-[13px]">
                        <strong className="num w-11 flex-none text-ink">{e.timed ? clock(e.at) : "Day"}</strong>
                        <span className="min-w-0 flex-1 text-ink">
                          {e.title}
                          {e.who && <span className="text-neutral-600"> · {e.who}</span>}
                        </span>
                        {e.kind === "booking" && <Tag>Services</Tag>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {centre && (
              <Card title="The last 7 days">
                <div className="grid grid-cols-3 gap-2">
                  <Pulse label="Tasks done" value={String(centre.pulse.tasksDone7d)} />
                  <Pulse label="Hours worked" value={String(centre.pulse.hoursWorked7d)} />
                  <Pulse label="Spent" value={formatGHS(centre.pulse.spend7d)} />
                </div>
              </Card>
            )}

            <Shortcuts
              modules={m}
              runsThePlace
              team={team}
              open={openForm === "task" && m.projects ? "task" : null}
              cleanHref="/work"
            />

            {lacksTeamPass && (
              <div className="flex flex-col gap-2 rounded-[20px] border border-gold-500/40 bg-gradient-to-br from-gold-100 to-white px-[18px] py-4">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-gold-700">
                  <Icon name="team" size={16} />
                  Office Team Pass
                </span>
                <span className="text-[14px] font-bold text-ink">Run the whole team from here</span>
                <span className="text-[12.5px] leading-relaxed text-neutral-700">
                  Jobs, spending and purchase approvals, time off and the team&apos;s week in one place. Paid for a year, from GHS 600 for up to 5 people.
                </span>
                <Link href="/billing" className="tap flex min-h-[40px] items-center gap-1 self-start text-[13px] font-bold text-gold-700">
                  See the Team Pass
                  <Icon name="chev" size={15} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModulePage>
  );
}

// ------------------------------------------------------------- one person --

async function StaffToday({ ctx }: { ctx: OfficeContext }) {
  const m = ctx.modules;
  const [tasks, approvals, attendance] = await Promise.all([
    m.tasks ? loadTasks(ctx) : Promise.resolve([] as BoardTask[]),
    m.approvals || m.leave || m.expenses || m.purchases ? loadApprovals(ctx) : Promise.resolve([]),
    m.attendance ? loadAttendance(ctx.businessId) : Promise.resolve(null),
  ]);
  const today = accraDay(new Date());
  const mine = tasks.filter((t) => t.status !== "done");
  const myRequests = approvals.filter((a) => a.isOwnRequest).slice(0, 8);
  const me = attendance?.get(ctx.membershipId);
  const first = ctx.personName.split(/\s+/)[0] || ctx.personName;

  return (
    <ModulePage identity={MODULES.office} tabs={officeTabs(ctx.capabilities, "/work", { runsThePlace: false })}>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <h2 className="font-heading text-[22px] font-extrabold leading-tight text-ink-heading">
            {greeting()}, {first}.
          </h2>
          {m.attendance && (
            <Card title="Your hours">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13.5px] text-ink">
                  {me?.inSince ? `Checked in at ${clock(me.inSince)}` : "You are not checked in."}
                  {me && me.daysThisWeek > 0 && <span className="text-neutral-600"> · {me.daysThisWeek} day{me.daysThisWeek === 1 ? "" : "s"} this week</span>}
                </span>
                <AttendanceButton checkedIn={Boolean(me?.inSince)} />
              </div>
            </Card>
          )}
          {m.tasks && (
            <Card title="Your work" aside={<Link href="/work/board" className="tap text-[13px] font-semibold text-teal-dark">Open board</Link>}>
              {mine.length === 0 ? (
                <p className="text-sm text-neutral-600">Nothing on your list.</p>
              ) : (
                <div className="flex flex-col">
                  {mine.slice(0, 10).map((t, i) => {
                    const late = t.dueAt && accraDay(new Date(t.dueAt)) < today;
                    return (
                      <div key={t.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-neutral-100" : ""}`}>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[13.5px] font-semibold text-ink">{t.title}</span>
                          <span className="text-xs text-neutral-600">
                            {t.assigneeId ? "Yours" : "Anyone can pick this up"}
                            {t.dueAt ? ` · due ${shortDay(t.dueAt)}` : ""}
                          </span>
                        </span>
                        {late && <StatusPill tone="bad">Overdue</StatusPill>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {myRequests.length > 0 && (
            <Card title="What you asked for">
              <div className="flex flex-col gap-2.5">
                {myRequests.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2.5 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-ink">{KIND_LABEL[a.kind] ?? a.kind}</span>
                      {a.amount !== null && <span className="text-neutral-600"> · {formatGHS(a.amount)}</span>}
                      {a.decisionNote && <span className="block text-xs text-neutral-600">&ldquo;{a.decisionNote}&rdquo;</span>}
                    </span>
                    <StatusPill tone={a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn"}>
                      {a.status === "approved" ? "Agreed" : a.status === "rejected" ? "Not agreed" : "Waiting"}
                    </StatusPill>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Shortcuts modules={m} runsThePlace={false} team={[]} />
        </div>
      </div>
    </ModulePage>
  );
}

// ---------------------------------------------------------------- pieces --

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-bold text-ink-heading">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Pulse({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-neutral-600">{label}</span>
      <strong className="num truncate font-heading text-[16px] text-ink">{value}</strong>
    </span>
  );
}
