import { requireModuleAccess } from "@/lib/acl/guards";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("dashboard", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
