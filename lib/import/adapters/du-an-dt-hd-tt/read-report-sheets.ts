/**
 * Đọc từ các sheet báo cáo những gì KHÔNG có ở sheet nhập liệu: danh sách đầu mối Phần II (+ nguồn
 * thực tế từ công thức cột H), ô nhập tay của 'In A4 – HĐ-TT' (H, S, X, Z — chỉ ô không có công
 * thức), và các số tổng để kiểm sau khi tính lại. Mọi mốc tìm theo nhãn.
 */

import type { CounterpartyKind } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { classifyActualFormula } from "./formula-tags";
import type { WorkbookReader } from "./workbook-cells";
import type { WbCounterparty, WbGoldens, WbHdTtRow } from "./workbook-types";

const DT_TT = "In A4 – DT-TT";
const HD_TT = "In A4 – HĐ-TT";

function mustFind(wb: WorkbookReader, sheet: string, col: string, pattern: RegExp, from = 1): number {
  const row = wb.findRow(sheet, col, pattern, from);
  if (row === undefined) throw new Error(`Sheet "${sheet}" thiếu dòng "${pattern.source}"`);
  return row;
}

export function readCounterparties(wb: WorkbookReader): WbCounterparty[] {
  const startA = mustFind(wb, DT_TT, "A", /^A\.\s/);
  const totalA = mustFind(wb, DT_TT, "B", /^TỔNG A/, startA);
  const startB = mustFind(wb, DT_TT, "A", /^B\.\s/, totalA);
  const totalB = mustFind(wb, DT_TT, "B", /^TỔNG B/, startB);
  const startC = mustFind(wb, DT_TT, "A", /^C\.\s/, totalB);
  const totalAll = mustFind(wb, DT_TT, "B", /^TỔNG DỰ TOÁN/, startC);
  const sections: [number, number, CounterpartyKind][] = [
    [startA, totalA, "ncc"],
    [startB, totalB, "to_nhan_cong"],
    [startC, totalAll, "khac"],
  ];
  const out: WbCounterparty[] = [];
  for (const [from, to, kind] of sections) {
    for (let r = from + 1; r < to; r++) {
      const stt = wb.number(DT_TT, `A${r}`);
      const name = wb.text(DT_TT, `B${r}`);
      if (stt === undefined || !name) continue;
      const source = classifyActualFormula(wb.formula(DT_TT, `H${r}`), wb);
      const cached = wb.number(DT_TT, `H${r}`) ?? null;
      out.push({
        row: r, stt, name, kind, basis: source.basis, manual: source.basis === "manual" ? cached : null,
        paymentSection: source.paymentSection, receiptRows: source.receiptRows, cachedActual: cached,
      });
    }
  }
  return out;
}

/** Ô nhập tay (không có công thức) → số; ô công thức hoặc trống → null. */
function typed(wb: WorkbookReader, addr: string): number | null {
  return wb.formula(HD_TT, addr) ? null : wb.number(HD_TT, addr) ?? null;
}

export function readHdTtRows(wb: WorkbookReader): WbHdTtRow[] {
  const header = mustFind(wb, HD_TT, "A", /^Nhà cung cấp$/i);
  const total = mustFind(wb, HD_TT, "A", /^TỔNG NHÀ CUNG CẤP/i, header);
  const out: WbHdTtRow[] = [];
  for (let r = header + 1; r < total; r++) {
    const supplierName = wb.text(HD_TT, `A${r}`);
    if (!supplierName) continue;
    out.push({
      row: r, supplierName,
      paidOverride: typed(wb, `H${r}`), split: typed(wb, `S${r}`), recovered: typed(wb, `X${r}`),
      todo: wb.formula(HD_TT, `Z${r}`) ? null : wb.text(HD_TT, `Z${r}`) || null,
      cached: {
        invoiceTotal: wb.number(HD_TT, `E${r}`) ?? 0, paid: wb.number(HD_TT, `I${r}`) ?? 0,
        actual: wb.number(HD_TT, `T${r}`) ?? 0, recovered: wb.number(HD_TT, `X${r}`) ?? 0,
      },
    });
  }
  return out;
}

export function readGoldens(wb: WorkbookReader): WbGoldens {
  const n = (sheet: string, addr: string) => wb.number(sheet, addr) ?? 0;
  const totalA = mustFind(wb, DT_TT, "B", /^TỔNG A/);
  const totalB = mustFind(wb, DT_TT, "B", /^TỔNG B/, totalA);
  const totalAll = mustFind(wb, DT_TT, "B", /^TỔNG DỰ TOÁN/, totalB);
  const p3 = mustFind(wb, DT_TT, "A", /^PHẦN III/, totalAll);
  const rate = (pattern: RegExp) => n(DT_TT, `D${mustFind(wb, DT_TT, "B", pattern, p3)}`);
  const hdTotal = mustFind(wb, HD_TT, "A", /^TỔNG NHÀ CUNG CẤP/i);
  return {
    totalA: n(DT_TT, `H${totalA}`),
    totalB: n(DT_TT, `H${totalB}`),
    totalAB: n(DT_TT, `H${totalAll}`),
    hdTt: { invoiceTotal: n(HD_TT, `E${hdTotal}`), paid: n(HD_TT, `I${hdTotal}`), actual: n(HD_TT, `T${hdTotal}`), recovered: n(HD_TT, `X${hdTotal}`) },
    directCost: n(DT_TT, `E${mustFind(wb, DT_TT, "B", /^CHI PHÍ TRỰC TIẾP/, p3)}`),
    estimateTotal: n(DT_TT, `E${mustFind(wb, DT_TT, "B", /SAU THUẾ/, p3)}`),
    rates: {
      generalCostPct: rate(/^Chi phí chung/i),
      tempHousingPct: rate(/nhà tạm/i),
      unmeasuredPct: rate(/không xác định/i),
      presumptiveIncomePct: rate(/^Thu nhập chịu thuế/i),
      vatPct: rate(/^Thuế GTGT/i),
    },
  };
}
