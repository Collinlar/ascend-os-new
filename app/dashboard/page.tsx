import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { loadDashboard, type AttentionItem } from "@/lib/reporting/dashboard";
import {
  loadHomeDevices,
  loadHomeFigures,
  METHOD_LABEL,
  type HomeDevice,
  type HomeFigures,
} from "@/lib/reporting/home";
import { formatGHS } from "@/lib/money";
import { currentWorkspace } from "@/lib/nav/workspace";
import { setupPath } from "@/lib/domains/setup";
import SetupPath from "@/components/shell/SetupPath";
import AttentionList, { type AttentionRow } from "@/components/shell/AttentionList";
import { Icon, type IconName } from "@/components/shell/icons";
import RiskBanner from "@/components/risk/RiskBanner";
import { riskNotice } from "@/lib/risk/notice";

export const dynamic = "force-dynamic";

// Home (v3 design, DESIGN_V3_PLAN.md step D3), reading real records.
//
// A greeting and today's figures; while the business is new, the steps to
// its first sale; then two columns. On the left what has happened: sales
// over 14 days with what sold and how people paid, the tills and phones
// selling, and the latest sales. On the right what needs the owner, and the
// few things they start most often.
//
// Earned and received are shown as the different things they are
// (REP-003). A section with nothing real behind it is left out, never filled
// with a placeholder figure (decision 5). Growing lives at /grow; Home never
// sells the owner something they did not ask about.

const ACCRA = "Africa/Accra";

export default async function Dashboard() {
  const personId = await currentPersonId();
  const data = personId ? await loadDashboard(personId) : null;
  const workspace = data ? await currentWorkspace().catch(() => null) : null;

  if (!data || !workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink">Sign in to open your business.</h1>
          <p className="mt-2 text-sm text-ink-muted">
            We send a code to the WhatsApp number your business is set up with.
          </p>
          <Link
            href="/signin"
            className="tap mt-5 inline-flex items-center rounded-control bg-teal px-5 py-3 font-medium text-white"
          >
            Send my sign-in code
          </Link>
          <p className="mt-4 text-sm text-ink-muted">
            No business yet?{" "}
            <Link href="/" className="font-semibold text-teal-dark underline">
              Start one
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const caps = workspace.capabilities;
  const hasTill = caps.has("pos.sell");
  const day = accraDate();

  const [notice, path, figures, devices] = await Promise.all([
    // Ascend limiting the business is the first thing its owner should read
    // (Risk and Trust R5). Nothing shows below "restricted".
    riskNotice(workspace.businessId).catch(() => null),
    setupPath(workspace.businessId, workspace.locationId, caps).catch(() => null),
    loadHomeFigures(workspace.businessId, day).catch(() => null),
    caps.has("pos.tills") ? loadHomeDevices(workspace.businessId).catch(() => null) : Promise.resolve(null),
  ]);

  const firstName = workspace.personName.split(/\s+/)[0] || workspace.personName;
  const money = (n: number) => (data.moneyUnavailable ? "GH₵ –" : formatGHS(n));

  // ----------------------------------------------------------- the pulse --
  const pulse: Array<{ label: string; value: string; sub: string; href?: string; tone?: "warn" }> = [
    {
      label: "Sales today",
      value: money(data.salesToday),
      sub: data.moneyUnavailable
        ? UNAVAILABLE
        : data.saleCount === 0
          ? "No sales yet today"
          : `${data.saleCount} sale${data.saleCount === 1 ? "" : "s"}, after any refunds`,
      href: hasTill ? "/pos" : undefined,
    },
    {
      label: "Money received today",
      value: money(data.receivedToday),
      sub: data.moneyUnavailable
        ? UNAVAILABLE
        : data.verifiedReceived > 0
          ? `${formatGHS(data.verifiedReceived)} confirmed by Mobile Money`
          : "Cash and recorded payments, less money handed back",
    },
    {
      label: "Owed to you",
      value: money(data.owed),
      sub: data.moneyUnavailable
        ? UNAVAILABLE
        : data.owed === 0
          ? "Nothing outstanding"
          : `${data.owedCustomers} customer${data.owedCustomers === 1 ? "" : "s"}${
              data.oldestOwedDays !== null ? `, oldest ${data.oldestOwedDays} days` : ""
            }`,
      href: caps.has("documents.issue") && data.owed > 0 ? "/documents" : undefined,
      tone: data.owed > 0 ? "warn" : undefined,
    },
  ];
  if (figures && figures.stock.tracked > 0) {
    pulse.push({
      label: "Low stock",
      value: String(figures.stock.low),
      sub:
        figures.stock.out > 0
          ? `${figures.stock.out} out of stock`
          : figures.stock.low === 0
            ? `All ${figures.stock.tracked} counted products are stocked`
            : `of ${figures.stock.tracked} counted products`,
      href: "/products",
      tone: figures.stock.low > 0 || figures.stock.out > 0 ? "warn" : undefined,
    });
  } else if (figures && figures.customers.total > 0 && (caps.has("customers.core") || caps.has("customers.basic"))) {
    pulse.push({
      label: "Customers",
      value: String(figures.customers.total),
      sub: figures.customers.new7d > 0 ? `${figures.customers.new7d} new this week` : "None new this week",
      href: "/customers",
    });
  }

  // ------------------------------------------------------- needs attention --
  const attention: AttentionRow[] = data.attention.map(toRow);
  if (figures && figures.stock.out > 0) {
    attention.push({
      id: "out-of-stock",
      title: `${figures.stock.out} product${figures.stock.out === 1 ? " is" : "s are"} out of stock`,
      action: "Open products",
      href: "/products",
      tone: "gold",
      icon: "box",
    });
  }
  const quietLine = hasTill
    ? "No orders waiting, no overdue invoices, nothing stuck on a till."
    : "No orders waiting, no overdue invoices, nothing left to chase.";

  // --------------------------------------------------------- quick actions --
  const quick: Array<{ label: string; href: string; icon: IconName }> = [];
  if (caps.has("catalogue.core")) quick.push({ label: "Add a product", href: "/products/add", icon: "plus" });
  if (caps.has("documents.issue")) quick.push({ label: "Create an invoice", href: "/documents", icon: "file" });
  if (caps.has("customers.core") || caps.has("customers.basic"))
    quick.push({ label: "Add a customer", href: "/customers", icon: "users" });
  if (caps.has("people.cashiers") || caps.has("people.core")) quick.push({ label: "Add your team", href: "/team", icon: "team" });
  if (caps.has("shop.storefront")) quick.push({ label: "Share your shop", href: "/shop", icon: "store" });

  const hasHistory = !!figures && figures.days.some((d) => d.count > 0);
  // Without anything to show on the left, the right column takes the width
  // rather than sitting beside a gap.
  const hasLeft = !!figures || (!!devices && devices.length > 0);

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1140px] px-5 pb-28 pt-6 sm:px-8 sm:pb-16 sm:pt-7">
        <div className="flex flex-col gap-[22px]">
          {notice && <RiskBanner notice={notice} />}

          {/* Greeting. The one action a till business starts its day with
              sits beside it. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-[13px] text-neutral-500">
                {accraLongDate()}
                {workspace.locationName ? ` · ${workspace.locationName}` : ""}
              </p>
              <h1 className="font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.01em] text-ink-heading sm:text-[30px]">
                {greeting()}, {firstName}
              </h1>
              <p className="text-[14.5px] text-neutral-600">{subline(data, hasTill)}</p>
            </div>
            {hasTill && (
              <Link
                href="/pos"
                className="tap flex flex-none items-center justify-center gap-2 self-start rounded-control bg-teal px-6 font-bold text-white shadow-action hover:bg-teal-hover sm:self-auto"
              >
                <Icon name="sell" />
                Open the till
              </Link>
            )}
          </div>

          {/* Today's figures. */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {pulse.map((k) => {
              const body = (
                <>
                  <span className="text-[12.5px] text-neutral-500">{k.label}</span>
                  <span
                    className={`num font-heading text-2xl font-extrabold tracking-[-0.01em] ${
                      k.tone === "warn" ? "text-gold-700" : "text-ink-heading"
                    }`}
                  >
                    {k.value}
                  </span>
                  <span className="text-xs text-neutral-500">{k.sub}</span>
                </>
              );
              const cls = "flex flex-col gap-1 rounded-[18px] border border-line-brand bg-white px-[18px] py-4";
              return k.href ? (
                <Link key={k.label} href={k.href} className={`tap ${cls} hover:border-teal-brand`}>
                  {body}
                </Link>
              ) : (
                <div key={k.label} className={cls}>
                  {body}
                </div>
              );
            })}
          </div>

          {/* @contrast-surface canvas */}
          {path && <SetupPath path={path} />}

          <div className={`grid items-start gap-4 ${hasLeft ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]" : ""}`}>
            {/* What has happened. */}
            {hasLeft && (
            <div className="flex min-w-0 flex-col gap-4">
              {figures && hasHistory && <SalesChart figures={figures} />}
              {devices && devices.length > 0 && <Devices devices={devices} />}
              {figures && figures.recent.length > 0 && <Recent figures={figures} hasTill={hasTill} />}
              {figures && !hasHistory && (
                <div className="rounded-[20px] border border-line-brand bg-white px-5 py-5">
                  <h2 className="font-heading text-base font-bold text-ink-heading">Sales, last 14 days</h2>
                  <p className="mt-1 text-sm text-neutral-600">
                    Your first sale starts this chart. Every sale from your till, shop, bookings and invoices lands here.
                  </p>
                </div>
              )}
            </div>
            )}

            {/* What needs the owner. */}
            <div className={`min-w-0 gap-4 ${hasLeft ? "flex flex-col" : "grid items-start lg:grid-cols-2"}`}>
              <AttentionList rows={attention} quiet={quietLine} />

              {quick.length > 0 && (
                <section aria-labelledby="quick">
                  <h2 id="quick" className="px-0.5 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                    Quick actions
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    {quick.map((q) => (
                      <Link
                        key={q.href + q.label}
                        href={q.href}
                        className="tap flex h-[46px] items-center gap-2 rounded-control border border-line-brand bg-white px-3 text-[13px] font-semibold text-teal-800 hover:border-teal-brand"
                      >
                        <Icon name={q.icon} size={16} />
                        <span className="truncate">{q.label}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-[20px] border border-line-brand bg-white px-[18px] py-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-heading text-base font-bold text-ink-heading">Ascend Balance</h2>
                  <span className="num font-heading text-lg font-extrabold text-ink-heading">{formatGHS(data.balance)}</span>
                </div>
                <p className={`mt-1 text-[13px] ${data.balance < 5 ? "font-semibold text-gold-700" : "text-neutral-600"}`}>
                  {data.balance < 5
                    ? "Running low. Top up before it stops your customer messages."
                    : "Pays for the WhatsApp messages Ascend sends for you."}
                </p>
                {(data.onItsWay > 0 || data.paidOutToday > 0) && (
                  <p className="mt-2 border-t border-neutral-100 pt-2 text-[13px] text-neutral-600">
                    {[
                      data.onItsWay > 0 ? `${formatGHS(data.onItsWay)} paid online is on its way to your account` : null,
                      data.paidOutToday > 0 ? `${formatGHS(data.paidOutToday)} reached your account today` : null,
                    ]
                      .filter(Boolean)
                      .join(". ")}
                    .
                  </p>
                )}
              </section>

              {/* Shown to a business that has readiness, not to every one. */}
              {caps.has("readiness.score") && (
                <section className="rounded-[20px] border border-line-brand bg-teal-50 px-[18px] py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-teal-800">Sustainability Score</p>
                  <h2 className="mt-1 font-heading text-base font-bold text-ink-heading">Your record builds as you sell</h2>
                  <p className="mt-1 text-[13px] text-neutral-600">
                    Every sale, receipt and balanced shift counts. The score comes from what your business does, never
                    from what you buy.
                  </p>
                  <Link href="/readiness" className="tap mt-1 inline-flex items-center text-sm font-bold text-teal-dark">
                    See what my record shows
                  </Link>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Said the same on every money figure when the core cannot be read.
const UNAVAILABLE = "We could not load this just now. Refresh in a moment.";

const ATTENTION_ICON: Record<string, IconName> = {
  "pending-orders": "inbox",
  overdue: "file",
  unsynced: "device",
  "no-balance": "money",
};

function toRow(item: AttentionItem): AttentionRow {
  return {
    id: item.id,
    title: item.label,
    action: item.action,
    href: item.href,
    tone: item.tone,
    icon: ATTENTION_ICON[item.id] ?? "alert",
  };
}

// ---------------------------------------------------------------- sections --

function SalesChart({ figures }: { figures: HomeFigures }) {
  const days = figures.days;
  const max = Math.max(...days.map((d) => d.sales), 1);
  const total = days.reduce((n, d) => n + d.sales, 0);
  const mixTotal = figures.paymentMix.reduce((n, m) => n + m.amount, 0);
  const topMax = Math.max(...figures.topProducts.map((p) => p.amount), 1);

  return (
    <section aria-labelledby="sales14" className="flex flex-col gap-3.5 rounded-[20px] border border-line-brand bg-white px-5 py-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="sales14" className="font-heading text-base font-bold text-ink-heading">
            Sales, last 14 days
          </h2>
          <span className="text-[12.5px] text-neutral-500">Every channel, after refunds</span>
        </div>
        <span className="num font-heading text-[22px] font-extrabold text-ink-heading">{formatGHS(total)}</span>
      </div>

      {/* The bars are a picture of the table below them for anyone who
          cannot see them. */}
      <div aria-hidden className="flex h-[150px] items-end gap-1.5">
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const h = d.sales > 0 ? Math.max(4, Math.round((d.sales / max) * 100)) : 2;
          return (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span
                className={`w-full rounded-[6px] ${isToday ? "bg-teal" : d.sales > 0 ? "bg-teal-300" : "bg-neutral-100"}`}
                style={{ height: `${h}%` }}
              />
              <span className="text-[10.5px] text-neutral-500">{isToday ? "Today" : dayNumber(d.day)}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Sales by day, last 14 days</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{formatGHS(d.sales)}</td>
              <td>{d.count} sales</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(figures.topProducts.length > 0 || figures.paymentMix.length > 0) && (
        <div className="grid gap-4 border-t border-neutral-100 pt-3 sm:grid-cols-2">
          {figures.topProducts.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-neutral-500">Top products</span>
              {figures.topProducts.map((p) => (
                <Bar key={p.name} label={p.name} value={formatGHS(p.amount)} pct={(p.amount / topMax) * 100} />
              ))}
            </div>
          )}
          {figures.paymentMix.length > 0 && mixTotal > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-neutral-500">How customers paid, before refunds</span>
              {figures.paymentMix.map((m) => {
                const pct = Math.round((m.amount / mixTotal) * 100);
                return <Bar key={m.method} label={METHOD_LABEL[m.method] ?? m.method} value={`${pct}%`} pct={pct} />;
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Bar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="flex justify-between gap-3 text-[12.5px]">
        <span className="truncate text-ink">{label}</span>
        <strong className="num font-semibold text-ink">{value}</strong>
      </span>
      <span aria-hidden className="flex h-[5px] rounded-[3px] bg-neutral-100">
        <span className="rounded-[3px] bg-teal-brand" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </span>
    </div>
  );
}

function Devices({ devices }: { devices: HomeDevice[] }) {
  const selling = devices.filter((d) => d.selling).length;
  return (
    <section aria-labelledby="devices" className="flex flex-col gap-3 rounded-[20px] border border-line-brand bg-white px-5 py-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="devices" className="font-heading text-base font-bold text-ink-heading">
          {selling > 0 ? `${selling} of ${devices.length} selling now` : "Your tills"}
        </h2>
        <Link href="/devices" className="tap inline-flex items-center text-[13px] font-semibold text-teal-dark">
          Manage devices
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {devices.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 rounded-[14px] border border-neutral-100 px-3 py-[11px]">
            <span
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] ${
                d.selling ? "bg-teal-50 text-teal-800" : "bg-neutral-100 text-neutral-600"
              }`}
            >
              <Icon name={d.mode === "terminal" ? "device" : "phone"} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[13px] font-semibold text-ink">{d.label}</span>
              <span className="text-[11.5px] text-neutral-500">
                {d.selling ? "Selling" : "Not open"}
                {d.lastSyncAt ? ` · checked in ${timeAgo(d.lastSyncAt)}` : " · not checked in yet"}
                {d.unsent > 0 ? ` · ${d.unsent} unsent` : ""}
              </span>
            </span>
            <span
              aria-hidden
              className={`h-2 w-2 flex-none rounded-full ${d.unsent > 0 ? "bg-gold" : d.selling ? "bg-teal-live" : "bg-neutral-300"}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Recent({ figures, hasTill }: { figures: HomeFigures; hasTill: boolean }) {
  return (
    <section aria-labelledby="recent" className="flex flex-col rounded-[20px] border border-line-brand bg-white px-5 pb-2 pt-1.5">
      <div className="flex items-baseline justify-between gap-3 pb-2 pt-3">
        <h2 id="recent" className="font-heading text-base font-bold text-ink-heading">
          Latest sales
        </h2>
        {hasTill && (
          <Link href="/pos" className="tap inline-flex items-center text-[13px] font-semibold text-teal-dark">
            Open the till
          </Link>
        )}
      </div>
      {figures.recent.map((r) => {
        const method = r.method ? METHOD_LABEL[r.method] ?? r.method : "Not paid yet";
        const unverifiedMomo = r.method === "mobile_money" && !r.verified;
        const chip =
          r.status === "reversed"
            ? { text: "Reversed", cls: "bg-neutral-100 text-neutral-700" }
            : unverifiedMomo
              ? { text: "MoMo, not confirmed", cls: "bg-gold-100 text-gold-700" }
              : !r.method
                ? { text: method, cls: "bg-gold-100 text-gold-700" }
                : { text: method, cls: "bg-teal-50 text-teal-800" };
        return (
          <div key={r.at + r.total} className="flex items-center gap-3 border-t border-neutral-100 py-2.5 text-[13.5px]">
            <span className="num w-[52px] flex-none text-neutral-500">{whenShort(r.at)}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{r.items ?? "Sale"}</span>
            <span className={`hidden flex-none rounded-full px-2 py-0.5 text-[11.5px] font-bold min-[420px]:inline ${chip.cls}`}>
              {chip.text}
            </span>
            <span className={`num w-[88px] flex-none text-right font-bold ${r.status === "reversed" ? "text-neutral-500 line-through" : "text-ink"}`}>
              {formatGHS(r.total)}
            </span>
          </div>
        );
      })}
    </section>
  );
}

// ----------------------------------------------------------------- helpers --

function subline(data: { saleCount: number; tillsSelling: number; openedAt: string | null; moneyUnavailable: boolean }, hasTill: boolean) {
  if (hasTill && data.tillsSelling > 0) {
    return `${data.tillsSelling} till${data.tillsSelling === 1 ? " is" : "s are"} selling${
      data.openedAt ? `, open since ${clockTime(data.openedAt)}` : ""
    }.`;
  }
  if (hasTill) return "No till is open yet today.";
  if (!data.moneyUnavailable && data.saleCount > 0) return "Here is how today is going.";
  return "Everything your business records lands here.";
}

function accraDate(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: ACCRA });
}

function accraLongDate(): string {
  return new Date().toLocaleDateString("en-GB", { timeZone: ACCRA, weekday: "long", day: "numeric", month: "long" });
}

function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { timeZone: ACCRA, hour: "2-digit", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: ACCRA, hour: "2-digit", minute: "2-digit" });
}

// The time for a sale today, the date for one before: an older sale shown
// with only a time reads as today's.
function whenShort(iso: string): string {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: ACCRA });
  if (d === accraDate()) return clockTime(iso);
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: ACCRA, day: "numeric", month: "short" });
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
