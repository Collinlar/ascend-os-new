import { PageHeader, PageShell } from "@/components/shell/Page";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/nav/workspace";
import { growthOptions } from "@/lib/domains/growth";
import AddSet from "@/components/growth/AddSet";

export const dynamic = "force-dynamic";

// The one room where the business gets bigger.
//
// A merchant who came for a till should not be sold a shop on the screen
// they open every morning. The offer was on the dashboard, which made the
// dashboard the place where every product set piles up, and made the till
// merchant deal with a thing they never asked for.
//
// So there is exactly one place to go when you want more, you go to it
// deliberately, and nothing follows you home.

export default async function Grow() {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) redirect("/onboarding");

  const options = await growthOptions(workspace.businessId, workspace.productSets);
  const available = options.filter((o) => !o.held);
  const held = options.filter((o) => o.held);

  return (
    <PageShell>
      <PageHeader
        title="Add to your business"
        intro="Nothing here starts you over. What you have already built comes with you, which is the whole point of keeping it in one place."
      />

      <div className="max-w-3xl">

        <div className="mt-6 space-y-4">
          {available.length === 0 && (
            <p className="rounded-panel border border-line-brand bg-white px-4 py-4 text-sm text-ink-muted">
              You have taken on everything available to you. Nothing else to add
              right now.
            </p>
          )}

          {available.map((option) => (
            <section key={option.key} className="rounded-panel border border-line-brand bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-teal-dark">
                {option.suits}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-ink">{option.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">{option.pitch}</p>

              {/* The zero silo promise, said in counts a merchant can check
                  against their own records rather than as architecture. */}
              {option.carriesOver.length > 0 && (
                <div className="mt-4 bg-teal-light px-4 py-3">
                  <p className="text-xs font-semibold text-teal-dark">
                    What comes with you
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {option.carriesOver.map((line) => (
                      <li key={line} className="text-sm text-teal-dark">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <AddSet
                businessId={workspace.businessId}
                productSet={option.key}
                name={option.name}
                goTo={option.home}
              />
            </section>
          ))}
        </div>

        {held.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-ink-muted">
              What your business already runs on
            </h2>
            <div className="mt-3 space-y-2">
              {held.map((option) => (
                <Link
                  key={option.key}
                  href={option.home}
                  className="tap flex items-center justify-between border border-line bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium text-ink">{option.name}</span>
                  <span className="text-sm text-teal-dark">Open</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
