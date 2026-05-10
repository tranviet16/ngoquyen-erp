import { requireModuleAccess } from "@/lib/acl/guards";

export default async function CongNoVtLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
