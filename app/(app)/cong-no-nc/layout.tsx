import { requireModuleAccess } from "@/lib/acl/guards";

export default async function CongNoNcLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("cong-no-nc", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
