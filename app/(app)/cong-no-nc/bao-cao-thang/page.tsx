import { getLaborMonthlyReport } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { MonthlyReport } from "@/components/ledger/monthly-report";
import { BaoCaoThangFilterNc } from "./bao-cao-thang-filter-nc";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";

interface Props {
  searchParams: Promise<{ year?: string; entityId?: string }>;
}

export default async function BaoCaoThangNcPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();
  const entityId = params.entityId ? parseInt(params.entityId, 10) : undefined;

  const [rows, entities] = await Promise.all([
    getLaborMonthlyReport(year, entityId),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo tháng - Nhân công</h1>
          <p className="text-sm text-muted-foreground">Lấy hàng / Thanh toán / Điều chỉnh theo tháng với đội thi công</p>
        </div>
        <div className="flex gap-2">
          <ExcelExportButton
            template="cong-no-monthly"
            params={{ ledgerType: "labor", year, entityId }}
            label="Xuất Excel"
            filename={`cong-no-nc-thang-${year}.xlsx`}
          />
          <PrintButton />
        </div>
      </div>

      <BaoCaoThangFilterNc currentYear={year} currentEntityId={entityId} entities={entities} />

      <MonthlyReport rows={rows} entityMap={entityMap} />
    </div>
  );
}
