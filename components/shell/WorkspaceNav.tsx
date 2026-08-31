import NavBar, { type NavBadge } from "./NavBar";
import { currentWorkspace } from "@/lib/nav/workspace";
import { supabaseServer } from "@/lib/supabase";

// Server side: resolve who this is and what they own, then let the client
// bar decide what to highlight. Signed out, or before a business exists,
// this renders nothing at all.

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
    return [{ href: "/orders", count: count ?? 0 }];
  } catch {
    // A badge is a nicety. Losing it must never cost somebody their nav.
    return [];
  }
}

export default async function WorkspaceNav() {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) return null;

  const badges = await waitingWork(workspace.businessId, workspace.capabilities);

  return (
    <NavBar
      items={workspace.items}
      businessName={workspace.businessName}
      locationName={workspace.locationName}
      personName={workspace.personName}
      businessCount={workspace.businessCount}
      badges={badges}
    />
  );
}
