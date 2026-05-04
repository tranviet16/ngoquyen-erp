import { listLaborOpeningBalances, setLaborOpeningBalance, deleteLaborOpeningBalance } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { OpeningBalanceClient } from "@/components/ledger/opening-balance-client";

export default async function SoDuBanDauNcPage() {
  const [balances, entities, contractors] = await Promise.all([
    listLaborOpeningBalances(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const contractorMap = Object.fromEntries(contractors.map((c) => [c.id, c.name]));

  const rows = balances.map((b) => ({
    id: b.id,
    entityId: b.entityId,
    entityName: entityMap[b.entityId] ?? `#${b.entityId}`,
    partyId: b.partyId,
    partyName: contractorMap[b.partyId] ?? `#${b.partyId}`,
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
        <p className="text-sm text-muted-foreground">Số dư nợ đầu kỳ tính theo (Chủ thể, Đội thi công, Dự án)</p>
      </div>
      <OpeningBalanceClient
        initialData={rows}
        entities={entities}
        partyOptions={contractors}
        partyLabel="Đội thi công"
        onSet={setLaborOpeningBalance}
        onDelete={deleteLaborOpeningBalance}
      />
    </div>
  );
}
