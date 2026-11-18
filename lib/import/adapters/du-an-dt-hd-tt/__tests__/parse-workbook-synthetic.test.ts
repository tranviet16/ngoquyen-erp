/**
 * Bộ đọc workbook "Cân đối vật tư" trên một workbook dựng trong bộ nhớ: từng sheet đọc đúng cột,
 * bỏ đúng dòng cộng / tổng, báo ô hỏng, và cổng kiểm số lệch hoạt động. Bổ sung cho smoke test file
 * thật (chỉ chạy khi có DT_HD_TT_WORKBOOK).
 */
import { describe, expect, it } from "vitest";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import { normVtName } from "@/lib/text/norm-vt-name";
import { goldenGates } from "../golden-gates";
import { parseDtHdTtWorkbook } from "../parse-workbook";
import { buildWorkbookInputs, workbookDtLines, type SupplierIdOf } from "../workbook-inputs";
import type { DtHdTtWorkbook } from "../workbook-types";
import { MST_CUA_HANG, MST_THEP, MST_XI_MANG, syntheticWorkbookBuffer } from "./synthetic-workbook-fixture";

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const SUPPLIER_IDS: Record<string, number> = { [MST_THEP]: 11, [MST_XI_MANG]: 12, [MST_CUA_HANG]: 13 };
const supplierIdOf: SupplierIdOf = ({ mst }) => SUPPLIER_IDS[mst] ?? null;
const parse = (): DtHdTtWorkbook => parseDtHdTtWorkbook(syntheticWorkbookBuffer());

describe("parseDtHdTtWorkbook — workbook dựng sẵn", () => {
  const wb = parse();

  it("từ chối file thiếu sheet bắt buộc, nêu tên sheet", () => {
    expect(() => parseDtHdTtWorkbook(syntheticWorkbookBuffer(["Hóa Đơn", "Chi Thực Tế"]))).toThrow(/thiếu sheet: Hóa Đơn, Chi Thực Tế/);
  });

  it("Ánh Xạ DT: bỏ dòng TỔNG, loại lạ, giá trị không phải số; chuẩn hóa loại", () => {
    expect(wb.dtLines.map((d) => [d.stt, d.name, d.kind, d.groupCode, d.qty, d.value])).toEqual([
      ["1", "Thép D10", "VL", "THEP", 1000, 20_000_000],
      ["2", "Xi măng", "VL", "XM", 10, 15_000_000],
      ["3", "Nhân công xây", "NC", null, 100, 30_000_000],
      ["4", "Thép D10", "VL", "THEP", 500, 10_000_000],
    ]);
    expect(wb.meta).toMatchObject({ dtLines: 4, invoices: 3, receipts: 4, payments: 3, counterparties: 5 });
  });

  it("Ánh Xạ HĐ / TT: trạng thái theo độ tin cậy, hệ số 0 = không có, NGOAI-DT bỏ mã nhóm", () => {
    expect(wb.aliases.map((a) => [a.source, a.name, a.groupCode, a.sttDt, a.factor, a.status])).toEqual([
      ["hd", "Thép tròn D10", "THEP", "1", null, "xac_nhan"],
      ["hd", "Xi măng PCB40", "XM", "2", 0.05, "de_xuat"],
      ["hd", "Dây buộc", null, null, null, "ngoai_dt"],
      ["tt", "Thép D10 công trường", "THEP", "1", 1, "xac_nhan"],
      ["tt", "Gạch", null, null, null, "ngoai_dt"],
    ]);
  });

  it("Đề Xuất NCC và Ánh Xạ Tên NCC: dừng ở dòng trống, đệm MST, tên nhóm mặc định là mã", () => {
    expect(wb.groups).toEqual([
      { code: "THEP", name: "Thép", ownerName: "Công ty Thép A" },
      { code: "XM", name: "XM", ownerName: "Vật tư phụ" },
    ]);
    expect(wb.suppliers).toEqual([
      { canonical: "Công ty Thép A", mst: MST_THEP, dtTtStt: 1, sortGroup: "VL chính", order: 1 },
      { canonical: "Công ty Xi Măng B", mst: MST_XI_MANG, dtTtStt: 2, sortGroup: null, order: 2 },
      { canonical: "Cửa hàng C", mst: MST_CUA_HANG, dtTtStt: null, sortGroup: null, order: 0 },
    ]);
  });

  it("Hóa Đơn: ngày serial / chuỗi, VAT tính khi trống, ô hỏng vào danh sách lỗi", () => {
    const [a, b, c] = wb.invoices;
    expect([iso(a.date), a.mst, a.amount, a.vat]).toEqual(["2026-01-01", MST_THEP, 20_000_000, 1_600_000]);
    expect([iso(b.date), b.mst, b.vatPct, b.vat]).toEqual(["2026-01-15", MST_XI_MANG, 0.1, 1_500_000]);
    expect([c.date, c.dateText, c.amount, c.vatPct, c.vat]).toEqual([null, "abc", 0, null, 0]);
    expect(wb.issues).toEqual(expect.arrayContaining([
      'Hóa Đơn!A4 = "abc" — ngày hóa đơn không đọc được',
      'Hóa Đơn!I4 = "n/a" — thành tiền không phải số',
    ]));
  });

  it("Thực Tế Nhập: ngày dòng đầu khối dùng cho các dòng sau, tên theo khối, bỏ dòng Cộng", () => {
    expect(wb.receipts.map((r) => [r.row, r.blockNo, iso(r.date), r.dateText, r.itemName, r.amount, r.note])).toEqual([
      [3, 1, "2026-01-05", null, "Thép D10 công trường", 10_000_000, "Đại Ngàn"],
      [4, 1, "2026-01-05", null, "Thép D10 công trường", 6_000_000, "đợt 2"],
      [6, 2, "2026-01-08", null, "Gạch", 1_000_000, "Kho"],
      [7, 2, "2026-01-08", "xx/yy", "Gạch", 500_000, null],
    ]);
    expect(wb.issues).toContain('Thực Tế Nhập!D7 = "xx/yy" — ngày nhập không đọc được');
  });

  it("Chi Thực Tế: ngày lẫn trong số phiếu giữ chuỗi gốc, khoản không nội dung vẫn là khoản chi", () => {
    expect(wb.payments.map((p) => [p.row, iso(p.date), p.dateText, p.content, p.bank, p.cash, p.section, p.payee, p.note])).toEqual([
      [4, "2026-01-10", null, "Trả tiền thép", 5_000_000, 0, "I", "Công ty Thép A", "ghi chú"],
      [5, "2026-01-14", "PC03 Đoàn; 14/01/2026", "Tạm ứng", 0, 2_000_000, "II", "Tổ Đoàn", null],
      [6, null, null, "(không ghi nội dung)", 1_000_000, 0, "III", "", null],
    ]);
    expect(wb.issues).toContain('Chi Thực Tế!B6 = "" — khoản chi chưa có ngày đọc được');
  });

  it("Phần II: ba nhóm đầu mối, nguồn thực tế đọc từ công thức cột H", () => {
    expect(wb.counterparties.map((c) => [c.row, c.stt, c.name, c.kind, c.basis, c.manual, c.paymentSection, c.receiptRows])).toEqual([
      [3, 1, "Công ty Thép A", "ncc", "invoices", null, null, []],
      [4, 2, "Vật tư phụ", "ncc", "receipts", null, null, [3, 4, 6]],
      [5, 3, "Đại Ngàn", "ncc", "manual", 7_000_000, null, []],
      [8, 1, "Tổ Đoàn", "to_nhan_cong", "payments", null, "II", []],
      [11, 1, "Chi khác", "khac", "manual", 300_000, null, []],
    ]);
  });

  it("HĐ-TT: chỉ ô nhập tay được đọc là H / S / X / Z; ô công thức bỏ qua", () => {
    expect(wb.hdTtRows.map((r) => [r.supplierName, r.paidOverride, r.split, r.recovered, r.todo])).toEqual([
      ["Công ty Thép A", 20_000_000, null, 500_000, "Đòi hóa đơn"],
      ["Công ty Xi Măng B", null, null, null, null],
    ]);
    expect(wb.hdTtRows[0].cached).toEqual({ invoiceTotal: 21_600_000, paid: 20_000_000, actual: 21_600_000, recovered: 500_000 });
  });

  it("số kiểm: tổng A / B / A + B, Phần III và tỷ lệ", () => {
    expect(wb.goldens).toEqual({
      totalA: 45_600_000, totalB: 2_000_000, totalAB: 47_900_000,
      hdTt: { invoiceTotal: 38_100_000, paid: 25_000_000, actual: 21_600_000, recovered: 500_000 },
      directCost: 75_000_000, estimateTotal: 99_000_000,
      rates: { generalCostPct: 0.065, tempHousingPct: 0.01, unmeasuredPct: 0.02, presumptiveIncomePct: 0.055, vatPct: 0.08 },
    });
  });
});

describe("buildWorkbookInputs", () => {
  const wb = parse();
  const inputs = buildWorkbookInputs(wb, supplierIdOf);

  it("gộp dòng dự toán trùng khóa và tính đơn giá", () => {
    const lines = workbookDtLines(wb);
    const thep = lines.find((l) => l.itemName === "Thép D10")!;
    expect(lines).toHaveLength(3);
    expect([thep.qty.toNumber(), thep.value.toNumber(), thep.unitPrice?.toNumber(), thep.estimateIds]).toEqual([1500, 30_000_000, 20_000, [-1]]);
  });

  it("mã nhóm → đầu mối qua NCC áp dụng hoặc trùng tên dòng Phần II; nhóm chính theo ánh xạ TT", () => {
    expect(inputs.groupCodes.map((g) => [g.code, g.counterpartyId, g.isMainMaterial])).toEqual([
      ["THEP", 3, true],
      ["XM", 4, false],
    ]);
    expect(inputs.aliases.filter((a) => a.source === "dt")).toHaveLength(3);
    expect(inputs.aliases.find((a) => a.source === "hd" && a.status === "ngoai_dt")?.groupCodeId).toBeNull();
  });

  it("gắn NCC, thực tế nhập và khoản chi vào đúng đầu mối", () => {
    expect(inputs.counterpartySuppliers.map((s) => [s.supplierId, s.counterpartyId, s.paidOverrideVnd, s.recoveredVnd, s.todoNote])).toEqual([
      [11, 3, 20_000_000, 500_000, "Đòi hóa đơn"],
      [12, 4, null, null, null],
      [13, null, null, null, null],
    ]);
    expect(inputs.invoiceLines.map((l) => l.supplierId)).toEqual([11, 12, 13]);
    expect(inputs.receipts.map((r) => [r.id, r.counterpartyId])).toEqual([[3, 4], [4, 4], [6, 4], [7, null]]);
    expect(inputs.payments.map((p) => [p.id, p.supplierId, p.counterpartyId])).toEqual([[4, 11, null], [5, null, 8], [6, null, null]]);
  });

  it("từ chối NCC chưa xác định được", () => {
    expect(() => buildWorkbookInputs(wb, ({ mst }) => (mst === MST_CUA_HANG ? null : 1))).toThrow(/Chưa xác định được NCC "Cửa hàng C"/);
  });
});

describe("goldenGates", () => {
  /** Workbook có số kiểm đúng bằng số tính lại — mọi cổng phải qua. */
  function balanced(): { wb: DtHdTtWorkbook; inputs: ReturnType<typeof buildWorkbookInputs> } {
    const wb = parse();
    const inputs = buildWorkbookInputs(wb, supplierIdOf);
    const r = buildReports(inputs);
    const actual = new Map([...r.dtTt.phanII.a, ...r.dtTt.phanII.b, ...r.dtTt.phanII.c].map((x) => [x.counterpartyId, x.actual ?? 0]));
    for (const c of wb.counterparties) c.cachedActual = actual.get(c.row) ?? 0;
    const hd = new Map(r.hdTt.rows.map((x) => [normVtName(x.supplierName), x]));
    for (const f of wb.hdTtRows) {
      const x = hd.get(normVtName(f.supplierName));
      f.cached = { invoiceTotal: x?.invoiceTotal ?? 0, paid: x?.paid ?? 0, actual: x?.actual ?? 0, recovered: x?.recovered ?? 0 };
    }
    const p3 = (k: string) => r.phanIII.rows.find((x) => x.key === k)!.estimate;
    wb.goldens = {
      ...wb.goldens,
      totalA: r.dtTt.phanII.totalA, totalB: r.dtTt.phanII.totalB, totalAB: r.dtTt.phanII.totalAB,
      hdTt: { ...r.hdTt.totals }, directCost: p3("direct"), estimateTotal: p3("total"),
    };
    return { wb, inputs };
  }

  it("số khớp → mọi cổng qua, không có cổng theo dòng", () => {
    const { wb, inputs } = balanced();
    const gates = goldenGates(wb, inputs);
    expect(gates.filter((g) => !g.ok)).toEqual([]);
    expect(gates.some((g) => g.label.startsWith("DT-TT dòng"))).toBe(false);
    expect(gates.map((g) => g.label)).toContain("DT-HĐ: Σ HĐ trong nhóm + Phần B = sổ Hóa Đơn");
  });

  it("lệch quá dung sai → cổng chặn: tổng lệch 2 đ, dòng lệch hơn 1.000 đ; lệch trong dung sai thì qua", () => {
    const { wb, inputs } = balanced();
    wb.goldens.totalA += 2;
    wb.goldens.totalB += 1;
    wb.counterparties[0].cachedActual = (wb.counterparties[0].cachedActual ?? 0) + 5000;
    wb.hdTtRows[0].cached.paid += 999;
    wb.hdTtRows[1].cached.invoiceTotal += 2000;
    const failed = goldenGates(wb, inputs).filter((g) => !g.ok).map((g) => g.label);
    expect(failed).toEqual(["DT-TT dòng 3 Công ty Thép A", "DT-TT tổng A (NCC)", "HĐ-TT Công ty Xi Măng B: HĐ gồm VAT"]);
  });
});
