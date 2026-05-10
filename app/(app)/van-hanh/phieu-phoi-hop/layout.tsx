import { requireModuleAccess } from "@/lib/acl/guards";

export default async function PhieuPhoiHopLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("van-hanh.phieu-phoi-hop", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
