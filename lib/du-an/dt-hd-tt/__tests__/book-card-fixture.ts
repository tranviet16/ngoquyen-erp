/**
 * Biến thể của công trình mẫu (report-fixture.ts) cho thẻ "Thực tế" của Dashboard, mỗi biến thể bật đúng một
 * quy tắc sắc thái. Số liệu tính tay từ công trình mẫu:
 *   - dự toán Gxd = 295.444.260 (T = 232.500.000; GT = 11 % T; TN = 6 % (T + GT); VAT 8 %);
 *   - thực tế Gxd của công trình mẫu = 155.674.000: A = 16.470.000 (Đại Ngàn, thực tế nhập) + 70.200.000
 *     (Bê tông HP, HĐ × 1,08) + 9.000.000 (Sobek) + 4.000 (Vật tư phụ); B = 55.000.000 (tổ xây);
 *     khoản khác mục I = 3.000.000, mục II = 2.000.000;
 *   - công trình mẫu có 70.200.000 thực tế nhập chưa gắn đầu mối (dòng bê tông).
 */

import { DEFAULT_RATES, type ReportInputs } from "../report-inputs";
import { fixture } from "./report-fixture";

/** Gắn dòng thực tế nhập bê tông cho đầu mối Bê tông HP (lấy thực tế theo HĐ nên thực tế không đổi). */
function allReceiptsTagged(inp: ReportInputs): ReportInputs {
  return { ...inp, receipts: inp.receipts.map((r) => (r.counterpartyId === null ? { ...r, counterpartyId: 12 } : r)) };
}

/** Đủ số liệu, chênh ≥ 0. */
export const complete = (): ReportInputs => allReceiptsTagged(fixture());

/** Chưa có đầu mối nào: không đầu mối, không dòng NCC, nhóm không ai phụ trách, chưa có thực tế nhập. */
export function noCounterparty(): ReportInputs {
  const inp = fixture();
  return {
    ...inp,
    counterparties: [],
    counterpartySuppliers: [],
    groupCodes: inp.groupCodes.map((g) => ({ ...g, counterpartyId: null })),
    receipts: [],
  };
}

/** Chỉ có khoản khác (khối C): Phần II A và B vẫn trống. */
export function otherCounterpartiesOnly(): ReportInputs {
  const inp = noCounterparty();
  return { ...inp, counterparties: fixture().counterparties.filter((c) => c.kind === "khac") };
}

/** Một đầu mối NCC lấy thực tế theo thực tế nhập, nhưng mọi dòng thực tế nhập chưa gắn đầu mối. */
export function untaggedReceiptsOnly(): ReportInputs {
  const inp = fixture();
  return {
    ...inp,
    counterparties: inp.counterparties.filter((c) => c.id === 11),
    counterpartySuppliers: inp.counterpartySuppliers.filter((l) => l.counterpartyId === 11),
    receipts: inp.receipts.map((r) => ({ ...r, counterpartyId: null })),
  };
}

/**
 * Công trình cũ (thực tế nằm ở `amountTt` của giao dịch, không phải đầu vào báo cáo) có thêm một dòng sổ Hóa
 * đơn — đủ để công trình được coi là dùng sổ. Sổ chỉ có dự toán và một hóa đơn: chưa Cài đặt, chưa Ánh xạ,
 * không đầu mối, không thực tế nhập, không chi.
 */
export function legacyPlusOneInvoice(): ReportInputs {
  const inp = fixture();
  return {
    ...inp,
    settings: DEFAULT_RATES,
    groupCodes: [],
    aliases: [],
    counterparties: [],
    counterpartySuppliers: [],
    suppliers: inp.suppliers.filter((s) => s.id === 1),
    invoiceLines: inp.invoiceLines.slice(0, 1),
    receipts: [],
    payments: [],
  };
}

/** Sobek chưa chốt thực tế (dòng Phần II A có thực tế null); mọi thực tế nhập đã gắn đầu mối. */
export function unsettledRow(): ReportInputs {
  const inp = complete();
  return { ...inp, counterparties: inp.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c)) };
}

/** Tổ xây chốt 400.000.000: thực tế Gxd vượt dự toán; mọi thực tế nhập đã gắn đầu mối. */
export function overBudget(): ReportInputs {
  const inp = complete();
  return { ...inp, counterparties: inp.counterparties.map((c) => (c.id === 14 ? { ...c, actualManualVnd: 400_000_000 } : c)) };
}

/** Như `overBudget` nhưng còn dòng thực tế nhập chưa gắn đầu mối như công trình mẫu. */
export function overBudgetWithUntagged(): ReportInputs {
  const inp = fixture();
  return { ...inp, counterparties: inp.counterparties.map((c) => (c.id === 14 ? { ...c, actualManualVnd: 400_000_000 } : c)) };
}
