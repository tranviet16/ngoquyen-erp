import { headers } from "next/headers";
import {
  listLaborTransactions,
  patchLaborTransaction,
  adminPatchLaborTransaction,
  bulkUpsertLaborTransactions,
  softDeleteLaborTransactions,
} from "@/lib/cong-no-nc/labor-ledger-service";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LedgerTransactionGrid, type TxRow } from "@/components/ledger-grid/transaction-grid";

export default async function NhapLieuNcPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;
  const [txResult, entities, contractors, projects, items] = await Promise.all([
    listLaborTransactions({ pageSize: 200 }),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({
      where: { deletedAt: null, type: { in: ["labor", "machine"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: TxRow[] = txResult.items.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    transactionType: t.transactionType,
    entityId: t.entityId,
    partyId: t.partyId,
    projectId: t.projectId,
    itemId: t.itemId,
    amountTt: t.amountTt.toString(),
    vatPctTt: t.vatPctTt.toString(),
    vatTt: t.vatTt.toString(),
    totalTt: t.totalTt.toString(),
    amountHd: t.amountHd.toString(),
    vatPctHd: t.vatPctHd.toString(),
    vatHd: t.vatHd.toString(),
    totalHd: t.totalHd.toString(),
    invoiceNo: t.invoiceNo,
    content: t.content,
    status: t.status,
    note: t.note,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nhập liệu công nợ nhân công</h1>
        <p className="text-sm text-muted-foreground">
          Excel-like grid: edit in-place, paste range từ Excel, thêm/xóa dòng. Đối tác = đội thi công.
        </p>
      </div>

      <LedgerTransactionGrid
        initialData={rows}
        entities={entities}
        partyOptions={contractors}
        projects={projects}
        items={items}
        partyLabel="Đội thi công"
        defaults={{ entityId: entities[0]?.id ?? 0, partyId: contractors[0]?.id ?? 0 }}
        actions={{
          patch: patchLaborTransaction,
          adminPatch: adminPatchLaborTransaction,
          bulkUpsert: bulkUpsertLaborTransactions,
          softDeleteMany: softDeleteLaborTransactions,
        }}
        role={role}
      />
    </div>
  );
}
