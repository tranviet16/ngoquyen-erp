/**
 * Sheet "Số Dư Ban Đầu" của file tổng: tiêu đề ở dòng 5, asOf luôn là OPENING_AS_OF
 * (ngày "01/01/2026" trong sheet là đầu ngày, tức cuối ngày 31/12/2025). Nhiều dòng
 * cùng (Chủ thể, NCC, dự án) được cộng lại, kèm cảnh báo.
 */

import { readAmountCell } from "./amount-text";
import { cellString, normKey, type SheetGrid } from "./cell-reader";
import { OPENING_AS_OF } from "./cutover-constants";
import type { IssueSink } from "./parse-issues";
import type { OpeningBalanceRow } from "./types";

const HEADER_ROW = 4; // dòng 5
const HEADERS: { col: number; label: string; accepts: string[] }[] = [
  { col: 0, label: "Chủ Thể", accepts: ["chu the"] },
  { col: 1, label: "Nhà Cung Cấp", accepts: ["nha cung cap", "ncc"] },
  { col: 2, label: "Dự Án / Công Trình", accepts: ["du an", "cong trinh"] },
  { col: 3, label: "Số Dư TT", accepts: ["so du tt"] },
  { col: 4, label: "Số Dư HĐ", accepts: ["so du hd"] },
];

function checkHeaders(grid: SheetGrid, sink: IssueSink): boolean {
  let ok = true;
  for (const h of HEADERS) {
    const key = normKey(cellString(grid.cell(HEADER_ROW, h.col)));
    if (!h.accepts.some((a) => key.startsWith(a))) {
      sink.block("opening-header-mismatch", `Tiêu đề cột phải là "${h.label}".`, grid.ref(HEADER_ROW, h.col));
      ok = false;
    }
  }
  return ok;
}

function readBalance(grid: SheetGrid, row: number, col: number, sink: IssueSink): number | null {
  const read = readAmountCell(grid.cell(row, col));
  if (read.ok) return read.value;
  sink.block("opening-amount-invalid", `Số dư "${read.text}" không phải số.`, grid.ref(row, col));
  return null;
}

export function parseOpeningBalances(grid: SheetGrid, sink: IssueSink): OpeningBalanceRow[] {
  if (!checkHeaders(grid, sink)) return [];
  const byKey = new Map<string, OpeningBalanceRow>();

  for (let r = HEADER_ROW + 1; r < grid.rowCount; r++) {
    const entity = cellString(grid.cell(r, 0));
    if (normKey(entity).includes("tong so du")) break;
    const supplier = cellString(grid.cell(r, 1));
    if (!supplier) continue;
    const project = cellString(grid.cell(r, 2));
    if (!entity || !project) {
      sink.block(
        "opening-missing-key",
        `Dòng số dư thiếu ${!entity ? "Chủ thể" : "dự án / công trình"}.`,
        grid.ref(r, !entity ? 0 : 2),
      );
      continue;
    }
    const tt = readBalance(grid, r, 3, sink);
    const hd = readBalance(grid, r, 4, sink);
    if (tt === null || hd === null) continue;

    const sourceKey = `SD#${r + 1}`;
    const key = [entity, supplier, project].map(normKey).join("|");
    const existing = byKey.get(key);
    if (existing) {
      existing.balanceTt += tt;
      existing.balanceHd += hd;
      existing.mergedFrom.push(sourceKey);
      sink.warn(
        "opening-duplicate-merged",
        `Số dư trùng (${entity}, ${supplier}, ${project}) được cộng vào ${existing.sourceKey}.`,
        grid.ref(r, 1),
      );
      continue;
    }
    byKey.set(key, {
      sourceKey,
      ref: grid.ref(r, 1),
      entityName: entity,
      supplierName: supplier,
      projectName: project,
      balanceTt: tt,
      balanceHd: hd,
      asOf: OPENING_AS_OF,
      mergedFrom: [sourceKey],
    });
  }
  return [...byKey.values()];
}
