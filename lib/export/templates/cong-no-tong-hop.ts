/**
 * Export template: Tổng hợp công nợ vật tư NCC × Chủ thể (sheet "Công Nợ").
 * Header 3 hàng: tiêu đề; Chủ thể (gộp ngang 6 cột) + "Nhà cung cấp" (gộp dọc); nhãn cột.
 * Nhóm cuối "TỔNG CÔNG TY". Nhãn kỳ do server tính từ cửa sổ đã kiểm tra, không nhận từ client.
 */

import * as XLSX from "xlsx";
import { createWorkbook, workbookToBuffer } from "../excel-exporter";
import { queryDebtMatrix } from "@/lib/ledger/ledger-aggregations";
import { resolveReportPeriod } from "@/lib/ledger/report-period";
import {
  CONG_NO_SHEET_COLUMNS,
  addCongNoSheetCell,
  emptyCongNoSheetCell,
  pickMatrixEntities,
  toCongNoSheetCell,
  type CongNoSheetCell,
} from "@/lib/ledger/debt-matrix-columns";
import { prisma } from "@/lib/prisma";

export interface CongNoTongHopParams {
  /** ISO `YYYY-MM-DD` hoặc null = không giới hạn; đã kiểm tra bằng windowSchema ở route. */
  from: string | null;
  to: string | null;
  entityIds?: number[];
}

const NUM_FMT = "#,##0";
const GROUP_SIZE = CONG_NO_SHEET_COLUMNS.length;

export async function buildCongNoTongHopExcel(params: CongNoTongHopParams): Promise<Buffer> {
  const sp: Record<string, string> = { period: "custom" };
  if (params.from) sp.from = params.from;
  if (params.to) sp.to = params.to;
  const period = resolveReportPeriod(sp, { defaultPreset: "all", legacyMode: "cutoff", today: new Date() });
  if ("error" in period) throw new Error(period.error);

  const entityIds = params.entityIds && params.entityIds.length > 0 ? params.entityIds : undefined;
  const matrix = await queryDebtMatrix("material", { from: period.from, to: period.to, entityIds });

  const [suppliers, allEntities] = await Promise.all([
    prisma.supplier.findMany({
      where: { id: { in: matrix.map((r) => r.partyId) } },
      select: { id: true, name: true },
    }),
    prisma.entity.findMany({ select: { id: true, name: true } }),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const rows = matrix
    .map((r) => ({ ...r, partyName: supplierName.get(r.partyId) ?? `NCC #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "vi"));
  const entities = pickMatrixEntities(allEntities, rows, entityIds);

  const totalCols = 1 + (entities.length + 1) * GROUP_SIZE;
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
  ];
  const groupNames = [...entities.map((e) => e.name), "TỔNG CÔNG TY"];

  const aoa: unknown[][] = [];
  aoa.push([`Tổng hợp công nợ vật tư NCC × Chủ thể — ${period.label}`]);
  const groupRow: unknown[] = ["Nhà cung cấp"];
  const labelRow: unknown[] = [""];
  groupNames.forEach((name, g) => {
    const start = 1 + g * GROUP_SIZE;
    merges.push({ s: { r: 1, c: start }, e: { r: 1, c: start + GROUP_SIZE - 1 } });
    for (let i = 0; i < GROUP_SIZE; i += 1) {
      groupRow.push(i === 0 ? name : "");
      labelRow.push(CONG_NO_SHEET_COLUMNS[i].label);
    }
  });
  aoa.push(groupRow, labelRow);

  const pushCells = (out: unknown[], cell: CongNoSheetCell) => {
    for (const { key } of CONG_NO_SHEET_COLUMNS) out.push(cell[key]);
  };

  const colTotals = groupNames.map(() => emptyCongNoSheetCell());
  for (const r of rows) {
    const line: unknown[] = [r.partyName];
    entities.forEach((e, i) => {
      const raw = r.cells[String(e.id)];
      const c = raw ? toCongNoSheetCell(raw) : emptyCongNoSheetCell();
      pushCells(line, c);
      addCongNoSheetCell(colTotals[i], c);
    });
    const company = toCongNoSheetCell(r.totals);
    pushCells(line, company);
    addCongNoSheetCell(colTotals[entities.length], company);
    aoa.push(line);
  }

  const totalLine: unknown[] = ["TỔNG"];
  for (const t of colTotals) pushCells(totalLine, t);
  aoa.push(totalLine);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 32 }, ...Array.from({ length: totalCols - 1 }, () => ({ wch: 16 }))];
  for (let r = 3; r < aoa.length; r += 1) {
    for (let c = 1; c < totalCols; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = NUM_FMT;
    }
  }

  const wb = createWorkbook();
  XLSX.utils.book_append_sheet(wb, ws, "Công Nợ");
  return workbookToBuffer(wb);
}
