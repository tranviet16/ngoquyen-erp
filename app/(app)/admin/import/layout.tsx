import { requireModuleAccess } from "@/lib/acl/guards";

export default async function AdminImportLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("admin.import", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
