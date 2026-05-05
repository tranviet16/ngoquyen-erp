import { getMaterialDebtMatrix } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { DebtMatrix, type DebtMatrixRow } from "@/components/ledger/debt-matrix";
import { SupplierMultiSelect } from "@/components/ledger/supplier-multi-select";

interface PageProps {
  searchParams: Promise<{ supplier?: string }>;
}

export default async function ChiTietPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const partyIds = sp.supplier
    ? sp.supplier.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const [matrixRows, entities, suppliers] = await Promise.all([
    getMaterialDebtMatrix(partyIds.length > 0 ? { partyIds } : undefined),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const rows: DebtMatrixRow[] = matrixRows.map((r) => ({
    partyId: r.partyId,
    partyName: supplierMap[r.partyId] ?? `NCC #${r.partyId}`,
    cells: r.cells,
    totals: r.totals,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ chi tiết - Vật tư</h1>
        <p className="text-sm text-muted-foreground">
          Pivot Chủ thể × NCC. Mỗi ô gồm 4 nhóm: Đầu kỳ / Lấy hàng / Trả tiền / Cuối kỳ × (TT, HĐ).
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Lọc NCC:</span>
        <SupplierMultiSelect options={suppliers} selected={partyIds} paramName="supplier" label="NCC" />
      </div>

      <DebtMatrix rows={rows} entities={entities} partyLabel="NCC" />
    </div>
  );
}
