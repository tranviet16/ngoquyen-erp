import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listMaterialTransactions } from "@/lib/cong-no-vt/material-ledger-service";
import { supplierBalanceAsOf } from "@/lib/vat-tu-ncc/supplier-balance";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { isPeriodLockedType } from "@/lib/ledger/transaction-classification";
import { ThanhToanClient, type PaymentTxRow } from "./thanh-toan-client";

interface Props {
  params: Promise<{ supplierId: string }>;
}

export const dynamic = "force-dynamic";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function ThanhToanPage({ params }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { userId } = await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });

  const [txResult, entities, deliveryProjects, signedPeriods, currentDebt, canCreate, canEdit] = await Promise.all([
    listMaterialTransactions({ partyId: id, transactionTypes: ["thanh_toan", "thue_hd"], pageSize: 500 }),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Công trình NCC từng giao hàng
    prisma.supplierDeliveryDaily.findMany({
      where: { supplierId: id, deletedAt: null, projectId: { not: null } },
      distinct: ["projectId"],
      select: { projectId: true },
    }),
    // Một truy vấn kỳ đã ký của NCC, tính cờ khoá trong bộ nhớ cho từng dòng
    prisma.supplierReconciliation.findMany({
      where: { supplierId: id, signedBySupplier: true, deletedAt: null },
      select: { periodFrom: true, periodTo: true },
    }),
    supplierBalanceAsOf(id, toBusinessDateUtc(new Date())),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "edit", scope: "module" }),
  ]);

  const projectIds = new Set<number>();
  for (const d of deliveryProjects) if (d.projectId != null) projectIds.add(d.projectId);
  for (const t of txResult.items) if (t.projectId != null) projectIds.add(t.projectId);
  const projects = projectIds.size
    ? await prisma.project.findMany({
        where: { id: { in: [...projectIds] }, deletedAt: null },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];

  const rows: PaymentTxRow[] = txResult.items.map((t) => {
    const day = toBusinessDateUtc(t.date).getTime();
    const locked =
      isPeriodLockedType(t.transactionType) &&
      signedPeriods.some((p) => p.periodFrom.getTime() <= day && day <= p.periodTo.getTime());
    return {
      id: t.id,
      date: isoDay(t.date),
      transactionType: t.transactionType as PaymentTxRow["transactionType"],
      entityId: t.entityId,
      projectId: t.projectId,
      amountTt: t.amountTt.toString(),
      amountHd: t.amountHd.toString(),
      totalTt: Number(t.totalTt),
      totalHd: Number(t.totalHd),
      invoiceNo: t.invoiceNo,
      invoiceDate: t.invoiceDate ? isoDay(t.invoiceDate) : null,
      content: t.content,
      fromRound: t.paymentRoundItemId != null,
      locked,
    };
  });

  return (
    <Suspense>
      <ThanhToanClient
        supplierId={id}
        currentDebt={currentDebt}
        rows={rows}
        entities={entities}
        projects={projects}
        canCreate={canCreate}
        canEdit={canEdit}
      />
    </Suspense>
  );
}
