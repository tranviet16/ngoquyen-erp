/**
 * Đọc sổ của đội: 'Hóa Đơn' (mỗi dòng một mặt hàng, VAT theo dòng), 'Thực Tế Nhập' (theo khối, ngày
 * chỉ ghi ở dòng đầu của mỗi lần giao — các dòng sau lấy ngày dòng trên trong cùng khối) và
 * 'Chi Thực Tế' (sổ chi: CK, TM, mục I–IV, đầu mối chuẩn; ngày có thể lẫn trong số phiếu).
 */

import { normalizeMst } from "./read-mapping-sheets";
import { readDate, type CellIssues, type WorkbookReader } from "./workbook-cells";
import type { WbInvoice, WbPayment, WbReceipt } from "./workbook-types";

export function readInvoices(wb: WorkbookReader, issues: CellIssues): WbInvoice[] {
  const s = "Hóa Đơn";
  const header = wb.findRow(s, "A", /^Ngày/i, 1, 10) ?? 1;
  const out: WbInvoice[] = [];
  for (let r = header + 1; r <= wb.lastRow(s); r++) {
    const supplierName = wb.text(s, `C${r}`);
    if (!supplierName) continue;
    const { date, text } = readDate(wb.cell(s, `A${r}`));
    if (!date) issues.add(s, `A${r}`, wb.value(s, `A${r}`), "ngày hóa đơn không đọc được");
    const amount = wb.number(s, `I${r}`);
    if (amount === undefined) issues.add(s, `I${r}`, wb.value(s, `I${r}`), "thành tiền không phải số");
    const vatPct = wb.number(s, `M${r}`) ?? null;
    out.push({
      row: r, date, dateText: date ? null : text, invoiceNo: wb.text(s, `B${r}`), supplierName, mst: normalizeMst(wb.value(s, `D${r}`)),
      itemName: wb.text(s, `E${r}`), unit: wb.text(s, `F${r}`), qty: wb.number(s, `G${r}`) ?? null, unitPrice: wb.number(s, `H${r}`) ?? null,
      amount: amount ?? 0, vatPct, vat: wb.number(s, `O${r}`) ?? (vatPct === null ? 0 : (amount ?? 0) * vatPct),
    });
  }
  return out;
}

export function readReceipts(wb: WorkbookReader, issues: CellIssues): WbReceipt[] {
  const s = "Thực Tế Nhập";
  const header = wb.findRow(s, "B", /^Tên vật tư/i, 1, 20);
  if (header === undefined) throw new Error(`Không thấy dòng tiêu đề của sheet "${s}"`);
  const out: WbReceipt[] = [];
  let blockNo: number | null = null;
  let blockName = "";
  let lastDate: Date | null = null;
  for (let r = header + 1; r <= wb.lastRow(s); r++) {
    const a = wb.number(s, `A${r}`);
    const b = wb.text(s, `B${r}`);
    if (a !== undefined) {
      blockNo = a;
      blockName = b;
      lastDate = null;
    }
    const qty = wb.number(s, `E${r}`) ?? null;
    const amount = wb.number(s, `G${r}`);
    if ((qty === null && amount === undefined) || /^Cộng/i.test(b)) continue;
    const dateCell = wb.cell(s, `D${r}`);
    let date: Date | null = lastDate;
    let dateText: string | null = null;
    if (dateCell !== undefined && dateCell.v !== "") {
      const d = readDate(dateCell);
      if (d.date) {
        date = d.date;
        lastDate = d.date;
      } else {
        dateText = d.text;
        issues.add(s, `D${r}`, dateCell.v, "ngày nhập không đọc được");
      }
    }
    const note = [wb.text(s, `L${r}`), wb.text(s, `M${r}`)].filter(Boolean).join(" · ") || null;
    out.push({
      row: r, blockNo, date, dateText, itemName: b || blockName, unit: wb.text(s, `C${r}`),
      qty, unitPrice: wb.number(s, `F${r}`) ?? null, amount: amount ?? 0, note,
    });
  }
  return out;
}

export function readPayments(wb: WorkbookReader, issues: CellIssues): WbPayment[] {
  const s = "Chi Thực Tế";
  const header = wb.findRow(s, "C", /^Nội dung/i, 1, 20);
  if (header === undefined) throw new Error(`Không thấy dòng tiêu đề của sheet "${s}"`);
  const out: WbPayment[] = [];
  for (let r = header + 1; r <= wb.lastRow(s); r++) {
    // Như cột K "CK+TM (tự động)" của file: có số ở D hoặc E, bỏ dòng "Cộng…" / "Tổng…" (dòng cộng
    // mục, tổng sổ); khoản không ghi nội dung (vd. tạm ứng tổ nhân công) vẫn là khoản chi.
    const content = wb.text(s, `C${r}`);
    const bankRaw = wb.number(s, `D${r}`);
    const cashRaw = wb.number(s, `E${r}`);
    if ((bankRaw === undefined && cashRaw === undefined) || /^(Cộng|Tổng)/i.test(content)) continue;
    const bank = bankRaw ?? 0;
    const cash = cashRaw ?? 0;
    const { date, text } = readDate(wb.cell(s, `B${r}`));
    if (!date) issues.add(s, `B${r}`, wb.value(s, `B${r}`) ?? "", "khoản chi chưa có ngày đọc được");
    out.push({
      row: r, date, dateText: date ? (text && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(text) ? text : null) : text,
      content: content || "(không ghi nội dung)", bank, cash, section: wb.text(s, `H${r}`), payee: wb.text(s, `I${r}`), note: wb.text(s, `F${r}`) || null,
    });
  }
  return out;
}
