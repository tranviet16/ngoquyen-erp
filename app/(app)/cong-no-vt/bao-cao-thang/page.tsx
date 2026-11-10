import { redirect } from "next/navigation";
import {
  getMaterialWindowReport,
  firstMaterialEntityWithActivity,
  latestMaterialActivityDate,
} from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod } from "@/lib/ledger/report-period";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { MonthlyReport } from "@/components/ledger/monthly-report";
import { BaoCaoThangFilter } from "./bao-cao-thang-filter";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function BaoCaoThangPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const options = { defaultPreset: "month", legacyMode: "month", today: now } as const;
  // `?year=&month=` cũ vẫn là cửa sổ tháng. Khi URL không chọn mốc nào: mở tháng gần nhất có phát sinh
  // (không sau hôm nay) thay vì tháng hiện tại, để đầu tháng chưa nhập liệu không ra bảng toàn số 0.
  const hasExplicitPeriod = params.period !== undefined || params.year !== undefined;
  const latest = hasExplicitPeriod ? null : await latestMaterialActivityDate(toBusinessDateUtc(now));
  const requested = latest
    ? resolveReportPeriod(
        { period: "month", y: String(latest.getUTCFullYear()), m: String(latest.getUTCMonth() + 1) },
        options,
      )
    : resolveReportPeriod(params, options);
  const periodError = "error" in requested ? requested.error : null;
  const period = "error" in requested ? resolveReportPeriod({}, options) : requested;
  if ("error" in period) throw new Error(period.error);

  const entities = await prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  const rawEntityId = Array.isArray(params.entityId) ? params.entityId[0] : params.entityId;
  const entityId = rawEntityId ? parseInt(rawEntityId, 10) : NaN;
  if (!Number.isFinite(entityId) || entityId <= 0) {
    // Chủ thể có phát sinh trong tháng chứa đầu cửa sổ (hoặc cuối cửa sổ, hoặc hôm nay).
    const anchor = period.from ?? period.to ?? now;
    const fallback = await firstMaterialEntityWithActivity(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1);
    if (fallback == null) {
      return (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Báo cáo tháng - Vật tư</h1>
          <BaoCaoThangFilter currentPeriod={period.params} currentEntityId={undefined} entities={entities} />
          <p className="text-sm text-muted-foreground py-8 text-center">Chưa có dữ liệu cho bất kỳ chủ thể nào</p>
        </div>
      );
    }
    // Giữ nguyên tham số mốc đã chuẩn hoá khi chuyển hướng.
    redirect(`/cong-no-vt/bao-cao-thang?${new URLSearchParams({ ...period.params, entityId: String(fallback) }).toString()}`);
  }

  const [rows, currentEntity] = await Promise.all([
    getMaterialWindowReport({ from: isoDay(period.from), to: isoDay(period.to) }, entityId),
    prisma.entity.findUnique({ where: { id: entityId }, select: { id: true, name: true } }),
  ]);

  const entityName = currentEntity?.name ?? `#${entityId}`;
  const periodSlug = Object.values(period.params).join("-");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo tháng - Vật tư</h1>
          <p className="text-sm text-muted-foreground">Phải Trả Đầu Kỳ / PS / Phải Trả Cuối Kỳ theo nhà cung cấp</p>
        </div>
        <div className="flex gap-2">
          <ExcelExportButton
            template="cong-no-monthly"
            params={{ ledgerType: "material", ...period.params, entityId }}
            label="Xuất Excel"
            filename={`cong-no-vt-bao-cao-${periodSlug}.xlsx`}
          />
          <PrintButton />
        </div>
      </div>

      <BaoCaoThangFilter
        currentPeriod={period.params}
        currentEntityId={entityId}
        entities={entities}
      />
      {periodError && (
        <p role="alert" className="text-sm text-destructive">
          {periodError}. Đang hiển thị tháng hiện tại.
        </p>
      )}

      <MonthlyReport
        rows={serializeDecimals(rows) as never}
        entityName={entityName}
        periodLabel={period.label}
        partyLabel="NCC"
      />
    </div>
  );
}
