import { requireModuleAccess } from "@/lib/acl/guards";

export default async function HieuSuatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("van-hanh.hieu-suat", {
    minLevel: "read",
    scope: { kind: "role", roleScope: "self" },
  });

  return <>{children}</>;
}
