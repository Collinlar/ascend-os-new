import { ModulePage } from "@/components/shell/Module";
import { MODULES } from "@/lib/nav/modules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { activeMembership } from "@/lib/auth/active-business";
import PayDelivery from "@/components/inventory/PayDelivery";
import { checkPageAccess } from "@/lib/authority/page";
import { formatGHS } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/reporting/home";
import {
  KIND_LABEL,
  loadCashPosition,
  loadCategoryLabels,
  loadMovements,
  loadOwed,
  loadSupplierDebts,
  MOVEMENTS_LIMIT,
  type CashPosition,
  type MoneyMovement,
  type OwedRow,
  type SupplierDebt,
} from "@/lib/reporting/money";
import { EmptyState, FigureRow, Panel } from "@/components/shell/Page";

export const dynamic = "force-dynamic";

// Money (v3 design, D3), read from the Financial Foundation.
//
// The figures are kept apart as the Financial Foundation keeps them: money
// the business recorded itself, money a provider confirmed, money waiting
// to be paid out, money customers owe, and money the business owes its
// suppliers for stock (0134). They are never added together and there is
// no profit figure (FINANCIAL_FOUNDATION_PLAN.md decision 6). Below them,
// every movement of money in the month, who owes what, and what is owed.

const ACCRA = "Africa/Accra";

export default async function Money({ searchParams }: { searchParams: { tab?: string; month?: string } }) {
  await checkPageAccess("/money");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/signin");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
  const months = [0, 1, 2].map((back) => monthOf(today, back));
  const month = months.find((m) => m.key === searchParams.month) ?? months[0];
  const tab = searchParams.tab === "owed" ? "owed" : searchParams.tab === "you-owe" ? "you-owe" : "moves";

  const [position, movements, owed, debts, categories, member] = await Promise.all([
    loadCashPosition(workspace.businessId, month.from, month.to).catch(() => null),
    tab === "moves" ? loadMovements(workspace.businessId, month.from, month.to).catch(() => null) : Promise.resolve(null),
    tab === "owed" ? loadOwed(workspace.businessId).catch(() => null) : Promise.resolve(null),
    tab === "you-owe" ? loadSupplierDebts(workspace.businessId).catch(() => null) : Promise.resolve(null),
    loadCategoryLabels(workspace.businessId).catch(() => new Map<string, string>()),
    activeMembership<{ role: { key: string } | null }>(workspace.personId, "role:role_id(key)").catch(() => null),
  ]);
  // Paying a supplier needs stock rights (0134): owners and managers.
  const canPay = ["owner", "manager"].includes(member?.role?.key ?? "");

  const q = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const m = patch.month !== undefined ? patch.month : month.key === months[0].key ? null : month.key;
    const t = patch.tab !== undefined ? patch.tab : tab === "moves" ? null : tab;
    if (m) p.set("month", m);
    if (t) p.set("tab", t);
    const s = p.toString();
    return s ? `/money?${s}` : "/money";
  };

  return (
    <ModulePage identity={MODULES.money}>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {months.map((m) => {
          const on = m.key === month.key;
          return (
            <Link
              key={m.key}
              href={q({ month: m.key === months[0].key ? null : m.key })}
              aria-current={on ? "true" : undefined}
              className={`tap flex items-center whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold ${
                on ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
              }`}
            >
              {m.label}
            </Link>
          );
        })}
      </div>

      {position === null ? (
        <div className="mb-4">
          <EmptyState title="We could not load your money figures just now." detail="Nothing is lost. Refresh in a moment." />
        </div>
      ) : (
        <Figures position={position} monthLabel={month.label} categories={categories} />
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 [scrollbar-width:none]" role="tablist" aria-label="Money in and out, owed to you, or owed by you">
        {[
          { key: "moves", label: "Money in and out", href: q({ tab: null }) },
          { key: "owed", label: "Owed to you", href: q({ tab: "owed" }) },
          ...(position?.payables ? [{ key: "you-owe", label: "You owe", href: q({ tab: "you-owe" }) }] : []),
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={tab === t.key}
            className={`tap flex min-h-[44px] flex-none items-center whitespace-nowrap border-b-[2.5px] px-3.5 text-sm font-semibold ${
              tab === t.key ? "border-teal text-teal-800" : "border-transparent text-neutral-600 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "moves" ? (
        <Movements rows={movements} categories={categories} monthLabel={month.label} />
      ) : tab === "owed" ? (
        <Owed rows={owed} />
      ) : (
        <YouOwe debts={debts} businessId={workspace.businessId} canPay={canPay} />
      )}
    </ModulePage>
  );
}

// --------------------------------------------------------------- figures --

function Figures({
  position: p,
  monthLabel,
  categories,
}: {
  position: CashPosition;
  monthLabel: string;
  categories: Map<string, string>;
}) {
  const online = p.verified.received > 0 || p.pending.amount > 0;
  const figures: Array<{ label: string; value: string; sub?: string; tone?: "warn" | "bad" }> = [
    {
      // Cash only, so the line under it adds up to the figure. MoMo or card
      // the business entered itself is said beside it, not added in.
      label: "Cash, recorded by you",
      value: formatGHS(p.recorded.netCash),
      sub:
        [
          `${formatGHS(p.recorded.cashIn)} in`,
          p.recorded.cashRefunds > 0 ? `${formatGHS(p.recorded.cashRefunds)} handed back` : null,
          p.recorded.tillPaidOuts > 0 ? `${formatGHS(p.recorded.tillPaidOuts)} paid out` : null,
        ]
          .filter(Boolean)
          .join(", ") +
        (p.recorded.otherDeclaredIn > 0 ? `. Also ${formatGHS(p.recorded.otherDeclaredIn)} MoMo or card you entered, not confirmed` : ""),
    },
    {
      label: "Confirmed by MoMo or card",
      value: formatGHS(p.verified.net),
      sub: online
        ? p.verified.fees > 0
          ? `After ${formatGHS(p.verified.fees)} in fees`
          : "Confirmed by the provider"
        : "No online payments yet",
    },
  ];
  if (online) {
    figures.push({
      label: "Waiting to be paid out",
      value: formatGHS(p.pending.amount),
      sub: p.pending.payments > 0 ? `${p.pending.payments} payment${p.pending.payments === 1 ? "" : "s"}, as of now` : "Nothing waiting, as of now",
    });
  }
  figures.push({
    label: "Owed to you",
    value: formatGHS(p.receivables.outstanding),
    sub:
      p.receivables.outstanding === 0
        ? "Nothing outstanding, as of now"
        : p.receivables.overdue > 0
          ? `${formatGHS(p.receivables.overdue)} overdue, as of now`
          : `${p.receivables.count} still to be paid, as of now`,
    tone: p.receivables.overdue > 0 ? "warn" : undefined,
  });
  if (p.payables) {
    figures.push({
      label: "Owed to suppliers",
      value: formatGHS(p.payables.owed),
      sub:
        p.payables.owed === 0
          ? "Every delivery paid for, as of now"
          : p.payables.olderThan30 > 0
            ? `${formatGHS(p.payables.olderThan30)} from deliveries over 30 days old`
            : `${p.payables.deliveries} ${p.payables.deliveries === 1 ? "delivery" : "deliveries"} not paid yet, as of now`,
      tone: p.payables.olderThan30 > 0 ? "warn" : undefined,
    });
  }

  return (
    <>
      <FigureRow figures={figures} />
      <p className="-mt-1 mb-4 text-[12.5px] text-neutral-500">
        {monthLabel}. These are separate figures, never added together: there is no profit figure here.
        {p.notes.length > 0 && ` ${p.notes.join(" ")}`}
      </p>
      {p.expenses.total > 0 && (
        <Panel className="mb-4 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-base font-bold text-ink-heading">Business expenses</h2>
            <span className="num font-heading text-lg font-extrabold text-ink-heading">{formatGHS(p.expenses.total)}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">Stock you paid for and spending approved in Office, shown on their own rather than taken from the figures above.</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-neutral-700">
            {Object.entries(p.expenses.byCategory).map(([k, v]) => (
              <span key={k}>
                {categories.get(k) ?? k}: <strong className="num font-semibold text-ink">{formatGHS(Number(v))}</strong>
              </span>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ------------------------------------------------------------- movements --

const MOVE_COLS = "lg:grid lg:grid-cols-[120px_minmax(0,1fr)_200px_120px] lg:items-center lg:gap-4";

function Movements({
  rows,
  categories,
  monthLabel,
}: {
  rows: MoneyMovement[] | null;
  categories: Map<string, string>;
  monthLabel: string;
}) {
  if (rows === null) return <EmptyState title="We could not load your money just now." detail="Nothing is lost. Refresh in a moment." />;
  if (rows.length === 0)
    return <EmptyState title={`No money moved in ${monthLabel.toLowerCase()}.`} detail="Every payment in, refund and paid-out from the till lands here." />;
  return (
    <>
      {rows.length === MOVEMENTS_LIMIT && (
        <p className="mb-2 text-[12.5px] text-neutral-500">The latest {MOVEMENTS_LIMIT} in {monthLabel.toLowerCase()}.</p>
      )}
      <Panel>
        <div aria-hidden className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${MOVE_COLS}`}>
          <span>When</span>
          <span>What</span>
          <span>How</span>
          <span className="text-right">Amount</span>
        </div>
        {rows.map((r, i) => {
          const chip = howChip(r);
          const what = [
            KIND_LABEL[r.kind] ?? r.kind,
            r.category ? categories.get(r.category) ?? r.category : null,
            r.customerName,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] ${MOVE_COLS} ${
                i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"
              }`}
            >
              <span className="num w-full text-xs text-neutral-500 lg:w-auto lg:text-[13.5px]">{when(r.at)}</span>
              <span className="min-w-0 basis-full truncate text-ink lg:basis-auto">{what}</span>
              <span className="flex-none">
                <span className="sr-only">How: </span>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
              </span>
              <span className={`num ml-auto flex-none text-right font-bold lg:ml-0 lg:block ${r.direction === "out" ? "text-danger-ink" : "text-ink"}`}>
                <span className="sr-only">{r.direction === "out" ? "Out: " : "In: "}</span>
                {r.direction === "out" ? "-" : "+"}
                {formatGHS(r.amount)}
              </span>
            </div>
          );
        })}
      </Panel>
    </>
  );
}

function howChip(r: MoneyMovement): { text: string; cls: string } {
  const method = r.method ? METHOD_LABEL[r.method] ?? (r.method === "mixed" ? "Mixed" : r.method) : null;
  if (r.verification === "payment_verified" || r.verification === "institution_verified") {
    return { text: method ? `${method}, confirmed` : "Confirmed", cls: "bg-success-tint text-success-ink" };
  }
  if (r.method === "mobile_money") return { text: "MoMo, not confirmed", cls: "bg-gold-100 text-gold-700" };
  return { text: method ? `${method}, recorded` : "Recorded by you", cls: "bg-neutral-100 text-neutral-700" };
}

// ------------------------------------------------------------------ owed --

const OWED_COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_120px_130px_150px_120px] lg:items-center lg:gap-4";

const BUCKET: Record<string, { text: string; cls: string }> = {
  not_yet_due: { text: "Not due yet", cls: "bg-teal-50 text-teal-800" },
  no_due_date: { text: "No due date", cls: "bg-neutral-100 text-neutral-700" },
  "1_30": { text: "1 to 30 days late", cls: "bg-gold-100 text-gold-700" },
  "31_60": { text: "31 to 60 days late", cls: "bg-danger-tint text-danger-ink" },
  "61_90": { text: "61 to 90 days late", cls: "bg-danger-tint text-danger-ink" },
  over_90: { text: "Over 90 days late", cls: "bg-danger-tint text-danger-ink" },
};

const ORIGIN: Record<string, string> = { sale: "Till sale", shop_order: "Shop order", service_booking: "Booking", document: "Invoice" };

function Owed({ rows }: { rows: OwedRow[] | null }) {
  if (rows === null) return <EmptyState title="We could not load who owes you just now." detail="Nothing is lost. Refresh in a moment." />;
  if (rows.length === 0) return <EmptyState title="Nobody owes you money." detail="Invoices and sales on credit that are still unpaid show here." />;
  return (
    <Panel>
      <div aria-hidden className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${OWED_COLS}`}>
        <span>Customer</span>
        <span>For</span>
        <span>Due</span>
        <span>Status</span>
        <span className="text-right">Owed</span>
      </div>
      {rows.map((r, i) => {
        const b = BUCKET[r.bucket] ?? { text: r.bucket, cls: "bg-neutral-100 text-neutral-700" };
        return (
          <div
            key={r.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] ${OWED_COLS} ${
              i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"
            }`}
          >
            <span className="min-w-0 basis-full truncate font-semibold text-ink lg:basis-auto">
              {r.customer ?? "No customer named"}
              <span className="block text-xs font-normal text-neutral-500 lg:hidden">
                {[ORIGIN[r.origin] ?? r.origin, r.document, r.dueDate ? `due ${shortDate(r.dueDate)}` : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="hidden truncate text-neutral-600 lg:block">
              <span className="sr-only">For: </span>
              {r.document ?? ORIGIN[r.origin] ?? r.origin}
            </span>
            <span className="hidden text-neutral-600 lg:block">
              <span className="sr-only">Due: </span>
              {r.dueDate ? shortDate(r.dueDate) : "None set"}
            </span>
            <span className="flex-none">
              <span className="sr-only">Status: </span>
              <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${b.cls}`}>{b.text}</span>
            </span>
            <span className="num ml-auto flex-none text-right font-bold text-ink lg:ml-0 lg:block">
              <span className="sr-only">Owed: </span>
              {formatGHS(r.outstanding)}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

// --------------------------------------------------------------- you owe --

function YouOwe({ debts, businessId, canPay }: { debts: SupplierDebt[] | null; businessId: string; canPay: boolean }) {
  if (debts === null) return <EmptyState title="We could not load what you owe just now." detail="Nothing is lost. Refresh in a moment." />;
  if (debts.length === 0)
    return <EmptyState title="You owe no supplier for stock." detail="Deliveries you receive and have not paid for yet show here, by supplier." />;
  return (
    <div className="flex flex-col gap-3">
      {debts.map((d) => (
        <Panel key={d.supplier ?? "none"} className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate font-heading text-base font-bold text-ink-heading">{d.supplier ?? "No supplier named"}</h2>
            <span className="num flex-none font-heading text-lg font-extrabold text-ink-heading">{formatGHS(d.owed)}</span>
          </div>
          <div className="mt-2 overflow-hidden rounded-control border border-neutral-100">
            {d.deliveries.map((x, i) => (
              <div key={x.receiptId} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-[13px] ${i ? "border-t border-neutral-100" : ""}`}>
                <span className="min-w-0 text-ink">
                  Delivered {shortDate(new Date(x.receivedAt).toLocaleDateString("en-CA", { timeZone: ACCRA }))}
                  <span className="text-neutral-600">
                    {x.reference ? ` · ${x.reference}` : ""}
                    {x.place ? ` · ${x.place}` : ""}
                  </span>
                </span>
                <span className="num font-semibold text-ink">{formatGHS(x.total)}</span>
                {canPay && <PayDelivery businessId={businessId} receiptId={x.receiptId} amount={x.total} />}
              </div>
            ))}
          </div>
        </Panel>
      ))}
      {!canPay && <p className="text-[12.5px] text-neutral-500">The owner or a manager records paying a supplier.</p>}
    </div>
  );
}

// --------------------------------------------------------------- helpers --

function monthOf(today: string, back: number): { key: string; label: string; from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  const key = d.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const to = back === 0 ? today : last;
  const label = back === 0 ? "This month" : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { key, label, from: `${key}-01`, to };
}

function when(iso: string): string {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: ACCRA });
  const time = new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
  if (d === new Date().toLocaleDateString("en-CA", { timeZone: ACCRA })) return `Today ${time}`;
  return `${new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" })} ${time}`;
}

function shortDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
