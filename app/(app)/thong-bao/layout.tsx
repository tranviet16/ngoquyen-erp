import { requireModuleAccess } from "@/lib/acl/guards";

export default async function ThongBaoLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("thong-bao", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
