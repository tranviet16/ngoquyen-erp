import { listMaterialTransactions } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { TransactionGrid, type TransactionRow } from "@/components/cong-no-vt/transaction-grid";

export default async function NhapLieuPage() {
  const [txResult, entities, suppliers, projects, items] = await Promise.all([
    listMaterialTransactions({ pageSize: 200 }),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { deletedAt: null, type: "material" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const rows: TransactionRow[] = txResult.items.map((t) => ({
    id: t.id,
    date: t.date.toISOString(),
    transactionType: t.transactionType,
    entityId: t.entityId,
    entityName: entityMap[t.entityId] ?? `#${t.entityId}`,
    partyId: t.partyId,
    partyName: supplierMap[t.partyId] ?? `#${t.partyId}`,
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
        <h1 className="text-2xl font-bold">Nhập liệu công nợ vật tư</h1>
        <p className="text-sm text-muted-foreground">Giao dịch TT/HĐ: Lấy hàng, Thanh toán, Điều chỉnh</p>
      </div>

      <TransactionGrid
        initialData={rows}
        entities={entities}
        suppliers={suppliers}
        projects={projects}
        items={items}
      />
    </div>
  );
}
