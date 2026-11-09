import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { listDeliveriesMonthly } from "@/lib/vat-tu-ncc/delivery-service";
import { parseProjectIdParam } from "@/components/vat-tu-ncc/pair-project-required";
import { ThangGrid } from "./thang-grid";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function ThangPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  // Có `?projectId=` thì chỉ cộng phiếu của cặp; không có thì mọi công trình của NCC.
  const projectId = parseProjectIdParam((await searchParams).projectId) ?? undefined;

  const [monthly, items, project] = await Promise.all([
    listDeliveriesMonthly(id, { projectId }),
    prisma.item.findMany({ where: { deletedAt: null } }),
    projectId === undefined
      ? Promise.resolve(null)
      : prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { code: true, name: true } }),
  ]);
  if (projectId !== undefined && !project) notFound();

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
      <ThangGrid rows={rows} scopeLabel={project ? `${project.code} — ${project.name}` : null} />
    </Suspense>
  );
}
