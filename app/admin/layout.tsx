import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/auth/admin";
import ControlShell, { type ControlNavItem } from "@/components/admin/ControlShell";

// Every Control Center page sits in the navy chrome, and only a platform
// admin gets past this. Anyone else gets a plain 404 from here, before any
// of the page is sent, so the status is a real 404 and the admin area does
// not announce itself. (Each page still checks for itself as well.)

const ITEMS: ControlNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/risk", label: "Risk" },
  { href: "/admin/discover", label: "Discover" },
  { href: "/admin/messaging", label: "Messaging" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin().catch(() => null);
  if (!admin) notFound();
  return (
    <ControlShell items={ITEMS} who={`${admin.name} · ${admin.role}`}>
      {children}
    </ControlShell>
  );
}
