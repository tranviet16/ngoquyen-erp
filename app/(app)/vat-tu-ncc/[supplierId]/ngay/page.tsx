import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listDeliveries } from "@/lib/vat-tu-ncc/delivery-service";
import { listPriceQuotes } from "@/lib/vat-tu-ncc/price-quote-service";
import { serializeDecimals } from "@/lib/serialize";
import { DeliveryGrid } from "@/components/vat-tu-ncc/delivery-grid";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { parseProjectIdParam } from "@/components/vat-tu-ncc/pair-project-required";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function NgayPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });
  // Có `?projectId=` thì chỉ xem phiếu của cặp; không có thì mọi công trình của NCC.
  const projectId = parseProjectIdParam((await searchParams).projectId) ?? undefined;

  const [deliveries, items, projects, quotes, canCreate, canEdit] = await Promise.all([
    listDeliveries(id, { projectId }),
    prisma.item.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
    listPriceQuotes(id),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" }),
  ]);
  // `?projectId=` trỏ tới công trình không tồn tại / đã xoá → 404 thay vì khoá form vào công trình lỗi.
  if (projectId !== undefined && !projects.some((p) => p.id === projectId)) notFound();

  return (
    <Suspense>
      <DeliveryGrid
        supplierId={id}
        initialData={serializeDecimals(deliveries)}
        items={serializeDecimals(items)}
        projects={serializeDecimals(projects)}
        quotes={serializeDecimals(quotes).map((q) => ({
          id: q.id,
          itemId: q.itemId,
          unitPrice: q.unitPrice as unknown as number,
          effectiveFrom: q.effectiveFrom,
        }))}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canEdit}
        lockedProjectId={projectId}
      />
    </Suspense>
  );
}
