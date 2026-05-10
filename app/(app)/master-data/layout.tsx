import { requireModuleAccess } from "@/lib/acl/guards";

export default async function MasterDataLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("master-data", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
