import { requireModuleAccess } from "@/lib/acl/guards";

export default async function SlDtLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("sl-dt", { minLevel: "admin", scope: "module" });
  return <>{children}</>;
}
