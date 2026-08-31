import Link from "next/link";
import { currentPersonId } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/reporting/dashboard";
import { formatGHS } from "@/lib/money";
import { currentWorkspace } from "@/lib/nav/workspace";
import { setupPath } from "@/lib/domains/setup";
import SetupPath from "@/components/shell/SetupPath";

export const dynamic = "force-dynamic";

// Business Web home, reading real records. Decisions before totals
// (OFF-008); revenue earned and money received are shown as the different
// things they are (REP-003); data freshness is stated rather than implied
// (REP-002, ARC-013).
//
// Built on the Ascend Business Web design: a navy hero carrying today's one
// number, then what needs a decision, then the totals behind it.
//
// Deliberately thin, and about today only. It used to carry the shop
// switch, which made the screen a merchant opens every morning the place
// where every product set piles up. A till business was handed an offer it
// never asked for, on its own home. Growing lives at /grow now, and you go
// there because you decided to.

export default async function Dashboard() {
  const personId = await currentPersonId();
  const data = personId ? await loadDashboard(personId) : null;

  // What is still standing between this business and its first sale. Read
  // from real records, so it is right however the merchant got here.
  const workspace = data ? await currentWorkspace().catch(() => null) : null;

  const path = workspace
    ? await setupPath(
        workspace.businessId,
        workspace.locationId,
        workspace.capabilities
      ).catch(() => null)
    : null;

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink">
            Sign in to open your business.
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            We send a code to the WhatsApp number your business is set up with.
          </p>
          <Link
            href="/signin"
            className="tap mt-5 inline-flex items-center rounded-control bg-teal px-5 py-3 font-medium text-white"
          >
            Sign in
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

  const quiet = data.attention.length === 0;
  // Copy names only what this business actually has. A shop that never
  // wanted a counter should not be told its products are hidden from a
  // till, or reassured that nothing is stuck on one.
  const hasTill = workspace?.capabilities.has("pos.sell") ?? false;
  const hasShop = workspace?.capabilities.has("shop.storefront") ?? false;

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[1200px] px-5 pb-24 pt-6 sm:px-8 sm:pb-16 sm:pt-7">
        <div className="flex flex-col gap-5 sm:gap-[22px]">
          {/* Today's one number, on the ground the whole day is read
              against. Everything in here is a fact: an open shift is a
              person at a counter, not a device sitting in a drawer. */}
          <section className="relative overflow-hidden rounded-[22px] bg-navy-deep px-6 py-7 sm:px-[30px]">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-[60px] -top-[70px] h-[280px] w-[280px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(14,140,127,.35), rgba(14,140,127,0) 70%)",
              }}
            />
            <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center sm:gap-9">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-mint-bright">
                  Today at your business
                </p>
                <p className="mt-2 flex items-end gap-3.5">
                  <span className="num text-[38px] font-extrabold leading-none tracking-[-0.03em] text-white sm:text-[46px]">
                    {formatGHS(data.salesToday)}
                  </span>
                  <span className="pb-1 text-[13.5px] font-semibold text-on-dark-soft">
                    {data.saleCount === 0 ? "no sales yet" : "in sales so far"}
                  </span>
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {hasTill && (
                    <>
                      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-on-dark-strong">
                        <span
                          aria-hidden
                          className={`h-[7px] w-[7px] rounded-full ${
                            data.tillsSelling > 0
                              ? "bg-teal-live ring-[3px] ring-teal-live/25"
                              : "bg-on-dark-soft/50"
                          }`}
                        />
                        {data.tillsSelling > 0
                          ? `${data.tillsSelling} till${
                              data.tillsSelling === 1 ? "" : "s"
                            } selling`
                          : "No till open"}
                      </span>
                      <span
                        aria-hidden
                        className="hidden h-3.5 w-px bg-on-dark-strong/25 sm:block"
                      />
                    </>
                  )}
                  <span className="text-[12.5px] font-medium text-on-dark-soft">
                    {today()}
                    {data.openedAt && ` · opened ${clockTime(data.openedAt)}`}
                  </span>
                </div>
              </div>

              {hasTill && (
                <Link
                  href="/pos"
                  className="tap relative flex flex-none items-center justify-center whitespace-nowrap rounded-[14px] bg-teal px-7 py-4 font-bold text-white shadow-action hover:bg-teal-hover"
                >
                  Open the till
                </Link>
              )}
            </div>
          </section>

          {path && <SetupPath path={path} />}

          {/* Decisions before totals. The rule down the left is the only
              thing on this screen that says "this one is on you". */}
          <section>
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
                {quiet ? "Nothing needs you right now" : "Needs your attention"}
              </h2>
              {!quiet && (
                <span className="num rounded-full bg-gold-tint px-2 py-0.5 text-[10.5px] font-extrabold text-gold-ink">
                  {data.attention.length}
                </span>
              )}
            </div>

            {quiet ? (
              <p className="rounded-panel border border-line-soft bg-white px-5 py-5 text-sm text-ink-muted shadow-card">
                {hasTill
                  ? "No orders waiting, no overdue invoices, nothing stuck on a till."
                  : "No orders waiting, no overdue invoices, nothing left to chase."}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.attention.map((item) => (
                  <div
                    key={item.id}
                    className={`flex flex-col justify-between gap-3 rounded-[14px] border border-line-soft bg-white px-[18px] py-4 shadow-card sm:flex-row sm:items-center sm:gap-5 ${
                      item.tone === "gold" ? "border-l-4 border-l-gold-rule" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span
                        aria-hidden
                        className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control text-[17px] font-extrabold ${
                          item.tone === "gold"
                            ? "bg-gold-tint text-gold-ink"
                            : "bg-teal-light text-teal-dark"
                        }`}
                      >
                        !
                      </span>
                      <span className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-ink">
                        {item.label}
                      </span>
                    </div>
                    <Link
                      href={item.href}
                      className="tap flex flex-none items-center justify-center self-start whitespace-nowrap rounded-chip bg-teal-light px-4 text-[13.5px] font-bold text-teal-dark hover:bg-teal-pale sm:self-auto"
                    >
                      {item.action}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-3.5 sm:grid-cols-3">
            <Card
              label="Sales today"
              value={formatGHS(data.salesToday)}
              note={
                data.saleCount === 0
                  ? "No sales recorded yet today"
                  : `${data.saleCount} sale${data.saleCount === 1 ? "" : "s"}${
                      hasTill && hasShop
                        ? " across your till and shop"
                        : hasTill
                          ? " at your till"
                          : " from your shop"
                    }`
              }
              chip={data.tillsSelling > 0 ? "Live" : undefined}
            />
            <Card
              label="Money received today"
              value={formatGHS(data.receivedToday)}
              note={
                data.verifiedReceived > 0
                  ? `${formatGHS(data.verifiedReceived)} confirmed by Mobile Money`
                  : "Cash and declared payments only"
              }
            />
            <Card
              label="Owed to you"
              value={formatGHS(data.owed)}
              note={
                data.owed === 0
                  ? "Nothing outstanding"
                  : `${data.owedCustomers} customer${
                      data.owedCustomers === 1 ? "" : "s"
                    }${
                      data.oldestOwedDays !== null
                        ? ` · oldest ${data.oldestOwedDays} days`
                        : ""
                    }`
              }
              chip={data.owed > 0 ? "Chase" : undefined}
              chipTone="gold"
            />
          </section>

          <section className="flex flex-col gap-3 rounded-panel border border-line-soft bg-white px-[22px] py-[17px] sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden
                className="flex h-9 w-9 flex-none items-center justify-center rounded-chip bg-navy-deep text-sm font-extrabold text-on-dark-strong"
              >
                A
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-ink">
                  Ascend Balance{" "}
                  <span className="num">{formatGHS(data.balance)}</span>
                </p>
                {data.balance < 5 && (
                  <p className="text-xs font-semibold text-gold-ink">
                    Running low. Top up before it stops your messages.
                  </p>
                )}
              </div>
            </div>
            {hasTill && (
              <p className="text-xs font-medium text-slate-grey">
                {data.lastDeviceSync
                  ? `Till last checked in ${timeAgo(data.lastDeviceSync)}`
                  : "No till set up yet"}
                {data.unsyncedSales > 0 && ` · ${data.unsyncedSales} unsent`}
              </p>
            )}
          </section>

          {/* Shown to a business that has readiness, not to every business.
              A till merchant being handed a link to something they do not
              have is the same leak as an upsell landing on their home. */}
          {workspace?.capabilities.has("readiness.score") && (
            <section className="rounded-panel border border-line-soft bg-white px-[22px] py-5 shadow-card">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-grey">
                Your connected record
              </h2>
              <p className="mt-2.5 max-w-lg text-sm text-ink-muted">
                Every sale, receipt and reconciled shift builds your business
                evidence. Your Sustainability Score updates from real activity,
                never from what you purchase.
              </p>
              <Link
                href="/readiness"
                className="tap mt-3 inline-flex items-center font-bold text-teal-dark underline"
              >
                See what my record shows
              </Link>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  note,
  chip,
  chipTone = "teal",
}: {
  label: string;
  value: string;
  note: string;
  chip?: string;
  chipTone?: "teal" | "gold";
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-panel border border-line-soft bg-white px-[22px] py-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-semibold text-slate-grey">{label}</p>
        {chip && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold ${
              chipTone === "gold"
                ? "bg-gold-tint text-gold-ink"
                : "bg-teal-light text-teal-dark"
            }`}
          >
            {chip}
          </span>
        )}
      </div>
      <p className="num text-3xl font-extrabold tracking-[-0.025em] text-ink">
        {value}
      </p>
      <p className="text-xs font-medium text-slate-grey">{note}</p>
    </div>
  );
}

function today(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function clockTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", "");
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
