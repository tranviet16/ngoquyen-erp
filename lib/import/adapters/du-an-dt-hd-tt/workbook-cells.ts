/**
 * Đọc ô của workbook "Cân đối vật tư" của đội: giá trị có kiểu (số giữ là số), công thức, tìm dòng
 * theo nhãn (không cố định số dòng — đội chèn dòng thì vẫn đọc đúng), và đọc ngày / tiền có báo lỗi
 * từng ô (sheet!ô) thay vì nuốt lỗi.
 */

import * as XLSX from "xlsx";

export type Cell = XLSX.CellObject | undefined;

export class WorkbookReader {
  constructor(private readonly wb: XLSX.WorkBook) {}

  static fromBuffer(buffer: Buffer): WorkbookReader {
    return new WorkbookReader(XLSX.read(buffer, { type: "buffer", cellFormula: true, cellDates: false }));
  }

  hasSheet(name: string): boolean {
    return Object.hasOwn(this.wb.Sheets, name);
  }

  private sheet(name: string): XLSX.WorkSheet {
    const ws = this.wb.Sheets[name];
    if (!ws) throw new Error(`File thiếu sheet "${name}"`);
    return ws;
  }

  cell(sheet: string, addr: string): Cell {
    return this.sheet(sheet)[addr] as Cell;
  }

  /** Giá trị thô (số / chuỗi / bool) hoặc undefined khi ô trống. */
  value(sheet: string, addr: string): unknown {
    const c = this.cell(sheet, addr);
    return c === undefined || c.v === "" ? undefined : c.v;
  }

  text(sheet: string, addr: string): string {
    const v = this.value(sheet, addr);
    return v === undefined || v === null ? "" : String(v).trim();
  }

  /** Số khi ô là số; undefined khi trống hoặc không phải số. */
  number(sheet: string, addr: string): number | undefined {
    const v = this.value(sheet, addr);
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  }

  formula(sheet: string, addr: string): string | undefined {
    return this.cell(sheet, addr)?.f;
  }

  lastRow(sheet: string): number {
    const ref = this.sheet(sheet)["!ref"];
    return ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
  }

  /** Dòng đầu tiên (1-based) trong [from, to] có ô `col` khớp `pattern`; undefined nếu không có. */
  findRow(sheet: string, col: string, pattern: RegExp, from = 1, to = this.lastRow(sheet)): number | undefined {
    for (let r = from; r <= to; r++) if (pattern.test(this.text(sheet, `${col}${r}`))) return r;
    return undefined;
  }
}

/** Ngày dd/mm/yyyy (hoặc lẫn trong chuỗi, vd. "PC03 Đoàn; 14/01/2026") → Date UTC; null khi không đọc được. */
export function parseDmyText(text: string): Date | null {
  const m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

/** Số serial ngày của Excel → Date UTC (00:00). */
export function excelSerialToDate(serial: number): Date | null {
  const p = XLSX.SSF.parse_date_code(serial);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null;
}

/** Ngày từ một ô: số serial hoặc chuỗi dd/mm/yyyy. `text` giữ chuỗi gốc khi không đọc được. */
export function readDate(c: Cell): { date: Date | null; text: string | null } {
  if (c === undefined || c.v === "" || c.v === undefined) return { date: null, text: null };
  if (typeof c.v === "number") return { date: excelSerialToDate(c.v), text: null };
  const text = String(c.v).trim();
  return { date: parseDmyText(text), text };
}

/** Gom các ô không đọc được để cổng kiểm của import liệt kê (sheet!ô = giá trị). */
export class CellIssues {
  readonly items: string[] = [];
  add(sheet: string, addr: string, value: unknown, why: string): void {
    this.items.push(`${sheet}!${addr} = ${JSON.stringify(value)} — ${why}`);
  }
}
