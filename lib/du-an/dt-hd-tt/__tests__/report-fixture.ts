/**
 * Công trình mẫu cho test báo cáo, số liệu tính tay:
 *   - thép (VL, nhóm THEP, đầu mối Đại Ngàn – thực tế theo thực tế nhập), trải 2 hạng mục;
 *   - bê tông (VL, nhóm BT, đầu mối Bê tông – thực tế theo HĐ × 1,08), HĐ thiếu hệ số + 1 HĐ của
 *     Đại Ngàn gán chéo vào nhóm BT (chỉ gán tới nhóm);
 *   - nhân công (NC, nhóm của tổ nhân công) và máy (MTC, nhóm không có NCC phụ trách);
 *   - Sobek gộp 2 NCC (Sobek, Chương Dương), thực tế chốt tay; một NCC chưa gắn đầu mối;
 *   - Ông Sơn (mục I) và chi khác (mục II) theo sổ chi; "Vật tư phụ" là đầu mối NCC không có NCC.
 */

import { groupEstimatesByKey, itemKeyOf, dtLineKeyOf } from "../keys";
import { DEFAULT_RATES, type ReportInputs } from "../report-inputs";

export const CATEGORIES = [
  { id: 1, code: "HM1-VL" },
  { id: 2, code: "HM1-NC" },
  { id: 3, code: "HM1-MAY" },
  { id: 4, code: "HM2-VL" },
];
const catCode = (id: number) => CATEGORIES.find((c) => c.id === id)!.code;

const est = (id: number, categoryId: number, itemName: string, unit: string, qty: number, totalVnd: number) =>
  ({ id, categoryId, categoryCode: catCode(categoryId), itemCode: `E${id}`, itemName, unit, qty, totalVnd });

export const ESTIMATES = [
  est(1, 1, "Thép tròn D10", "kg", 1000, 15_000_000),
  est(2, 4, "Thép tròn D10", "kg", 500, 7_500_000),
  est(3, 1, "Bê tông M300", "m3", 100, 130_000_000),
  est(4, 2, "Nhân công xây", "công", 200, 60_000_000),
  est(5, 3, "Máy đào", "ca", 10, 20_000_000),
];

export const K = {
  thep: dtLineKeyOf("Thép tròn D10", "kg", "VL"),
  betong: dtLineKeyOf("Bê tông M300", "m3", "VL"),
  nhanCong: dtLineKeyOf("Nhân công xây", "công", "NC"),
  may: dtLineKeyOf("Máy đào", "ca", "MTC"),
};

// Đầu mối: 11 Đại Ngàn, 12 Bê tông, 13 Sobek, 14 tổ xây, 15 Ông Sơn, 16 chi khác, 17 Vật tư phụ.
// NCC: 1 Đại Ngàn, 2 Bê tông HP, 3 Sobek, 4 Chương Dương, 5 Máy Lộc Tài (chưa gắn đầu mối).
export function fixture(): ReportInputs {
  const hd = (name: string, unit: string) => itemKeyOf(name, unit);
  return {
    settings: { ...DEFAULT_RATES, missing: false },
    dtLines: [...groupEstimatesByKey(ESTIMATES).values()],
    dtWithoutKindValue: 0,
    groupCodes: [
      { id: 101, code: "THEP", name: "Thép", counterpartyId: 11, isMainMaterial: true, sortOrder: 1 },
      { id: 102, code: "BT", name: "Bê tông", counterpartyId: 12, isMainMaterial: true, sortOrder: 2 },
      { id: 103, code: "NC-XAY", name: "Nhân công xây", counterpartyId: 14, isMainMaterial: false, sortOrder: 3 },
      { id: 104, code: "MAY", name: "Máy", counterpartyId: null, isMainMaterial: false, sortOrder: 4 },
    ],
    aliases: [
      { source: "dt", itemKey: K.thep, groupCodeId: 101, kind: "VL", dtKey: null, factor: null, status: "xac_nhan" },
      { source: "dt", itemKey: K.betong, groupCodeId: 102, kind: "VL", dtKey: null, factor: null, status: "xac_nhan" },
      { source: "dt", itemKey: K.nhanCong, groupCodeId: 103, kind: "NC", dtKey: null, factor: null, status: "xac_nhan" },
      { source: "dt", itemKey: K.may, groupCodeId: 104, kind: "MTC", dtKey: null, factor: null, status: "xac_nhan" },
      { source: "hd", itemKey: hd("Thép D10", "kg"), groupCodeId: null, kind: null, dtKey: K.thep, factor: 1, status: "xac_nhan" },
      { source: "hd", itemKey: hd("Bê tông M300", "m3"), groupCodeId: null, kind: null, dtKey: K.betong, factor: null, status: "xac_nhan" },
      { source: "hd", itemKey: hd("Bê tông phụ", "m3"), groupCodeId: 102, kind: null, dtKey: null, factor: null, status: "xac_nhan" },
      { source: "hd", itemKey: hd("Sơn lót", "thùng"), groupCodeId: null, kind: null, dtKey: null, factor: null, status: "ngoai_dt" },
      { source: "hd", itemKey: hd("Máy đào", "ca"), groupCodeId: null, kind: null, dtKey: K.may, factor: 1, status: "xac_nhan" },
      { source: "tt", itemKey: hd("Thép D10", "kg"), groupCodeId: null, kind: null, dtKey: K.thep, factor: 1, status: "xac_nhan" },
      { source: "tt", itemKey: hd("Thép lẻ", "kg"), groupCodeId: 101, kind: null, dtKey: null, factor: null, status: "de_xuat" },
      { source: "tt", itemKey: hd("Bê tông M300", "m3"), groupCodeId: null, kind: null, dtKey: K.betong, factor: 1, status: "xac_nhan" },
    ],
    counterparties: [
      { id: 11, name: "Đại Ngàn", kind: "ncc", sortGroup: "01", sortOrder: 1, actualBasis: "receipts", actualManualVnd: null, paymentSection: null },
      { id: 12, name: "Bê tông HP", kind: "ncc", sortGroup: "03", sortOrder: 1, actualBasis: "invoices", actualManualVnd: null, paymentSection: null },
      { id: 13, name: "Sobek", kind: "ncc", sortGroup: "05", sortOrder: 1, actualBasis: "manual", actualManualVnd: 9_000_000, paymentSection: null },
      { id: 14, name: "Tổ xây", kind: "to_nhan_cong", sortGroup: null, sortOrder: 1, actualBasis: "manual", actualManualVnd: 55_000_000, paymentSection: null },
      { id: 15, name: "Ông Sơn – vật tư lẻ", kind: "khac", sortGroup: null, sortOrder: 1, actualBasis: "payments", actualManualVnd: null, paymentSection: "I" },
      { id: 16, name: "Chi khác", kind: "khac", sortGroup: null, sortOrder: 2, actualBasis: "payments", actualManualVnd: null, paymentSection: "II" },
      { id: 17, name: "Vật tư phụ", kind: "ncc", sortGroup: "09", sortOrder: 1, actualBasis: "manual", actualManualVnd: 4_000, paymentSection: null },
    ],
    counterpartySuppliers: [
      { id: 201, counterpartyId: 11, supplierId: 1, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
      { id: 202, counterpartyId: 12, supplierId: 2, splitActualVnd: null, paidOverrideVnd: 50_000_000, recoveredVnd: null, todoNote: "Lấy thêm HĐ" },
      { id: 203, counterpartyId: 13, supplierId: 3, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: 1_000_000, todoNote: null },
      { id: 204, counterpartyId: 13, supplierId: 4, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
    ],
    suppliers: [
      { id: 1, name: "Đại Ngàn" }, { id: 2, name: "Bê tông HP" }, { id: 3, name: "Sobek" },
      { id: 4, name: "Chương Dương" }, { id: 5, name: "Máy Lộc Tài" },
    ],
    invoiceLines: [
      { id: 1, supplierId: 1, invoiceNo: "1", invoiceDate: new Date("2026-03-01"), itemName: "Thép D10", unit: "kg", itemKey: hd("Thép D10", "kg"), qty: 900, amountVnd: 13_500_000, vatVnd: 1_080_000 },
      { id: 2, supplierId: 2, invoiceNo: "2", invoiceDate: null, itemName: "Bê tông M300", unit: "m3", itemKey: hd("Bê tông M300", "m3"), qty: 50, amountVnd: 65_000_000, vatVnd: 5_200_000 },
      { id: 3, supplierId: 1, invoiceNo: "3", invoiceDate: null, itemName: "Bê tông phụ", unit: "m3", itemKey: hd("Bê tông phụ", "m3"), qty: 1, amountVnd: 1_000_000, vatVnd: 80_000 },
      { id: 4, supplierId: 3, invoiceNo: "4", invoiceDate: null, itemName: "Sơn", unit: "thùng", itemKey: hd("Sơn", "thùng"), qty: 2, amountVnd: 2_000_000, vatVnd: 160_000 },
      { id: 5, supplierId: 4, invoiceNo: "5", invoiceDate: null, itemName: "Sơn lót", unit: "thùng", itemKey: hd("Sơn lót", "thùng"), qty: 1, amountVnd: 1_000_000, vatVnd: 80_000 },
      { id: 6, supplierId: 5, invoiceNo: "6", invoiceDate: null, itemName: "Máy đào", unit: "ca", itemKey: hd("Máy đào", "ca"), qty: 2, amountVnd: 4_000_000, vatVnd: 320_000 },
    ],
    receipts: [
      { id: 1, itemKey: hd("Thép D10", "kg"), qty: 950, amountVnd: 15_390_000, counterpartyId: 11 },
      { id: 2, itemKey: hd("Thép lẻ", "kg"), qty: 72, amountVnd: 1_080_000, counterpartyId: 11 },
      { id: 3, itemKey: hd("Bê tông M300", "m3"), qty: 54, amountVnd: 70_200_000, counterpartyId: null },
    ],
    payments: [
      { id: 1, bankVnd: 10_000_000, cashVnd: 0, section: "IV", counterpartyId: 11, supplierId: 1 },
      { id: 2, bankVnd: 0, cashVnd: 3_000_000, section: "I", counterpartyId: null, supplierId: null },
      { id: 3, bankVnd: 2_000_000, cashVnd: 0, section: "II", counterpartyId: null, supplierId: null },
      { id: 4, bankVnd: 5_000_000, cashVnd: 0, section: "IV", counterpartyId: 13, supplierId: 3 },
    ],
  };
}
