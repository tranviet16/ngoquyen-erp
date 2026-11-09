/**
 * Export template: Tổng hợp công nợ vật tư theo công trình (sheet "Công nợ công trình").
 *
 * Cùng pivot với trang `/cong-no-vt/tong-hop-cong-trinh`: một lần `queryDetailReport` rồi
 * `buildProjectPivot` theo đúng chiều nhóm đang xem (NCC → công trình hoặc công trình → NCC).
 * Bố cục: hàng tiêu đề; header 2 hàng gộp ô (tên cấp 1 / cấp 2 gộp dọc, "Thực tế (TT)" và
 * "Hóa đơn (HĐ)" gộp ngang 4 cột); mỗi nhóm một dòng tổng rồi các dòng con; dòng "TỔNG CỘNG".
 * Nhãn kỳ và nhãn cột do server tính từ cửa sổ đã kiểm tra, không nhận từ client.
 */

import * as XLSX from "xlsx";
import { createWorkbook, workbookToBuffer } from "../excel-exporter";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import {
  PIVOT_GROUP_LABELS,
  PIVOT_SIDE_LABELS,
  buildProjectPivot,
  pivotColumnMode,
  pivotColumns,
  type PivotAmounts,
  type ProjectDebtQuery,
} from "@/lib/cong-no-vt/project-debt-pivot";
import { resolveReportPeriod } from "@/lib/ledger/report-period";
import { prisma } from "@/lib/prisma";

/** Đã kiểm tra bằng `parseProjectDebtQuery` ở route. */
export type CongNoCongTrinhParams = ProjectDebtQuery;

export const CONG_NO_CONG_TRINH_SHEET = "Công nợ công trình";
export const CONG_NO_CONG_TRINH_TOTAL_LABEL = "TỔNG CỘNG";

const NUM_FMT = "#,##0";
/** Hai cột tên (cấp 1, cấp 2) đứng trước các cột số. */
const NAME_COLS = 2;
/** Dòng tiêu đề + 2 dòng header. */
const HEADER_ROWS = 3;

export async function buildCongNoCongTrinhExcel(params: CongNoCongTrinhParams): Promise<Buffer> {
  const sp: Record<string, string> = { period: "custom" };
  if (params.from) sp.from = params.from;
  if (params.to) sp.to = params.to;
  const period = resolveReportPeriod(sp, { defaultPreset: "all", legacyMode: "cutoff", today: new Date() });
  if ("error" in period) throw new Error(period.error);

  const entityIds = params.entityIds.length > 0 ? params.entityIds : undefined;
  const [{ rows }, entities] = await Promise.all([
    queryDetailReport({
      ledgerType: "material",
      ...(period.from ? { from: period.from } : {}),
      ...(period.to ? { to: period.to } : {}),
      entityIds,
      showZero: false,
    }),
    entityIds
      ? prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const pivot = buildProjectPivot(rows, params.groupBy);
  const columns = pivotColumns(pivotColumnMode(period.from));
  const labels = PIVOT_GROUP_LABELS[params.groupBy];
  const totalCols = NAME_COLS + columns.length;

  const entityNames = entities.map((e) => e.name).sort((a, b) => a.localeCompare(b, "vi"));
  const title = [
    `Công nợ vật tư theo công trình (${labels.title}) — ${period.label}`,
    ...(entityNames.length > 0 ? [`Chủ thể: ${entityNames.join(", ")}`] : []),
  ].join(" — ");

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
  ];
  const sideRow: unknown[] = [labels.level1, labels.level2];
  const labelRow: unknown[] = ["", ""];
  columns.forEach((col, i) => {
    const firstOfSide = i === 0 || columns[i - 1].side !== col.side;
    sideRow.push(firstOfSide ? PIVOT_SIDE_LABELS[col.side] : "");
    labelRow.push(col.label);
    if (firstOfSide) {
      const span = columns.filter((c) => c.side === col.side).length;
      merges.push({ s: { r: 1, c: NAME_COLS + i }, e: { r: 1, c: NAME_COLS + i + span - 1 } });
    }
  });

  const amountsOf = (a: PivotAmounts) => columns.map((c) => a[c.key]);
  const aoa: unknown[][] = [[title], sideRow, labelRow];
  for (const g of pivot.groups) {
    aoa.push([g.name, "", ...amountsOf(g.amounts)]);
    for (const child of g.children) aoa.push(["", child.name, ...amountsOf(child.amounts)]);
  }
  aoa.push([CONG_NO_CONG_TRINH_TOTAL_LABEL, "", ...amountsOf(pivot.total)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 32 }, { wch: 32 }, ...columns.map(() => ({ wch: 18 }))];
  for (let r = HEADER_ROWS; r < aoa.length; r += 1) {
    for (let c = NAME_COLS; c < totalCols; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = NUM_FMT;
    }
  }

  const wb = createWorkbook();
  XLSX.utils.book_append_sheet(wb, ws, CONG_NO_CONG_TRINH_SHEET);
  return workbookToBuffer(wb);
}
