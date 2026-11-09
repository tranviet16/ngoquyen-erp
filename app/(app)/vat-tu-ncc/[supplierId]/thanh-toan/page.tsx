import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { requireModuleAccess } from "@/lib/acl/guards";
import { canAccessEntitlement } from "@/lib/acl/effective";
import { listMaterialTransactions } from "@/lib/cong-no-vt/material-ledger-service";
import { pairBalanceAsOf } from "@/lib/vat-tu-ncc/supplier-balance";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { isPeriodLockedType } from "@/lib/ledger/transaction-classification";
import { getMaterialCutoverDate } from "@/lib/vat-tu-ncc/pair-scope";
import { PairProjectRequired, parseProjectIdParam } from "@/components/vat-tu-ncc/pair-project-required";
import { ThanhToanClient, type PaymentTxRow } from "./thanh-toan-client";

interface Props {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function ThanhToanPage({ params, searchParams }: Props) {
  const { supplierId } = await params;
  const id = Number(supplierId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { userId } = await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });
  // Thanh toán / thuế HĐ ghi theo cặp NCC × công trình: thiếu công trình thì chọn trước.
  const projectId = parseProjectIdParam((await searchParams).projectId);
  if (projectId == null) return <PairProjectRequired supplierId={id} tab="thanh-toan" />;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, code: true, name: true, entityId: true },
  });
  if (!project) notFound();

  const [txResult, entities, signedPeriods, cutoverDate, currentDebt, canCreate, canEdit] = await Promise.all([
    listMaterialTransactions({ partyId: id, projectId, transactionTypes: ["thanh_toan", "thue_hd"], pageSize: 500 }),
    // Chủ thể của ghi vật tư = Chủ thể của công trình (server luôn suy lại); chưa gán thì liệt kê đủ
    // để form hợp lệ — server sẽ báo lỗi "Công trình chưa gán Chủ thể" khi lưu.
    prisma.entity.findMany({
      where: { deletedAt: null, ...(project.entityId != null ? { id: project.entityId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Một truy vấn kỳ đã ký của cặp, tính cờ khoá trong bộ nhớ cho từng dòng
    prisma.supplierReconciliation.findMany({
      where: { supplierId: id, projectId, signedBySupplier: true, deletedAt: null },
      select: { periodFrom: true, periodTo: true },
    }),
    // Mốc chuyển đổi toàn cục: mọi ghi/sửa ngày ≤ mốc bị server từ chối (cùng guard với assertPeriodOpen).
    getMaterialCutoverDate(prisma),
    pairBalanceAsOf(id, projectId, toBusinessDateUtc(new Date())),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "create", scope: "module" }),
    canAccessEntitlement(userId, "cong-no-vt", { minLevel: "edit", scope: "module" }),
  ]);

  const rows: PaymentTxRow[] = txResult.items.map((t) => {
    const day = toBusinessDateUtc(t.date).getTime();
    // Cùng điều kiện với guard server (assertMaterialTypeWritable): ngày ≤ mốc chuyển đổi chặn mọi
    // loại; kỳ đã ký của cặp chặn loại bị khoá kỳ.
    const cutoverLocked = cutoverDate != null && day <= cutoverDate.getTime();
    const locked =
      cutoverLocked ||
      (isPeriodLockedType(t.transactionType) &&
        signedPeriods.some((p) => p.periodFrom.getTime() <= day && day <= p.periodTo.getTime()));
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
      lockReason: cutoverLocked ? "cutover" : locked ? "signed" : null,
    };
  });

  return (
    <Suspense>
      <ThanhToanClient
        supplierId={id}
        projectId={projectId}
        currentDebt={currentDebt}
        rows={rows}
        entities={entities}
        projects={[{ id: project.id, code: project.code, name: project.name }]}
        cutoverDate={cutoverDate ? isoDay(cutoverDate) : null}
        canCreate={canCreate}
        canEdit={canEdit}
      />
    </Suspense>
  );
}
