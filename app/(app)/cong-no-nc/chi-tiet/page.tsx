import { getLaborDebtMatrix } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { DebtMatrix, type DebtMatrixRow } from "@/components/ledger/debt-matrix";
import { SupplierMultiSelect } from "@/components/ledger/supplier-multi-select";

interface PageProps {
  searchParams: Promise<{ supplier?: string }>;
}

export default async function ChiTietNcPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const partyIds = sp.supplier
    ? sp.supplier.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const [matrixRows, entities, contractors] = await Promise.all([
    getLaborDebtMatrix(partyIds.length > 0 ? { partyIds } : undefined),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const contractorMap = Object.fromEntries(contractors.map((c) => [c.id, c.name]));
  const rows: DebtMatrixRow[] = matrixRows.map((r) => ({
    partyId: r.partyId,
    partyName: contractorMap[r.partyId] ?? `Đội #${r.partyId}`,
    cells: r.cells,
    totals: r.totals,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ chi tiết - Nhân công</h1>
        <p className="text-sm text-muted-foreground">
          Pivot Chủ thể × Đội thi công. Mỗi ô gồm 4 nhóm: Đầu kỳ / Lấy hàng / Trả tiền / Cuối kỳ × (TT, HĐ).
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Lọc đội:</span>
        <SupplierMultiSelect options={contractors} selected={partyIds} paramName="supplier" label="Đội" />
      </div>

      <DebtMatrix rows={rows} entities={entities} partyLabel="Đội thi công" />
    </div>
  );
}
