import { describe, expect, it } from "vitest";
import { buildBookIndex } from "../book-index";
import { deriveTransactions, shortHash } from "../derive-transactions";
import { groupEstimatesByKey } from "../keys";
import { buildReports } from "../reports";
import { CATEGORIES, ESTIMATES, K, fixture } from "./report-fixture";

describe("DT-TT Phần I", () => {
  const { dtTt } = buildReports(fixture());

  it("tách chênh thành do KL và do đơn giá, cộng lại đúng chênh", () => {
    const thep = dtTt.phanI.find((g) => g.code === "THEP")!;
    expect(thep.rows[0]).toMatchObject({ qtyTt: 950, valueDt: 22_500_000, groupOnly: false });
    expect(thep.rows[0].valueTtExVat).toBeCloseTo(14_250_000, 4);
    expect(thep.rows[0].diffByQty).toBeCloseTo(8_250_000, 4);
    expect(thep.rows[0].diffByPrice).toBeCloseTo(0, 4);
    const bt = dtTt.phanI.find((g) => g.code === "BT")!.rows[0];
    expect(bt.diffByQty).toBeCloseTo(59_800_000, 3);
    expect(bt.diffByPrice).toBeCloseTo(5_200_000, 3);
    expect(dtTt.checks.every((c) => c.ok)).toBe(true);
  });

  it("thực tế nhập chỉ gán tới nhóm đứng riêng một dòng ↳", () => {
    const only = dtTt.phanI.find((g) => g.code === "THEP")!.rows[1];
    expect(only.groupOnly).toBe(true);
    expect(only.qtyTt).toBeNull(); // không có hệ số
    expect(only.valueTtExVat).toBeCloseTo(1_000_000, 4);
  });
});

describe("DT-TT Phần II và Phần III", () => {
  const { dtTt, phanIII } = buildReports(fixture());

  it("tổng A, B, A + B; khoản khác C nằm ngoài A + B", () => {
    expect(dtTt.phanII.a.map((r) => r.name)).toEqual(["Đại Ngàn", "Bê tông HP", "Sobek", "Vật tư phụ"]);
    expect(dtTt.phanII.a[0].dtInclVat).toBeCloseTo(24_300_000, 4);
    expect(dtTt.phanII.totalA).toBeCloseTo(95_674_000, 4);
    expect(dtTt.phanII.totalB).toBe(55_000_000);
    expect(dtTt.phanII.totalAB).toBeCloseTo(150_674_000, 4);
    expect(dtTt.phanII.totalC).toBe(5_000_000);
    expect(dtTt.untaggedReceipts).toBe(70_200_000);
  });

  it("Phần III: dự toán theo tỷ lệ, thực tế theo Phần II và mục sổ chi", () => {
    const row = (k: string) => phanIII.rows.find((r) => r.key === k)!;
    expect(row("direct").estimate).toBe(232_500_000);
    expect(row("indirect").estimate).toBeCloseTo(25_575_000, 4);
    expect(row("income").estimate).toBeCloseTo(15_484_500, 4);
    expect(row("total").estimate).toBeCloseTo(295_444_260, 3);
    expect(row("general").actual).toBe(2_000_000);
    expect(row("unmeasured").actual).toBe(3_000_000);
    expect(row("total").actual).toBeCloseTo(155_674_000, 4);
  });
});

describe("HĐ-TT", () => {
  const { hdTt } = buildReports(fixture());
  const row = (name: string) => hdTt.rows.find((r) => r.supplierName === name)!;

  it("thực nộp rà soát thay sổ chi; nợ thực tế = T − I", () => {
    expect(row("Đại Ngàn")).toMatchObject({ invoiceTotal: 15_660_000, paid: 10_000_000, toPay: 5_660_000 });
    expect(row("Đại Ngàn").actual).toBeCloseTo(16_470_000, 4);
    expect(row("Bê tông HP")).toMatchObject({ paidBook: 0, paid: 50_000_000, todo: "Lấy thêm HĐ" });
  });

  it("đầu mối nhiều NCC: dòng đầu nhận phần còn lại, dòng sau = HĐ", () => {
    expect(hdTt.rows.map((r) => r.supplierName)).toEqual(["Đại Ngàn", "Bê tông HP", "Sobek", "Chương Dương", "Máy Lộc Tài"]);
    expect(row("Sobek").actual).toBe(7_920_000);
    expect(row("Sobek").stillToRecover).toBe(-1_000_000);
    expect(row("Chương Dương").actual).toBe(1_080_000);
  });

  it("NCC không thuộc đầu mối nào: T = 0 như file (cột Q trống); kiểm Σ E và Σ T", () => {
    expect(row("Máy Lộc Tài")).toMatchObject({ actual: 0, actualIsTemporary: false });
    expect(hdTt.totals.invoiceTotal).toBe(93_420_000);
    expect(hdTt.actualGap.counterpartiesWithoutRows).toEqual([{ name: "Vật tư phụ", actual: 4_000 }]);
    expect(hdTt.checks.every((c) => c.ok)).toBe(true);
    expect(hdTt.totals.actual).toBeCloseTo(95_670_000, 4);
  });

  it("đầu mối chưa chốt thực tế: các NCC của nó lấy T tạm = HĐ", () => {
    const inp = fixture();
    inp.counterparties[0].actualBasis = "manual"; // Đại Ngàn, actualManualVnd = null
    const r = buildReports(inp).hdTt.rows.find((x) => x.supplierName === "Đại Ngàn")!;
    expect(r).toMatchObject({ actual: 15_660_000, actualIsTemporary: true });
    expect(buildReports(inp).hdTt.checks.every((c) => c.ok)).toBe(true);
  });
});

describe("deriveTransactions — giao dịch HĐ cho các tab cũ", () => {
  it("gán vào dòng dự toán ERP giá trị lớn nhất, KL quy về ĐVT dự toán; dòng chưa gán dùng mã tổng hợp", () => {
    const inp = fixture();
    const primaryOf = new Map([...groupEstimatesByKey(ESTIMATES).values()].map((l) => [l.key, l.primary]));
    const tx = deriveTransactions(inp.invoiceLines, buildBookIndex(inp), primaryOf, CATEGORIES);
    expect(tx[0]).toMatchObject({ sourceInvoiceLineId: 1, transactionType: "lay_hang", categoryId: 1, itemCode: "E1", qty: 900, unit: "kg", amountHd: 13_500_000, partyName: "Đại Ngàn" });
    expect(tx[1]).toMatchObject({ itemCode: "E3", qty: 50, unit: "m3" }); // thiếu hệ số: giữ SL của HĐ
    expect(tx[2]).toMatchObject({ categoryId: 1, itemCode: `HD-1-${shortHash(inp.invoiceLines[2].itemKey)}` });
    expect(tx[5]).toMatchObject({ transactionType: "may_moc", categoryId: 3, itemCode: "E5" });
    expect(primaryOf.get(K.thep)).toMatchObject({ categoryId: 1, itemCode: "E1" });
  });
});
