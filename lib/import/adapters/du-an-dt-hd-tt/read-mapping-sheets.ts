/**
 * Đọc các sheet ánh xạ: 'Ánh Xạ DT' (dòng dự toán + mã nhóm + loại), 'Ánh Xạ HĐ' / 'Ánh Xạ TT'
 * (tên|ĐVT → mã nhóm, dòng dự toán, hệ số), 'Đề Xuất NCC' (NCC phụ trách mã nhóm) và
 * 'Ánh Xạ Tên NCC' cột T:AA (NCC trên hóa đơn → dòng Phần II, MST, thứ tự).
 * Dòng tiêu đề tìm theo nhãn, không cố định số dòng.
 */

import type { CostKind } from "@/lib/du-an/dt-hd-tt/keys";
import type { AliasStatus } from "@/lib/du-an/dt-hd-tt/report-inputs";
import type { WorkbookReader } from "./workbook-cells";
import type { WbAlias, WbDtLine, WbGroup, WbSupplier } from "./workbook-types";

const KINDS = new Set(["VL", "NC", "MTC"]);

/** MST: chỉ giữ chữ số, đệm 0 bên trái đủ 10 / 13 số (Excel hay làm rơi số 0 đầu). */
export function normalizeMst(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 10 ? digits.padStart(10, "0") : digits.padStart(13, "0");
}

function headerRow(wb: WorkbookReader, sheet: string, col: string, label: RegExp): number {
  const row = wb.findRow(sheet, col, label, 1, 20);
  if (row === undefined) throw new Error(`Không thấy dòng tiêu đề của sheet "${sheet}"`);
  return row;
}

export function readDtLines(wb: WorkbookReader): WbDtLine[] {
  const s = "Ánh Xạ DT";
  const out: WbDtLine[] = [];
  for (let r = headerRow(wb, s, "A", /^STT$/i) + 1; r <= wb.lastRow(s); r++) {
    const name = wb.text(s, `B${r}`);
    const value = wb.number(s, `G${r}`);
    const kind = wb.text(s, `H${r}`).toUpperCase();
    if (!name || value === undefined || /^TỔNG/i.test(name) || !KINDS.has(kind)) continue;
    out.push({
      row: r, stt: wb.text(s, `A${r}`), name, unit: wb.text(s, `C${r}`), groupCode: wb.text(s, `D${r}`) || null,
      qty: wb.number(s, `E${r}`) ?? 0, value, kind: kind as CostKind,
    });
  }
  return out;
}

function statusOf(confidence: string, code: string | null): AliasStatus {
  if (code === "NGOAI-DT" || /ngoài\s*dt/i.test(confidence)) return "ngoai_dt";
  return /chắc chắn/i.test(confidence) ? "xac_nhan" : "de_xuat";
}

const factorOf = (v: number | undefined) => (v === undefined || v === 0 ? null : v);

export function readAliases(wb: WorkbookReader): WbAlias[] {
  const out: WbAlias[] = [];
  const hd = "Ánh Xạ HĐ";
  for (let r = headerRow(wb, hd, "A", /^STT$/i) + 1; r <= wb.lastRow(hd); r++) {
    const name = wb.text(hd, `B${r}`);
    if (!name) continue;
    const code = wb.text(hd, `F${r}`) || null;
    const status = statusOf(wb.text(hd, `M${r}`), code);
    out.push({
      row: r, source: "hd", name, unit: wb.text(hd, `C${r}`), groupCode: status === "ngoai_dt" ? null : code,
      sttDt: wb.text(hd, `K${r}`) || null, factor: factorOf(wb.number(hd, `G${r}`)), status,
    });
  }
  const tt = "Ánh Xạ TT";
  for (let r = headerRow(wb, tt, "A", /^STT$/i) + 1; r <= wb.lastRow(tt); r++) {
    const name = wb.text(tt, `B${r}`);
    if (!name) continue;
    const code = wb.text(tt, `G${r}`) || null;
    const status = statusOf(wb.text(tt, `M${r}`), code);
    out.push({
      row: r, source: "tt", name, unit: wb.text(tt, `C${r}`), groupCode: status === "ngoai_dt" ? null : code,
      sttDt: wb.text(tt, `H${r}`) || null, factor: factorOf(wb.number(tt, `I${r}`)), status,
    });
  }
  return out;
}

export function readGroups(wb: WorkbookReader): WbGroup[] {
  const s = "Đề Xuất NCC";
  const out: WbGroup[] = [];
  for (let r = headerRow(wb, s, "B", /^Mã nhóm$/i) + 1; r <= wb.lastRow(s); r++) {
    const code = wb.text(s, `B${r}`);
    if (!code) break;
    out.push({ code, name: wb.text(s, `C${r}`) || code, ownerName: wb.text(s, `T${r}`) || null });
  }
  return out;
}

export function readSuppliers(wb: WorkbookReader): WbSupplier[] {
  const s = "Ánh Xạ Tên NCC";
  const out: WbSupplier[] = [];
  for (let r = headerRow(wb, s, "A", /^STT$/i) + 1; r <= wb.lastRow(s); r++) {
    const canonical = wb.text(s, `T${r}`);
    if (!canonical) break;
    out.push({
      canonical, mst: normalizeMst(wb.value(s, `Y${r}`)), dtTtStt: wb.number(s, `U${r}`) ?? null,
      sortGroup: wb.text(s, `Z${r}`) || null, order: wb.number(s, `AA${r}`) ?? 0,
    });
  }
  return out;
}
