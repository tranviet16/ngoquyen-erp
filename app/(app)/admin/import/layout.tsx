import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

export default async function AdminImportLayout({ children }: { children: React.ReactNode }) {
  await requireActiveAdmin();
  return <>{children}</>;
}
