/**
 * Dữ liệu mẫu cho test Tổng quan, dựng trên công trình mẫu của báo cáo (report-fixture.ts):
 *   - `boardOf`: bảng Ánh xạ của đúng bộ dữ liệu đó (qua `buildAliasBoard`, như service);
 *   - `linksOf`: các dòng NCC như `listCounterparties` trả về;
 *   - `todoScenario`: biến thể làm MỌI việc cần làm khác 0, gồm một alias HĐ trỏ Dòng DT không còn;
 *   - `overBudgetInputs`: 12 NCC + một tổ nhân công vượt dự toán, một khoản khác (khối C) cũng âm.
 */

import { buildAliasBoard, type AliasBoard } from "../alias-board";
import { groupEstimatesByKey, itemKeyOf, kindOfCategoryCode } from "../keys";
import type { SupplierLinkRow } from "../overview-todos";
import { DEFAULT_RATES, type ReportInputs } from "../report-inputs";
import { CATEGORIES, ESTIMATES, fixture, K } from "./report-fixture";

export const STALE_DT_KEY = "dong-dt-khong-con|ca|MTC";

/** Bảng Ánh xạ của bộ dữ liệu — cùng `buildAliasBoard` mà `listAliasBoard` gọi. */
export function boardOf(inp: ReportInputs): AliasBoard {
  const supplierName = new Map(inp.suppliers.map((s) => [s.id, s.name]));
  return buildAliasBoard({
    dtLines: inp.dtLines.map((l) => ({ key: l.key, kind: l.kind, itemName: l.itemName, unit: l.unit, value: l.value.toNumber(), lineCount: l.estimateIds.length })),
    invoiceLines: inp.invoiceLines.map((l) => ({ itemKey: l.itemKey, itemName: l.itemName, unit: l.unit, amount: l.amountVnd, party: supplierName.get(l.supplierId) ?? null })),
    receipts: inp.receipts.map((r) => ({ itemKey: r.itemKey, itemName: r.itemKey, unit: "", amount: r.amountVnd, party: null })),
    aliases: inp.aliases.map((a, i) => ({
      id: i + 1, source: a.source, itemKey: a.itemKey, itemName: a.itemKey, unit: "",
      groupCodeId: a.groupCodeId, dtKey: a.dtKey, factor: a.factor, kind: a.kind, status: a.status, note: null,
    })),
    groups: inp.groupCodes.map((g) => ({ id: g.id, code: g.code, name: g.name, counterpartyName: null })),
  });
}

/** Dòng NCC như `listCounterparties` (chỉ hai trường Tổng quan dùng). */
export const linksOf = (inp: ReportInputs): SupplierLinkRow[] =>
  inp.counterpartySuppliers.map((l) => ({ supplierId: l.supplierId, counterpartyId: l.counterpartyId }));

export interface TodoScenario {
  inp: ReportInputs;
  /** Dòng dự toán chưa xóa mềm và hạng mục đang còn — đầu vào của màn Dự toán (`kindlessEstimateIds`). */
  estimates: { id: number; categoryId: number; totalVnd: number }[];
  liveCategories: { id: number; code: string }[];
}

/** Hạng mục không có hậu tố loại → dòng dự toán của nó "chưa có loại". */
const KINDLESS_CATEGORY = { id: 5, code: "HM1-CPK" };

/**
 * Biến thể làm mọi việc khác 0: tên chưa gán ở cả ba nguồn (hd gồm alias trỏ Dòng DT không còn), đề xuất
 * ở cả ba nguồn, khóa chưa có hệ số ở hd và tt, thực tế nhập chưa gắn đầu mối, đầu mối chưa chốt, NCC
 * chưa thuộc đầu mối, NCC chưa có dòng, dự toán chưa có loại, chưa cài đặt, việc của kế toán.
 */
export function todoScenario(): TodoScenario {
  const inp = fixture();
  const hd = (name: string, unit: string) => itemKeyOf(name, unit);
  const categories = [...CATEGORIES, KINDLESS_CATEGORY];
  const catCode = (id: number) => categories.find((c) => c.id === id)?.code ?? "";
  const rows = [
    ...ESTIMATES,
    { id: 6, categoryId: 1, categoryCode: catCode(1), itemCode: "E6", itemName: "Cát vàng", unit: "m3", qty: 10, totalVnd: 3_000_000 },
    { id: 7, categoryId: KINDLESS_CATEGORY.id, categoryCode: KINDLESS_CATEGORY.code, itemCode: "E7", itemName: "Chi phí khác", unit: "", qty: 1, totalVnd: 2_000_000 },
  ];
  inp.dtLines = [...groupEstimatesByKey(rows).values()];
  inp.dtWithoutKindValue = rows.filter((e) => kindOfCategoryCode(e.categoryCode) === null).reduce((a, e) => a + e.totalVnd, 0);
  inp.settings = { ...DEFAULT_RATES, missing: true };

  inp.aliases = inp.aliases.map((a) => {
    if (a.source === "hd" && a.dtKey === K.may) return { ...a, dtKey: STALE_DT_KEY }; // HĐ "Máy đào": Dòng DT không còn → chưa gán
    if (a.source === "hd" && a.itemKey === hd("Bê tông phụ", "m3")) return { ...a, status: "de_xuat" as const };
    if (a.source === "dt" && a.itemKey === K.may) return { ...a, status: "de_xuat" as const };
    if (a.source === "tt" && a.itemKey === hd("Bê tông M300", "m3")) return { ...a, factor: null }; // TT chưa có hệ số
    return a;
  });
  inp.receipts = [...inp.receipts, { id: 4, itemKey: hd("Gạch thẻ", "viên"), qty: 1000, amountVnd: 1_500_000, counterpartyId: 14 }];
  inp.counterparties = inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c)); // Sobek chưa chốt
  inp.suppliers = [...inp.suppliers, { id: 6, name: "Gạch Đồng Nai" }];
  // NCC 5 có dòng NCC nhưng chưa thuộc đầu mối; NCC 6 có HĐ nhưng chưa có dòng NCC.
  inp.counterpartySuppliers = [
    ...inp.counterpartySuppliers,
    { id: 205, counterpartyId: null, supplierId: 5, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
  ];
  inp.invoiceLines = [
    ...inp.invoiceLines,
    { id: 7, supplierId: 6, invoiceNo: "7", invoiceDate: null, itemName: "Gạch thẻ", unit: "viên", itemKey: hd("Gạch thẻ", "viên"), qty: 1000, amountVnd: 1_400_000, vatVnd: 112_000 },
  ];

  return {
    inp,
    estimates: rows.map((e) => ({ id: e.id, categoryId: e.categoryId, totalVnd: e.totalVnd })),
    liveCategories: categories,
  };
}

/**
 * 12 NCC chốt tay không có dự toán (chênh âm, khác nhau), tổ xây chốt vượt dự toán (khối B), một khoản
 * khác chốt tay (khối C, chênh âm nhưng không được xét).
 */
export function overBudgetInputs(): ReportInputs {
  const inp = fixture();
  const extra = Array.from({ length: 12 }, (_, i) => ({
    id: 21 + i, name: `NCC vượt ${21 + i}`, kind: "ncc" as const, sortGroup: "10", sortOrder: i + 1,
    actualBasis: "manual" as const, actualManualVnd: (i + 1) * 1_000_000, paymentSection: null,
  }));
  inp.counterparties = [
    ...inp.counterparties.map((c) => (c.id === 14 ? { ...c, actualManualVnd: 100_000_000 } : c)),
    ...extra,
    { id: 40, name: "Khoản khác chốt tay", kind: "khac", sortGroup: null, sortOrder: 9, actualBasis: "manual", actualManualVnd: 7_000_000, paymentSection: null },
  ];
  return inp;
}
