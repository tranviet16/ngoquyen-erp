import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { ChotKyClient } from "./chot-ky-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ChotKyPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  const canEdit = await canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" });

  return (
    <Suspense>
      <ChotKyClient supplierId={id} canEdit={canEdit} />
    </Suspense>
  );
}
