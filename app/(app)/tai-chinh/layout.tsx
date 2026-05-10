import { requireModuleAccess } from "@/lib/acl/guards";

export default async function TaiChinhLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("tai-chinh", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
