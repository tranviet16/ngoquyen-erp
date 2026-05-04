import { getLaborDebtMatrix } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { DebtMatrix } from "@/components/ledger/debt-matrix";

export default async function ChiTietNcPage() {
  const [matrixRows, entities, contractors] = await Promise.all([
    getLaborDebtMatrix(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const contractorMap = Object.fromEntries(contractors.map((c) => [c.id, c.name]));
  const rows = matrixRows.map((r) => ({ ...r, partyName: contractorMap[r.partyId] ?? `Đội #${r.partyId}` }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Công nợ chi tiết - Nhân công</h1>
        <p className="text-sm text-muted-foreground">Pivot Chủ thể × Đội thi công, mỗi ô hiển thị TT / HĐ song song</p>
      </div>

      <DebtMatrix rows={rows} entities={entities} partyLabel="Đội thi công" />
    </div>
  );
}
