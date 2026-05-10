import { requireModuleAccess } from "@/lib/acl/guards";

export default async function PermissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("admin.permissions", {
    minLevel: "admin",
    scope: "module",
  });
  return <>{children}</>;
}
