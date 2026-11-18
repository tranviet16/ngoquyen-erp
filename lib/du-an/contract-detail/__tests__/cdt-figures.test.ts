import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildCdtFigures } from "@/lib/du-an/contract-detail/cdt-figures";
import type {
  CdtAcceptanceInput,
  CdtCashflowInput,
  CdtInputs,
  CdtInvoiceInput,
} from "@/lib/du-an/contract-detail/types";

const day = (d: number) => new Date(Date.UTC(2026, 2, d));

const acceptance = (id: number, amount: string, over: Partial<CdtAcceptanceInput> = {}): CdtAcceptanceInput => ({
  id,
  checkItem: `Hạng mục ${id}`,
  acceptanceBatch: "Đợt 1",
  acceptedAt: day(id),
  amountCdtVnd: amount,
  ...over,
});

const invoice = (id: number, amount: string, vat: string, over: Partial<CdtInvoiceInput> = {}): CdtInvoiceInput => ({
  id,
  invoiceDate: day(id),
  invoiceSymbol: "1C26TAA",
  invoiceNo: String(id),
  amountVnd: amount,
  vatVnd: vat,
  ...over,
});

const cashflow = (id: number, flowDirection: string, amount: string, over: Partial<CdtCashflowInput> = {}): CdtCashflowInput => ({
  id,
  date: day(id),
  flowDirection,
  payerName: "A",
  payeeName: "B",
  amountVnd: new Prisma.Decimal(amount),
  ...over,
});

function sampleInputs(over: Partial<CdtInputs> = {}): CdtInputs {
  return {
    acceptances: [acceptance(1, "100"), acceptance(2, "0"), acceptance(3, "500", { deletedAt: day(9) })],
    invoices: [invoice(1, "60", "6"), invoice(2, "-10", "-1"), invoice(3, "999", "0", { deletedAt: day(9) })],
    cashflows: [
      cashflow(1, "cdt_to_cty", "70"),
      cashflow(2, "cdt_to_cty", "20"),
      cashflow(3, "cty_to_cdt", "10"),
      cashflow(4, "cty_to_doi", "999"),
      cashflow(5, "cdt_to_cty", "777", { deletedAt: day(9) }),
    ],
    projectContractValue: null,
    cdtContractsValueDt: null,
    ...over,
  };
}

describe("buildCdtFigures", () => {
  it("A', B', C' gồm VAT; còn phải thu và hóa đơn còn phải xuất", () => {
    const f = buildCdtFigures(sampleInputs());
    expect(f).toMatchObject({
      nghiemThu: "100",
      hoaDonXuat: "55",
      daNhan: "80",
      conPhaiThuTheoNghiemThu: "20",
      conPhaiThuTheoHoaDon: "-25",
      hoaDonConPhaiXuat: "45",
    });
    expect(f.performed).toEqual({ layHang: "100", hoaDon: "55", chuyenTien: "80" });
  });

  it("danh sách bỏ nghiệm thu 0, dòng đã xóa và chiều công ty ↔ đội; tiền trả lại CĐT mang dấu âm", () => {
    const { lists } = buildCdtFigures(sampleInputs());
    expect(lists.nghiemThu.map((a) => a.id)).toEqual([1]);
    expect(lists.hoaDonXuat.map((i) => [i.id, i.total])).toEqual([
      [1, "66"],
      [2, "-11"],
    ]);
    expect(lists.daNhan.map((c) => [c.id, c.signedAmount])).toEqual([
      [1, "70"],
      [2, "20"],
      [3, "-10"],
    ]);
    expect(lists.nghiemThu[0]).toMatchObject({ acceptedAt: "2026-03-01", amount: "100" });
  });

  it("không có dữ liệu: danh sách rỗng, mọi tổng bằng 0", () => {
    const f = buildCdtFigures({ acceptances: [], invoices: [], cashflows: [], projectContractValue: null, cdtContractsValueDt: null });
    expect(f.lists).toEqual({ nghiemThu: [], hoaDonXuat: [], daNhan: [] });
    expect([f.nghiemThu, f.hoaDonXuat, f.daNhan, f.conPhaiThuTheoNghiemThu, f.hoaDonConPhaiXuat]).toEqual(["0", "0", "0", "0", "0"]);
  });

  it("giá trị HĐ dự án 5000 lệch tổng DT hợp đồng CĐT 4800 thì bật cờ, trả cả hai số", () => {
    const f = buildCdtFigures(sampleInputs({ projectContractValue: new Prisma.Decimal("5000.00"), cdtContractsValueDt: "4800" }));
    expect(f).toMatchObject({ projectValueMismatch: true, projectContractValue: "5000", cdtContractsValueDt: "4800" });
  });

  it("giá trị HĐ dự án null thì không bật cờ", () => {
    const f = buildCdtFigures(sampleInputs({ projectContractValue: null, cdtContractsValueDt: "4800" }));
    expect(f).toMatchObject({ projectValueMismatch: false, projectContractValue: null, cdtContractsValueDt: "4800" });
  });

  it("chưa hợp đồng CĐT nào có giá trị thì không bật cờ; bằng nhau (khác cách viết) cũng không", () => {
    expect(buildCdtFigures(sampleInputs({ projectContractValue: "5000", cdtContractsValueDt: null })).projectValueMismatch).toBe(false);
    expect(buildCdtFigures(sampleInputs({ projectContractValue: "5000.00", cdtContractsValueDt: "5000" })).projectValueMismatch).toBe(false);
  });
});
