import {
  listMaterialOpeningBalances,
  patchMaterialOpeningBalance,
  bulkUpsertMaterialOpeningBalances,
  deleteMaterialOpeningBalances,
} from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { LedgerOpeningGrid, type OpeningRow } from "@/components/ledger-grid/opening-grid";

export default async function SoDuBanDauPage() {
  const [balances, entities, suppliers, projects] = await Promise.all([
    listMaterialOpeningBalances(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
        <h1 className="text-2xl font-bold">Số dư ban đầu - Vật tư</h1>
        <p className="text-sm text-muted-foreground">
          Số dư nợ đầu kỳ (Chủ thể, NCC, Dự án). Edit in-place, paste range, thêm/xóa dòng.
        </p>
      </div>
      <LedgerOpeningGrid
        initialData={rows}
        entities={entities}
        partyOptions={suppliers}
        projects={projects}
        partyLabel="Nhà cung cấp"
        defaults={{ entityId: entities[0]?.id ?? 0, partyId: suppliers[0]?.id ?? 0 }}
        actions={{
          patch: patchMaterialOpeningBalance,
          bulkUpsert: bulkUpsertMaterialOpeningBalances,
          deleteMany: deleteMaterialOpeningBalances,
        }}
      />
    </div>
  );
}
