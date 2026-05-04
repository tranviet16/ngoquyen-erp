import { listMaterialOpeningBalances, setMaterialOpeningBalance, deleteMaterialOpeningBalance } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { OpeningBalanceClient } from "@/components/ledger/opening-balance-client";

export default async function SoDuBanDauPage() {
  const [balances, entities, suppliers] = await Promise.all([
    listMaterialOpeningBalances(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const rows = balances.map((b) => ({
    id: b.id,
    entityId: b.entityId,
    entityName: entityMap[b.entityId] ?? `#${b.entityId}`,
    partyId: b.partyId,
    partyName: supplierMap[b.partyId] ?? `#${b.partyId}`,
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
        <p className="text-sm text-muted-foreground">Số dư nợ đầu kỳ tính theo (Chủ thể, NCC, Dự án)</p>
      </div>
      <OpeningBalanceClient
        initialData={rows}
        entities={entities}
        partyOptions={suppliers}
        partyLabel="Nhà cung cấp"
        onSet={setMaterialOpeningBalance}
        onDelete={deleteMaterialOpeningBalance}
      />
    </div>
  );
}
