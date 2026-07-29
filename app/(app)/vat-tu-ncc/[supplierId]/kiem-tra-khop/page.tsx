import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { KiemTraKhopClient } from "./kiem-tra-khop-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function KiemTraKhopPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  await requireActiveAdmin();

  return (
    <Suspense>
      <KiemTraKhopClient supplierId={id} />
    </Suspense>
  );
}
