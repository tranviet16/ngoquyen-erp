import { requireModuleAccess } from "@/lib/acl/guards";

export default async function VatTuNccLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  return <>{children}</>;
}
