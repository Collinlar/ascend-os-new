import NavBar, { type NavBadge } from "./NavBar";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";

// Server side: resolve who this is and what they own, then let the client
// shell decide what to highlight. It wraps the page, so the desktop sidebar
// can hold the left edge. Signed out, or before a business exists, the page
// renders on its own.

// Work that is waiting, counted once for the tab that owns it. The design
// puts a number beside Orders, and a number nobody has to go looking for is
// the whole reason a tab bar beats a menu.
async function waitingWork(
  businessId: string,
  capabilities: Set<string>
): Promise<NavBadge[]> {
  if (!capabilities.has("shop.orders")) return [];
  try {
    const { count } = await supabaseServer()
      .from("shop_order")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "pending");
    // The same count on Shop, which holds Orders once it folds them in.
    return [
      { href: "/orders", count: count ?? 0 },
      { href: "/shop", count: count ?? 0 },
    ];
  } catch {
    // A badge is a nicety. Losing it must never cost somebody their nav.
    return [];
  }
}

export default async function WorkspaceNav({ children }: { children: React.ReactNode }) {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) return <>{children}</>;

  const badges = await waitingWork(workspace.businessId, workspace.capabilities);

  return (
    <NavBar
      items={workspace.items}
      businessName={workspace.businessName}
      locationName={workspace.locationName}
      personName={workspace.personName}
      roleName={workspace.roleName}
      businessCount={workspace.businessCount}
      badges={badges}
      places={workspace.places}
      locationId={workspace.locationId}
    >
      {children}
    </NavBar>
  );
}
