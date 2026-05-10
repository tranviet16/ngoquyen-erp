import {
  listLaborOpeningBalances,
  patchLaborOpeningBalance,
  bulkUpsertLaborOpeningBalances,
  deleteLaborOpeningBalances,
} from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { LedgerOpeningGrid, type OpeningRow } from "@/components/ledger-grid/opening-grid";

export default async function SoDuBanDauNcPage() {
  const [balances, entities, contractors, projects] = await Promise.all([
    listLaborOpeningBalances(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: OpeningRow[] = balances.map((b) => ({
    id: b.id,
    entityId: b.entityId,
    partyId: b.partyId,
    projectId: b.projectId,
    balanceTt: b.balanceTt.toString(),
    balanceHd: b.balanceHd.toString(),
    asOfDate: b.asOfDate.toISOString().slice(0, 10),
    note: b.note,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Số dư ban đầu - Nhân công</h1>
        <p className="text-sm text-muted-foreground">
          Số dư nợ đầu kỳ (Chủ thể, Đội thi công, Dự án). Edit in-place, paste range, thêm/xóa dòng.
        </p>
      </div>
      <LedgerOpeningGrid
        initialData={rows}
        entities={entities}
        partyOptions={contractors}
        projects={projects}
        partyLabel="Đội thi công"
        defaults={{ entityId: entities[0]?.id ?? 0, partyId: contractors[0]?.id ?? 0 }}
        actions={{
          patch: patchLaborOpeningBalance,
          bulkUpsert: bulkUpsertLaborOpeningBalances,
          deleteMany: deleteLaborOpeningBalances,
        }}
      />
    </div>
  );
}
