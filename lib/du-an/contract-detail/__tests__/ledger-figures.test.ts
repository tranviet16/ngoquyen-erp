/**
 * Số liệu hợp đồng NCC/đội: ba danh sách, các tổng, khối công nợ, "đã thực hiện".
 * Dòng mẫu ghi sẵn incTt/incHd/decTt/decHd đúng như fragment `increaseSql`/`decreaseSql`
 * tính cho từng loại giao dịch (lay_hang, thue_hd → tăng; thanh_toan → giảm;
 * dieu_chinh → dương là tăng, âm là giảm).
 */
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import type { TransactionType } from "@/lib/ledger/transaction-classification";
import { buildLedgerFigures } from "@/lib/du-an/contract-detail/ledger-figures";
import { buildUnfulfilled } from "@/lib/du-an/contract-detail/unfulfilled";
import type { LedgerRowInput, OpeningInput } from "@/lib/du-an/contract-detail/types";

type Amounts = Partial<Pick<LedgerRowInput, "incTt" | "incHd" | "decTt" | "decHd">>;

let seq = 0;
function row(type: TransactionType, amounts: Amounts, over: Partial<LedgerRowInput> = {}): LedgerRowInput {
  seq += 1;
  return {
    id: seq,
    entityId: 1,
    date: new Date(Date.UTC(2026, 0, seq)),
    transactionType: type,
    invoiceNo: null,
    invoiceDate: null,
    content: `dòng ${seq}`,
    qty: null,
    itemName: null,
    incTt: "0",
    incHd: "0",
    decTt: "0",
    decHd: "0",
    ...amounts,
    ...over,
  };
}

const OPENINGS: OpeningInput[] = [{ entityId: 1, openingTt: "1000", openingHd: new Prisma.Decimal(900) }];

/** Bộ số mẫu chung: đầu kỳ 1000/900 và 8 dòng sổ đủ các loại. */
function sampleRows(): LedgerRowInput[] {
  return [
    row("lay_hang", { incTt: "500", incHd: "550" }, { invoiceNo: "HD1", invoiceDate: new Date(Date.UTC(2026, 1, 1)) }),
    row("lay_hang", { incTt: "300" }),
    row("lay_hang", { incTt: "200", incHd: "220" }),
    row("lay_hang", { incTt: "-50", incHd: "-50" }),
    row("thue_hd", { incTt: "30" }),
    row("dieu_chinh", { incTt: "40", decHd: "20" }),
    row("dieu_chinh", { decTt: "15" }),
    row("thanh_toan", { decTt: new Prisma.Decimal(600), decHd: "650" }),
  ];
}

describe("buildLedgerFigures", () => {
  it("tính ΣA, T, ΣB, ΣC và khối công nợ theo bộ số mẫu", () => {
    const f = buildLedgerFigures(sampleRows(), OPENINGS);
    expect(f.totals).toEqual({
      layHang: "1020",
      thueHd: "30",
      hoaDon: "720",
      chuyenTienTt: "615",
      chuyenTienHd: "670",
    });
    expect(f.debt).toEqual({
      dauKyTt: "1000",
      dauKyHd: "900",
      conPhaiTraTt: "1405",
      conPhaiTraHd: "950",
      hoaDonConPhaiLay: "270",
      openingNote: true,
    });
    expect(f.performed).toEqual({ layHang: "990", hoaDon: "720", chuyenTien: "670" });
  });

  it("dòng điều chỉnh TT dương / HĐ âm nằm ở cả danh sách Lấy hàng và Chuyển tiền", () => {
    const rows = sampleRows();
    const mixed = rows[5];
    const f = buildLedgerFigures(rows, OPENINGS);
    const lists = f.lists!;
    expect(lists.layHang.map((r) => r.id)).toContain(mixed.id);
    expect(lists.chuyenTien.find((r) => r.id === mixed.id)).toMatchObject({ amountTt: "0", amountHd: "20" });
    expect(lists.layHang).toHaveLength(6);
    expect(lists.chuyenTien).toHaveLength(3);
  });

  it("dòng trả hàng âm vẫn ở danh sách Lấy hàng; dòng thuế HĐ mang nhãn loại", () => {
    const f = buildLedgerFigures(sampleRows(), OPENINGS);
    const amounts = f.lists!.layHang.map((r) => r.amount);
    expect(amounts).toContain("-50");
    expect(f.lists!.layHang.find((r) => r.transactionType === "thue_hd")?.typeLabel).toBe("Thuế hoá đơn");
  });

  it("danh sách Lấy hóa đơn gom theo số HĐ, dòng không số đứng riêng; Σ nhóm = ΣB", () => {
    const f = buildLedgerFigures(sampleRows(), OPENINGS);
    const groups = f.lists!.hoaDon;
    expect(groups.map((g) => g.label)).toEqual(["HD1", "Chưa ghi số HĐ", "Chưa ghi số HĐ"]);
    expect(f.lists!.hoaDonMissingNoCount).toBe(2);
    const sum = groups.reduce((s, g) => s.plus(g.total), new Prisma.Decimal(0));
    expect(sum.toFixed()).toBe(f.totals.hoaDon);
    expect(groups[0]).toMatchObject({ invoiceDate: "2026-02-01", total: "550" });
  });

  it("ngày và số lượng ra chuỗi để đi qua ranh giới client", () => {
    const r = row("lay_hang", { incTt: "10.5" }, { qty: new Prisma.Decimal("2.250"), date: new Date(Date.UTC(2026, 4, 27)) });
    const item = buildLedgerFigures([r], []).lists!.layHang[0];
    expect(item).toMatchObject({ date: "2026-05-27", qty: "2.25", amount: "10.5" });
  });

  it("cộng chính xác số lẻ đồng, không qua float", () => {
    const rows = [row("lay_hang", { incTt: "0.1" }), row("lay_hang", { incTt: "0.2" })];
    expect(buildLedgerFigures(rows, []).totals.layHang).toBe("0.3");
  });

  it("cặp chỉ có số dư đầu kỳ: danh sách rỗng, tổng 0, bật ghi chú đầu kỳ", () => {
    const f = buildLedgerFigures([], OPENINGS);
    expect(f.lists).toEqual({ layHang: [], hoaDon: [], hoaDonMissingNoCount: 0, chuyenTien: [] });
    expect(f.totals).toEqual({ layHang: "0", thueHd: "0", hoaDon: "0", chuyenTienTt: "0", chuyenTienHd: "0" });
    expect(f.debt).toMatchObject({ conPhaiTraTt: "1000", conPhaiTraHd: "900", hoaDonConPhaiLay: "0", openingNote: true });
  });

  it("cặp không có gì: mọi số bằng 0, tắt ghi chú đầu kỳ", () => {
    const f = buildLedgerFigures([], []);
    expect(f.debt).toEqual({
      dauKyTt: "0",
      dauKyHd: "0",
      conPhaiTraTt: "0",
      conPhaiTraHd: "0",
      hoaDonConPhaiLay: "0",
      openingNote: false,
    });
    expect(f.byEntity).toEqual([]);
  });

  it("chỉ có đầu kỳ HĐ khác 0 vẫn bật ghi chú đầu kỳ", () => {
    expect(buildLedgerFigures([], [{ entityId: 1, openingTt: "0", openingHd: "5" }]).debt.openingNote).toBe(true);
  });

  it("công nợ theo từng Chủ thể, sắp theo entityId", () => {
    const rows = [row("lay_hang", { incTt: "100", incHd: "90" }, { entityId: 7 }), row("thanh_toan", { decTt: "40" }, { entityId: 3 })];
    const f = buildLedgerFigures(rows, [{ entityId: 3, openingTt: "50", openingHd: "0" }]);
    expect(f.byEntity).toEqual([
      { entityId: 3, conPhaiTraTt: "10", conPhaiTraHd: "0" },
      { entityId: 7, conPhaiTraTt: "100", conPhaiTraHd: "90" },
    ]);
  });

  it("số tiền không hợp lệ báo lỗi rõ ràng", () => {
    expect(() => buildLedgerFigures([row("lay_hang", { incTt: "abc" })], [])).toThrow("Số tiền không hợp lệ");
  });
});

describe("phần chưa thực hiện từ bộ số mẫu", () => {
  it("V_dt 2000, V_tt 1800: lấy hàng loại thuế HĐ, chuyển tiền theo số HĐ", () => {
    const f = buildLedgerFigures(sampleRows(), OPENINGS);
    const t = buildUnfulfilled(
      {
        valueDt: { sum: "2000", have: 1, total: 1 },
        valueTt: { sum: "1800", have: 1, total: 1 },
      },
      f.performed,
    );
    expect(t).toEqual({
      layHang: { dt: { kind: "amount", value: "1010" }, tt: { kind: "amount", value: "810" } },
      hoaDon: { dt: { kind: "amount", value: "1280" }, tt: { kind: "amount", value: "1080" } },
      chuyenTien: { dt: { kind: "amount", value: "1330" }, tt: { kind: "amount", value: "1130" } },
    });
  });
});
