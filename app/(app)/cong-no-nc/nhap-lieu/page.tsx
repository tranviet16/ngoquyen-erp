import {
  listLaborTransactions,
  createLaborTransaction,
  updateLaborTransaction,
  softDeleteLaborTransaction,
} from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { TransactionGrid, type TransactionRow } from "@/components/ledger/transaction-grid";

export default async function NhapLieuNcPage() {
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

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const contractorMap = Object.fromEntries(contractors.map((c) => [c.id, c.name]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const rows: TransactionRow[] = txResult.items.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    transactionType: t.transactionType,
    entityId: t.entityId,
    entityName: entityMap[t.entityId] ?? `#${t.entityId}`,
    partyId: t.partyId,
    partyName: contractorMap[t.partyId] ?? `#${t.partyId}`,
    projectId: t.projectId,
    projectName: t.projectId ? (projectMap[t.projectId] ?? `#${t.projectId}`) : null,
    itemId: t.itemId,
    amountTt: t.amountTt,
    vatPctTt: t.vatPctTt,
    vatTt: t.vatTt,
    totalTt: t.totalTt,
    amountHd: t.amountHd,
    vatPctHd: t.vatPctHd,
    vatHd: t.vatHd,
    totalHd: t.totalHd,
    invoiceNo: t.invoiceNo,
    content: t.content,
    status: t.status,
    note: t.note,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nhập liệu công nợ nhân công</h1>
        <p className="text-sm text-muted-foreground">Giao dịch TT/HĐ: Lấy hàng, Thanh toán, Điều chỉnh với đội thi công</p>
      </div>

      <TransactionGrid
        initialData={rows}
        partyLabel="Đội thi công"
        title="Nhập liệu công nợ nhân công"
        entities={entities}
        partyOptions={contractors}
        projects={projects}
        items={items}
        onCreate={createLaborTransaction}
        onUpdate={updateLaborTransaction}
        onDelete={softDeleteLaborTransaction}
      />
    </div>
  );
}
