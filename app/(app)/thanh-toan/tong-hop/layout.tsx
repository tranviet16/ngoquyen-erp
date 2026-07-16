import { requireModuleAccess } from "@/lib/acl/guards";

export default async function PaymentSummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("thanh-toan.tong-hop", {
    minLevel: "read",
    scope: "module",
  });
  return <>{children}</>;
}
