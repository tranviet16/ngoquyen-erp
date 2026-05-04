import { getMaterialDebtMatrix } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { DebtMatrix } from "@/components/ledger/debt-matrix";

export default async function ChiTietPage() {
  const [matrixRows, entities, suppliers] = await Promise.all([
    getMaterialDebtMatrix(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const rows = matrixRows.map((r) => ({ ...r, partyName: supplierMap[r.partyId] ?? `NCC #${r.partyId}` }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ chi tiết - Vật tư</h1>
        <p className="text-sm text-muted-foreground">Pivot Chủ thể × NCC, mỗi ô hiển thị TT / HĐ song song</p>
      </div>

      <DebtMatrix rows={rows} entities={entities} partyLabel="NCC" />
    </div>
  );
}
