import { Panel, PageHeader, PageShell } from "@/components/shell/Page";
import { Icon, type IconName } from "@/components/shell/icons";
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
//
// Each offer follows the design's "turn on" sheet: what changes, what the
// business already has that comes with it (its own counts, never examples),
// what is included, the price, and one line about what stays as it is.

const ICON: Record<string, IconName> = { shop: "store", pos: "device", services: "calendar", documents: "file" };

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

      <div className="flex max-w-3xl flex-col gap-4">
        {available.length === 0 && (
          <Panel className="px-5 py-4">
            <p className="text-sm text-neutral-600">You have taken on everything available to you. Nothing else to add right now.</p>
          </Panel>
        )}

        {available.map((o) => (
          <Panel key={o.key} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-teal-50 text-teal-700">
                <Icon name={ICON[o.key] ?? "grid"} size={18} />
              </span>
              <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-teal-700">{o.name}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <h2 className="font-heading text-[22px] font-extrabold leading-tight text-ink-heading sm:text-[24px]">{o.title}</h2>
              <p className="text-[14px] leading-relaxed text-neutral-600">{o.body}</p>
            </div>

            {/* The zero silo promise, said in counts a merchant can check
                against their own records rather than as architecture. */}
            {o.carriesOver.length > 0 && (
              <div className="flex flex-col gap-3 rounded-[18px] bg-teal-50 px-4 py-4">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-teal-800">Already in your business</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {o.carriesOver.map((c) => (
                    <span key={c.label} className="flex flex-col gap-0.5 rounded-control bg-white px-3 py-2.5">
                      <span className="num font-heading text-[22px] font-extrabold text-teal-800">{c.n.toLocaleString("en-GH")}</span>
                      <span className="text-[12px] leading-snug text-neutral-600">{c.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <ul className="flex flex-col gap-2">
              {o.includes.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
                  <span aria-hidden className="mt-0.5 flex flex-none text-teal-700">
                    <Icon name="check" size={16} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-[14px] bg-neutral-50 px-4 py-3.5">
              <span className="text-[13px] text-neutral-600">Price</span>
              <span className="font-heading text-[15px] font-extrabold text-ink-heading">Free to switch on</span>
            </div>

            <AddSet businessId={workspace.businessId} productSet={o.key} name={o.name} goTo={o.home} fine={o.fine} />
          </Panel>
        ))}

        {held.length > 0 && (
          <section className="mt-6">
            <h2 className="font-heading text-base font-bold text-ink-heading">What your business already runs on</h2>
            <Panel className="mt-3">
              {held.map((o, i) => (
                <Link
                  key={o.key}
                  href={o.home}
                  className={`tap flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 ${i > 0 ? "border-t border-neutral-100" : ""}`}
                >
                  <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-teal-50 text-teal-700">
                    <Icon name={ICON[o.key] ?? "grid"} size={18} />
                  </span>
                  <span className="flex-1 text-[14px] font-semibold text-ink">{o.name}</span>
                  <span className="flex items-center gap-1 text-[13.5px] font-semibold text-teal-dark">
                    Open
                    <Icon name="chev" size={14} />
                  </span>
                </Link>
              ))}
            </Panel>
          </section>
        )}
      </div>
    </PageShell>
  );
}
