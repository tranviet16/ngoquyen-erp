import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listDeliveries } from "@/lib/vat-tu-ncc/delivery-service";
import { serializeDecimals } from "@/lib/serialize";
import { DeliveryGrid } from "@/components/vat-tu-ncc/delivery-grid";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function NgayPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });

  const [deliveries, items, projects, canCreate, canEdit] = await Promise.all([
    listDeliveries(id),
    prisma.item.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" }),
  ]);

  return (
    <Suspense>
      <DeliveryGrid
        supplierId={id}
        initialData={serializeDecimals(deliveries)}
        items={serializeDecimals(items)}
        projects={serializeDecimals(projects)}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canEdit}
      />
    </Suspense>
  );
}
