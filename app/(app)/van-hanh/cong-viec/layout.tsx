import { requireModuleAccess } from "@/lib/acl/guards";

export default async function CongViecLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("van-hanh.cong-viec", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
