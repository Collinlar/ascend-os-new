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
      <main className="flex min-h-screen items-center justify-center bg-light-grey px-5">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold text-ink">
            Sign in to open your business.
          </h1>
          <p className="mt-2 text-sm text-mid-grey">
            We send a code to the WhatsApp number your business is set up with.
          </p>
          <Link
            href="/signin"
            className="tap mt-5 inline-flex items-center bg-teal px-5 py-3 font-medium text-white"
          >
            Sign in
          </Link>
          <p className="mt-4 text-sm text-mid-grey">
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
    <main className="min-h-screen bg-light-grey">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs text-mid-grey">
              {data.businessName}
              {data.locationName && ` · ${data.locationName}`}
            </p>
            <h1 className="text-lg font-semibold text-ink">Today at your business</h1>
          </div>
          {/* Only for a business that actually sells in person. A shop
              taking online orders has no till to open. */}
          {workspace?.capabilities.has("pos.sell") && (
            <Link
              href="/pos"
              className="tap flex items-center bg-teal px-4 font-medium text-white"
            >
              Open the till
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <section>
          {path && <SetupPath path={path} />}

          <h2 className="text-sm font-medium text-mid-grey">
            {quiet ? "Nothing needs you right now" : "Needs your attention"}
          </h2>
          <div className="mt-3 space-y-2">
            {quiet ? (
              <p className="border border-line bg-white px-4 py-4 text-sm text-mid-grey">
                {hasTill
                  ? "No orders waiting, no overdue invoices, nothing stuck on a till."
                  : "No orders waiting, no overdue invoices, nothing left to chase."}
              </p>
            ) : (
              data.attention.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col justify-between gap-2 bg-white px-4 py-3 sm:flex-row sm:items-center ${
                    item.tone === "gold"
                      ? "border border-l-4 border-line border-l-gold"
                      : "border border-line"
                  }`}
                >
                  <span className="text-sm text-ink">{item.label}</span>
                  <Link
                    href={item.href}
                    className={`tap flex items-center self-start whitespace-nowrap px-3 text-sm font-medium sm:self-auto ${
                      item.tone === "gold" ? "text-gold-dark" : "text-teal-dark"
                    }`}
                  >
                    {item.action}
                  </Link>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          <Card
            label="Sales today"
            value={formatGHS(data.salesToday)}
            detail={
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
          />
          <Card
            label="Money received today"
            value={formatGHS(data.receivedToday)}
            detail={
              data.verifiedReceived > 0
                ? `${formatGHS(data.verifiedReceived)} confirmed by Mobile Money`
                : "Cash and declared payments only"
            }
          />
          <Card
            label="Owed to you"
            value={formatGHS(data.owed)}
            detail={
              data.owed === 0
                ? "Nothing outstanding"
                : `${data.owedCustomers} customer${data.owedCustomers === 1 ? "" : "s"}${
                    data.oldestOwedDays !== null
                      ? ` · oldest ${data.oldestOwedDays} days past due`
                      : ""
                  }`
            }
          />
        </section>

        <section className="mt-6 flex flex-wrap items-baseline justify-between gap-3 border border-line bg-white px-4 py-3">
          <p className="text-sm text-mid-grey">
            Ascend Balance{" "}
            <span className="font-medium text-ink">{formatGHS(data.balance)}</span>
            {data.balance < 5 && (
              <span className="text-gold-dark"> · running low</span>
            )}
          </p>
          {hasTill && (
            <p className="text-xs text-mid-grey">
              {data.lastDeviceSync
                ? `Till last checked in ${timeAgo(data.lastDeviceSync)}`
                : "No till set up yet"}
              {data.unsyncedSales > 0 && ` · ${data.unsyncedSales} unsent`}
            </p>
          )}
        </section>

        {/* Shown to a business that has readiness, not to every business.
            A till merchant being handed a link to something they do not have
            is the same leak as an upsell landing on their home screen. */}
        {workspace?.capabilities.has("readiness.score") && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-mid-grey">Your connected record</h2>
          <p className="mt-2 max-w-lg text-sm text-mid-grey">
            Every sale, receipt and reconciled shift builds your business
            evidence. Your Sustainability Score updates from real activity,
            never from what you purchase.
          </p>
          <Link
            href="/readiness"
            className="tap mt-3 inline-flex items-center font-medium text-teal-dark underline"
          >
            See what my record shows
          </Link>
        </section>
        )}
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-line bg-white px-4 py-4">
      <p className="text-sm text-mid-grey">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-mid-grey">{detail}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}
