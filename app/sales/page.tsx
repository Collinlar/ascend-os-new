import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { checkPageAccess } from "@/lib/authority/page";
import { formatGHS } from "@/lib/money";
import { loadHomeFigures, METHOD_LABEL, CHANNEL_LABEL } from "@/lib/reporting/home";
import { loadSales, loadShifts, SALES_LIMIT, type SaleRow, type SalesChannel, type ShiftRow } from "@/lib/reporting/sales";
import { EmptyState, FigureRow, PageHeader, PageShell, Panel, primaryAction } from "@/components/shell/Page";
import { Icon } from "@/components/shell/icons";

export const dynamic = "force-dynamic";

// Sales (v3 design, D3): every sale from the till, the shop, bookings and
// invoices in one history, read from the commerce core, with the till's
// shifts on their own tab. What was earned and how it was paid are shown
// as the different things they are; an unconfirmed MoMo payment says so.

const ACCRA = "Africa/Accra";

const CHANNELS: Array<{ key: SalesChannel; label: string; cap: string }> = [
  { key: "pos", label: "Till", cap: "pos.sell" },
  { key: "shop", label: "Shop", cap: "shop.orders" },
  { key: "services", label: "Bookings", cap: "services.bookings" },
  { key: "documents", label: "Invoices", cap: "documents.issue" },
];

export default async function Sales({ searchParams }: { searchParams: { tab?: string; channel?: string } }) {
  await checkPageAccess("/sales");
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/signin");

  const caps = workspace.capabilities;
  const channels = CHANNELS.filter((c) => caps.has(c.cap));
  const hasTill = caps.has("pos.sell");
  const tab = searchParams.tab === "shifts" && hasTill ? "shifts" : "sales";
  const channel = channels.find((c) => c.key === searchParams.channel)?.key ?? null;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });

  const [figures, sales, shifts] = await Promise.all([
    loadHomeFigures(workspace.businessId, day).catch(() => null),
    tab === "sales" ? loadSales(workspace.businessId, channel).catch(() => null) : Promise.resolve(null),
    tab === "shifts" ? loadShifts(workspace.businessId).catch(() => null) : Promise.resolve(null),
  ]);

  // Today, the last seven days, and the average sale over them, all by the
  // dashboard's own rules (0116).
  const week = figures?.days.slice(-7) ?? [];
  const today = week.at(-1);
  const weekTotal = week.reduce((n, d) => n + d.sales, 0);
  const weekCount = week.reduce((n, d) => n + d.count, 0);

  return (
    <PageShell>
      <PageHeader
        title="Sales"
        intro={`Every sale from your ${channels.map((c) => c.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1") || "business"}, in one history`}
        action={
          hasTill ? (
            <Link href="/pos" className={primaryAction}>
              <Icon name="sell" size={16} />
              Open the till
            </Link>
          ) : null
        }
      />

      {figures && today && (
        <FigureRow
          figures={[
            { label: "Today", value: formatGHS(today.sales), sub: `${today.count} sale${today.count === 1 ? "" : "s"}` },
            { label: "Last 7 days", value: formatGHS(weekTotal), sub: `${weekCount} sale${weekCount === 1 ? "" : "s"}` },
            { label: "Average sale", value: weekCount > 0 ? formatGHS(weekTotal / weekCount) : "None yet", sub: "Over the last 7 days" },
          ]}
        />
      )}

      {hasTill && (
        <div className="mb-4 flex gap-1 border-b border-neutral-200" role="tablist" aria-label="Sales or shifts">
          {[
            { key: "sales", label: "Sales", href: "/sales" },
            { key: "shifts", label: "Shifts", href: "/sales?tab=shifts" },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={tab === t.key}
              className={`tap -mb-px flex min-h-[44px] items-center border-b-[2.5px] px-3.5 text-sm font-semibold ${
                tab === t.key ? "border-teal text-teal-800" : "border-transparent text-neutral-600 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {tab === "sales" ? (
        <SalesTable sales={sales} channels={channels} channel={channel} hasTill={hasTill} />
      ) : (
        <ShiftsTable shifts={shifts} />
      )}
    </PageShell>
  );
}

// ------------------------------------------------------------------ sales --

const SALE_COLS = "lg:grid lg:grid-cols-[92px_110px_130px_96px_minmax(0,1fr)_150px_104px] lg:items-center lg:gap-4";

function SalesTable({
  sales,
  channels,
  channel,
  hasTill,
}: {
  sales: SaleRow[] | null;
  channels: Array<{ key: SalesChannel; label: string }>;
  channel: SalesChannel | null;
  hasTill: boolean;
}) {
  if (sales === null) {
    return <EmptyState title="We could not load your sales just now." detail="Nothing is lost. Refresh in a moment." />;
  }

  const filters = channels.length > 1 ? [{ key: null as SalesChannel | null, label: "All" }, ...channels] : [];

  return (
    <>
      {filters.length > 0 && (
        <div className="mb-3.5 flex items-center gap-2">
          <div className="scr flex gap-2 overflow-x-auto">
            {filters.map((f) => {
              const on = f.key === channel;
              return (
                <Link
                  key={f.label}
                  href={f.key ? `/sales?channel=${f.key}` : "/sales"}
                  aria-current={on ? "true" : undefined}
                  className={`tap flex flex-none items-center whitespace-nowrap rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold ${
                    on ? "border-teal bg-teal-50 text-teal-800" : "border-neutral-200 bg-white text-neutral-700 hover:border-teal-brand"
                  }`}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
          <span className="flex-1" />
          <span className="hidden whitespace-nowrap text-[12.5px] text-neutral-500 sm:block">
            {sales.length === SALES_LIMIT ? `The latest ${SALES_LIMIT}` : `${sales.length} sale${sales.length === 1 ? "" : "s"}`}
          </span>
        </div>
      )}

      {sales.length === 0 ? (
        <EmptyState
          title={channel ? "No sales here yet." : "No sales yet."}
          detail={
            hasTill
              ? "Your first sale from the till lands here, with the shop, bookings and invoices beside it."
              : "Your first sale lands here, with every other way you sell beside it."
          }
        />
      ) : (
        <Panel>
          <div
            aria-hidden
            className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${SALE_COLS}`}
          >
            <span>When</span>
            <span>Receipt</span>
            <span>Where</span>
            <span>Who</span>
            <span>Items</span>
            <span>Paid by</span>
            <span className="text-right">Total</span>
          </div>
          {sales.map((s, i) => {
            const chip = payChip(s);
            const reversed = s.status === "reversed";
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] ${SALE_COLS} ${
                  i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"
                }`}
              >
                <span className="num w-full text-xs text-neutral-500 lg:w-auto lg:text-[13.5px]">
                  {when(s.at)}
                  <span className="lg:hidden">
                    {" · "}
                    {CHANNEL_LABEL[s.channel] ?? s.channel}
                    {s.reference ? ` ${s.reference}` : ""}
                    {s.who ? ` · ${s.who}` : ""}
                  </span>
                </span>
                <span className="mono hidden truncate text-[12.5px] font-semibold text-ink lg:block">
                  <span className="sr-only">Receipt: </span>
                  {s.reference ?? "None"}
                </span>
                <span className="hidden truncate text-neutral-600 lg:block">
                  <span className="sr-only">Where: </span>
                  {s.where ?? CHANNEL_LABEL[s.channel] ?? s.channel}
                </span>
                <span className="hidden truncate text-neutral-600 lg:block">
                  <span className="sr-only">Who: </span>
                  {s.who ?? "None"}
                </span>
                <span className="min-w-0 basis-full truncate text-ink lg:basis-auto">{s.items}</span>
                <span className="flex-none">
                  <span className="sr-only">Paid by: </span>
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
                </span>
                <span className={`num ml-auto flex-none text-right font-bold lg:ml-0 lg:block ${reversed ? "text-neutral-500 line-through" : "text-ink"}`}>
                  <span className="sr-only">Total: </span>
                  {formatGHS(s.total)}
                </span>
              </div>
            );
          })}
        </Panel>
      )}
    </>
  );
}

function payChip(s: SaleRow): { text: string; cls: string } {
  if (s.status === "reversed") return { text: "Reversed", cls: "bg-neutral-100 text-neutral-700" };
  if (!s.method) return { text: "Not paid yet", cls: "bg-gold-100 text-gold-700" };
  if (s.method === "credit") return { text: "On credit", cls: "bg-gold-100 text-gold-700" };
  const label = s.methods > 1 ? `${METHOD_LABEL[s.method] ?? s.method} and more` : METHOD_LABEL[s.method] ?? s.method;
  if (s.method === "mobile_money") {
    return s.verified
      ? { text: "MoMo, confirmed", cls: "bg-success-tint text-success-ink" }
      : { text: "MoMo, not confirmed", cls: "bg-gold-100 text-gold-700" };
  }
  return { text: label, cls: "bg-teal-50 text-teal-800" };
}

// ----------------------------------------------------------------- shifts --

const SHIFT_COLS = "lg:grid lg:grid-cols-[minmax(0,1fr)_130px_120px_120px_110px_130px] lg:items-center lg:gap-4";

function ShiftsTable({ shifts }: { shifts: ShiftRow[] | null }) {
  if (shifts === null) {
    return <EmptyState title="We could not load your shifts just now." detail="Nothing is lost. Refresh in a moment." />;
  }
  if (shifts.length === 0) {
    return <EmptyState title="No shifts yet." detail="A shift starts when someone opens the till, and closes when they count the drawer." />;
  }
  return (
    <Panel>
      <div
        aria-hidden
        className={`hidden bg-neutral-50 px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500 ${SHIFT_COLS}`}
      >
        <span>Shift</span>
        <span>Till</span>
        <span>Cashier</span>
        <span className="text-right">Expected cash</span>
        <span className="text-right">Counted</span>
        <span>Difference</span>
      </div>
      {shifts.map((s, i) => {
        const open = s.status === "open";
        const diff = s.difference ?? 0;
        const explained = !!s.note?.trim();
        const chip = open
          ? { text: "Open now", cls: "bg-teal-50 text-teal-800" }
          : diff === 0
            ? { text: "Balanced", cls: "bg-success-tint text-success-ink" }
            : {
                text: `${diff > 0 ? "Over" : "Short"} ${formatGHS(Math.abs(diff))}`,
                cls: explained ? "bg-gold-100 text-gold-700" : "bg-danger-tint text-danger-ink",
              };
        return (
          <div
            key={s.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13.5px] ${SHIFT_COLS} ${
              i > 0 ? "border-t border-neutral-100" : "lg:border-t lg:border-neutral-100"
            }`}
          >
            <span className="min-w-0 flex-1 text-ink">
              <span className="font-semibold">{shiftSpan(s)}</span>
              <span className="block text-xs text-neutral-500 lg:hidden">
                {[s.till, s.cashier].filter(Boolean).join(" · ")}
              </span>
              {s.note && <span className="block text-xs text-neutral-600">&ldquo;{s.note}&rdquo;</span>}
            </span>
            <span className="hidden truncate text-neutral-600 lg:block">
              <span className="sr-only">Till: </span>
              {s.till ?? "None"}
            </span>
            <span className="hidden truncate text-neutral-600 lg:block">
              <span className="sr-only">Cashier: </span>
              {s.cashier ?? "None"}
            </span>
            <span className="num hidden text-right text-ink lg:block">
              <span className="sr-only">Expected cash: </span>
              {s.expected === null ? (open ? "Not yet" : "None") : formatGHS(s.expected)}
            </span>
            <span className="num hidden text-right text-ink lg:block">
              <span className="sr-only">Counted: </span>
              {s.counted === null ? (open ? "Not yet" : "None") : formatGHS(s.counted)}
            </span>
            <span className="flex-none">
              <span className="sr-only">Difference: </span>
              <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-bold ${chip.cls}`}>{chip.text}</span>
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

// ---------------------------------------------------------------- helpers --

function when(iso: string): string {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: ACCRA });
  const time = new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
  if (d === new Date().toLocaleDateString("en-CA", { timeZone: ACCRA })) return `Today ${time}`;
  return `${new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" })} ${time}`;
}

function shiftSpan(s: ShiftRow): string {
  const start = when(s.openedAt);
  if (!s.closedAt) return `${start} to now`;
  const end = new Date(s.closedAt).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
  return `${start} to ${end}`;
}
