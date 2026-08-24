import NavBar from "./NavBar";
import { currentWorkspace } from "@/lib/nav/workspace";

// Server side: resolve who this is and what they own, then let the client
// bar decide what to highlight. Signed out, or before a business exists,
// this renders nothing at all.

export default async function WorkspaceNav() {
  const workspace = await currentWorkspace().catch(() => null);
  if (!workspace) return null;
  return (
    <NavBar
      items={workspace.items}
      businessName={workspace.businessName}
      businessCount={workspace.businessCount}
    />
  );
}
