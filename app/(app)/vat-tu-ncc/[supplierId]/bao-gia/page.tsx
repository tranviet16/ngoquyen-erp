import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listPriceQuotes } from "@/lib/vat-tu-ncc/price-quote-service";
import { serializeDecimals } from "@/lib/serialize";
import { BaoGiaClient } from "./bao-gia-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function BaoGiaPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();
  const { userId } = await requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" });

  const [quotes, items, canCreate, canEdit] = await Promise.all([
    listPriceQuotes(id),
    prisma.item.findMany({
      where: { deletedAt: null, type: "material" },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true },
    }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "vat-tu-ncc", { minLevel: "edit", scope: "module" }),
  ]);

  return (
    <Suspense>
      <BaoGiaClient
        supplierId={id}
        initialData={serializeDecimals(quotes)}
        items={items}
        canCreate={canCreate}
        canEdit={canEdit}
      />
    </Suspense>
  );
}
