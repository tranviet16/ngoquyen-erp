import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listDeliveries } from "@/lib/vat-tu-ncc/delivery-service";
import { serializeDecimals } from "@/lib/serialize";
import { DeliveryGrid } from "@/components/vat-tu-ncc/delivery-grid";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function NgayPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();

  const [deliveries, items, projects] = await Promise.all([
    listDeliveries(id),
    prisma.item.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" } }),
  ]);

  return (
    <Suspense>
      <DeliveryGrid
        supplierId={id}
        initialData={serializeDecimals(deliveries)}
        items={serializeDecimals(items)}
        projects={serializeDecimals(projects)}
      />
    </Suspense>
  );
}
