import { getMaterialMonthlyReport } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { MonthlyReport } from "@/components/cong-no-vt/monthly-report";
import { BaoCaoThangFilter } from "./bao-cao-thang-filter";

interface Props {
  searchParams: Promise<{ year?: string; entityId?: string }>;
}

export default async function BaoCaoThangPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const entityId = params.entityId ? parseInt(params.entityId, 10) : undefined;

  const [rows, entities] = await Promise.all([
    getMaterialMonthlyReport(year, entityId),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo tháng - Vật tư</h1>
        <p className="text-sm text-muted-foreground">Lấy hàng / Thanh toán / Điều chỉnh theo tháng</p>
      </div>

      <BaoCaoThangFilter currentYear={year} currentEntityId={entityId} entities={entities} />

      <MonthlyReport rows={rows} entityMap={entityMap} />
    </div>
  );
}
