import { requireModuleAccess } from "@/lib/acl/guards";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod } from "@/lib/ledger/report-period";
import { getProjectDebtSummary } from "@/lib/cong-no-vt/project-debt-summary-service";
import {
  PIVOT_GROUP_BY,
  PIVOT_GROUP_LABELS,
  parseProjectDebtQuery,
  type PivotGroupBy,
} from "@/lib/cong-no-vt/project-debt-pivot";
import { ExcelExportButton, PrintButton } from "@/components/export-buttons";
import { TongHopCongTrinhFilter } from "./tong-hop-cong-trinh-client";
import { ProjectDebtPivotTable } from "./project-debt-pivot-table";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isGroupBy = (v: string | undefined): v is PivotGroupBy =>
  v !== undefined && (PIVOT_GROUP_BY as readonly string[]).includes(v);

export default async function TongHopCongTrinhPage({ searchParams }: PageProps) {
  await requireModuleAccess("cong-no-vt", { minLevel: "read", scope: "module" });

  const sp = await searchParams;
  // Mặc định xem theo năm hiện tại (thay file "Quản Lý Công Nợ Vật Tư" vốn xem theo năm).
  const options = { defaultPreset: "year", legacyMode: "cutoff", today: new Date() } as const;
  const requested = resolveReportPeriod(sp, options);
  const period = "error" in requested ? resolveReportPeriod({}, options) : requested;
  if ("error" in period) throw new Error(period.error);

  const groupByRaw = one(sp.groupBy);
  const groupBy: PivotGroupBy = isGroupBy(groupByRaw) ? groupByRaw : "ncc";
  const entityIds = [
    ...new Set(
      (one(sp.entityIds)?.split(",") ?? [])
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
  const from = isoDay(period.from);
  const to = isoDay(period.to);
  // Kiểm cùng quy tắc với server action / route để URL sai hiện thông báo thay vì trang lỗi.
  const query = parseProjectDebtQuery({ from, to, groupBy: groupByRaw ?? "ncc", entityIds });
  const paramError = "error" in requested ? requested.error : "error" in query ? query.error : null;

  const [summary, entities] = await Promise.all([
    paramError ? Promise.resolve(null) : getProjectDebtSummary({ from, to, groupBy, entityIds }),
    prisma.entity.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const formula =
    summary?.mode === "cumulative"
      ? "Còn nợ = Số dư chuyển sang + LH lũy kế − Đã trả lũy kế. Số dư chuyển sang chỉ khác 0 ở cặp giữ số dư ròng; " +
        "ở cặp đã duyệt lũy kế, LH lũy kế gồm dòng \"Lũy kế chuyển đổi\" ngày 26/12/2025."
      : "Cuối kỳ = Đầu kỳ + PS tăng − PS giảm.";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tổng hợp công nợ vật tư theo công trình</h1>
          <p className="text-sm text-muted-foreground">
            Kỳ xem: {period.label} · Nhóm {PIVOT_GROUP_LABELS[groupBy].title} (TT = thực tế, HĐ = hóa đơn).
          </p>
        </div>
        {!paramError && (
          <div className="flex gap-2">
            <ExcelExportButton
              template="cong-no-cong-trinh"
              params={{ from, to, groupBy, entityIds }}
              label="Xuất Excel"
              filename={`cong-no-cong-trinh-${groupBy}-${from ?? "toan-bo"}-${to ?? "den-nay"}.xlsx`}
            />
            <PrintButton />
          </div>
        )}
      </div>

      <TongHopCongTrinhFilter
        currentPeriod={period.params}
        groupBy={groupBy}
        entities={entities}
        selectedEntityIds={entityIds}
      />

      {paramError || !summary ? (
        <p role="alert" className="text-sm text-destructive">
          {paramError}. Chưa tải dữ liệu; hãy chọn lại bộ lọc.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{formula}</p>
          <ProjectDebtPivotTable pivot={summary.pivot} mode={summary.mode} />
        </>
      )}
    </div>
  );
}
