import { requireModuleAccess } from "@/lib/acl/guards";

export default async function AdminPhongBanLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("admin.phong-ban", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
