import { requireModuleAccess } from "@/lib/acl/guards";

export default async function AdminNguoiDungLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("admin.nguoi-dung", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
