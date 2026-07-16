import { requireModuleAccess } from "@/lib/acl/guards";

export default async function PaymentPlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("thanh-toan.ke-hoach", {
    minLevel: "read",
    scope: "module",
  });
  return <>{children}</>;
}
