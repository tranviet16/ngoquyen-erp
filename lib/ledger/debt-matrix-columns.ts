/**
 * Cột của ma trận NCC × Chủ thể theo mẫu sheet "Công Nợ": mỗi Chủ thể 6 cột
 * LH TT, Trả TT, Nợ TT, LH HĐ, Trả HĐ, Nợ HĐ. Dùng chung cho trang tổng hợp và Excel.
 * Module thuần: không import Prisma/Next.
 *
 * LH (lấy hàng luỹ kế) = Đầu kỳ + Phát sinh tăng; Nợ = Cuối kỳ; Nợ = LH − Trả.
 */

import type { MatrixCell } from "./ledger-types";

export type CongNoSheetKey = "lhTt" | "traTt" | "noTt" | "lhHd" | "traHd" | "noHd";

export type CongNoSheetCell = Record<CongNoSheetKey, number>;

export const CONG_NO_SHEET_COLUMNS: ReadonlyArray<{ key: CongNoSheetKey; label: string }> = [
  { key: "lhTt", label: "LH TT" },
  { key: "traTt", label: "Trả TT" },
  { key: "noTt", label: "Nợ TT" },
  { key: "lhHd", label: "LH HĐ" },
  { key: "traHd", label: "Trả HĐ" },
  { key: "noHd", label: "Nợ HĐ" },
];

export function emptyCongNoSheetCell(): CongNoSheetCell {
  return { lhTt: 0, traTt: 0, noTt: 0, lhHd: 0, traHd: 0, noHd: 0 };
}

/** Đổi ô ma trận 8 chỉ số sang 6 cột của sheet "Công Nợ". */
export function toCongNoSheetCell(cell: MatrixCell): CongNoSheetCell {
  return {
    lhTt: cell.openTt + cell.layTt,
    traTt: cell.traTt,
    noTt: cell.closeTt,
    lhHd: cell.openHd + cell.layHd,
    traHd: cell.traHd,
    noHd: cell.closeHd,
  };
}

export function addCongNoSheetCell(target: CongNoSheetCell, source: CongNoSheetCell): void {
  for (const { key } of CONG_NO_SHEET_COLUMNS) target[key] += source[key];
}

/** true khi cả 8 chỉ số đều bằng 0 (dòng NCC không có số liệu trong cửa sổ). */
export function isZeroMatrixCell(cell: MatrixCell): boolean {
  return (
    cell.openTt === 0 && cell.openHd === 0 && cell.layTt === 0 && cell.layHd === 0 &&
    cell.traTt === 0 && cell.traHd === 0 && cell.closeTt === 0 && cell.closeHd === 0
  );
}

export interface MatrixEntity {
  id: number;
  name: string;
}

/**
 * Chủ thể hiển thị thành cột, sắp theo tên (vi). Có `entityIds` thì đúng các Chủ thể đã chọn;
 * không có thì các Chủ thể xuất hiện trong ít nhất một ô của ma trận.
 */
export function pickMatrixEntities(
  allEntities: MatrixEntity[],
  rows: ReadonlyArray<{ cells: Record<string, unknown> }>,
  entityIds?: number[]
): MatrixEntity[] {
  const wanted =
    entityIds && entityIds.length > 0
      ? new Set(entityIds)
      : new Set(rows.flatMap((r) => Object.keys(r.cells).map(Number)));
  return allEntities
    .filter((e) => wanted.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
