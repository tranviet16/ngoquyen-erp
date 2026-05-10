import { requireModuleAccess } from "@/lib/acl/guards";

export default async function DuAnLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("du-an", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
