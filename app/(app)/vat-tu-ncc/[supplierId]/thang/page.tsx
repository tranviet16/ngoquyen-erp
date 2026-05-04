import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listDeliveriesMonthly } from "@/lib/vat-tu-ncc/delivery-service";
import { ThangGrid } from "./thang-grid";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

export default async function ThangPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (isNaN(id)) notFound();

  const [monthly, items] = await Promise.all([
    listDeliveriesMonthly(id),
    prisma.item.findMany({ where: { deletedAt: null } }),
  ]);

  const itemMap = Object.fromEntries(items.map((i) => [i.id, `${i.code} - ${i.name}`]));

  const rows = monthly.map((r) => ({
    itemId: r.item_id,
    itemName: itemMap[r.item_id] ?? String(r.item_id),
    month: r.month,
    qty: Number(r.qty),
    unit: r.unit,
  }));

  return (
    <Suspense>
      <ThangGrid rows={rows} />
    </Suspense>
  );
}
