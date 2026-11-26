import { ModulePage } from "@/components/shell/Module";
import { EmptyState } from "@/components/shell/Page";
import LookEditor from "@/components/documents/LookEditor";
import { MODULES } from "@/lib/nav/modules";
import { checkPageAccess } from "@/lib/authority/page";
import { currentWorkspace } from "@/lib/nav/workspace";
import { loadLook } from "@/lib/documents/look";

export const dynamic = "force-dynamic";

// How documents look (Modules round 2, R2). Built for every business
// (decision 2): Documents Plus is marked only once it has a price.

export default async function DocumentLookPage() {
  await checkPageAccess("/documents");
  const workspace = await currentWorkspace().catch(() => null);
  const data = workspace ? await loadLook(workspace.businessId).catch(() => null) : null;

  return (
    <ModulePage identity={MODULES.documents} title="How documents look">
      {data === null ? (
        <EmptyState title="Sign in to set how your documents look." detail="We send a code to the WhatsApp number your business is set up with." />
      ) : (
        <LookEditor data={data} />
      )}
    </ModulePage>
  );
}
