import { redirect } from "next/navigation";
import { getLaborMonthlyReport, firstLaborEntityWithActivity } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { MonthlyReport } from "@/components/ledger/monthly-report";
import { BaoCaoThangFilterNc } from "./bao-cao-thang-filter-nc";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  searchParams: Promise<{ year?: string; month?: string; entityId?: string }>;
}

export default async function BaoCaoThangNcPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  let entityId = params.entityId ? parseInt(params.entityId, 10) : NaN;
  if (!Number.isFinite(entityId) || entityId <= 0) {
    const fallback = await firstLaborEntityWithActivity(year, month);
    if (fallback == null) {
      const entities = await prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Báo cáo tháng - Nhân công</h1>
          <BaoCaoThangFilterNc currentYear={year} currentMonth={month} currentEntityId={undefined} entities={entities} />
          <p className="text-sm text-muted-foreground py-8 text-center">Chưa có dữ liệu cho bất kỳ chủ thể nào</p>
        </div>
      );
    }
    redirect(`/cong-no-nc/bao-cao-thang?year=${year}&month=${month}&entityId=${fallback}`);
  }

  const [rows, entities, currentEntity] = await Promise.all([
    getLaborMonthlyReport(year, month, entityId),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.entity.findUnique({ where: { id: entityId }, select: { id: true, name: true } }),
  ]);

  const entityName = currentEntity?.name ?? `#${entityId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo tháng - Nhân công</h1>
          <p className="text-sm text-muted-foreground">Phải Trả Đầu Kỳ / PS / Phải Trả Cuối Kỳ theo đội thi công</p>
        </div>
        <div className="flex gap-2">
          <ExcelExportButton
            template="cong-no-monthly"
            params={{ ledgerType: "labor", year, month, entityId }}
            label="Xuất Excel"
            filename={`cong-no-nc-thang-${month}-${year}.xlsx`}
          />
          <PrintButton />
        </div>
      </div>

      <BaoCaoThangFilterNc
        currentYear={year}
        currentMonth={month}
        currentEntityId={entityId}
        entities={entities}
      />

      <MonthlyReport
        rows={serializeDecimals(rows) as never}
        entityName={entityName}
        year={year}
        month={month}
        partyLabel="Đội thi công"
      />
    </div>
  );
}
