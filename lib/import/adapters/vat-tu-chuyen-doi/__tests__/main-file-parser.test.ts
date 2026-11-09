import { describe, expect, it } from "vitest";
import { parseMainFile } from "../main-file-parser";
import { excelDate, iso, workbookBuffer, type FixtureCell } from "./fixture-builders";

const FILE = "Quản Lý Công Nợ Vật Tư.xlsx";

const HEADER: FixtureCell[] = [
  "Ngày GD", "Loại GD", "Chủ Thể", null, null, "Tên Vật Tư",
  "Trước VAT\n(VNĐ)", "VAT%", "Tiền VAT\n(VNĐ)", "Tổng TT\n(VNĐ)",
  "Trước VAT\n(VNĐ)", "VAT%", "Tiền VAT\n(VNĐ)", "Tổng HĐ\n(VNĐ)",
  "Số HĐ", "Ngày HĐ", "Nội dung", "Trạng Thái", "Ghi Chú",
];

interface NlRow {
  date: FixtureCell;
  type: string;
  entity: string;
  supplier: string;
  project: string;
  item?: string;
  tt?: [FixtureCell, FixtureCell, FixtureCell, FixtureCell];
  hd?: [FixtureCell, FixtureCell, FixtureCell, FixtureCell];
  invoiceNo?: FixtureCell;
  invoiceDate?: FixtureCell;
}

function nl(r: NlRow): FixtureCell[] {
  return [
    r.date, r.type, r.entity, r.supplier, r.project, r.item ?? null,
    ...(r.tt ?? [null, null, 0, 0]), ...(r.hd ?? [null, null, 0, 0]),
    r.invoiceNo ?? null, r.invoiceDate ?? null, null, null, null,
  ];
}

/** Dòng ma: chỉ còn công thức ra 0 ở I/J/M/N. */
const GHOST: FixtureCell[] = [null, null, null, null, null, null, null, null, 0, 0, null, null, 0, 0];

function nhapLieu(header: FixtureCell[] = HEADER, extra: FixtureCell[][] = []): FixtureCell[][] {
  return [
    [0],
    ["THÔNG TIN GIAO DỊCH", null, null, null, null, null, "GIÁ TRỊ THỰC TẾ (TT)", null, null, null, "GIÁ TRỊ HÓA ĐƠN (HĐ)"],
    header,
    [],
    nl({ date: "15/08/0206", type: "Lấy Hàng", entity: "Lê Văn Huyên", supplier: "Cty Nhôm Kính HK", project: "Mầm non Trại chuối", tt: [null, null, 0, 1_767_445_488] }),
    nl({ date: "26/08/0206", type: "Lấy Hàng", entity: "Công Ty Quản Lý", supplier: "Quang Minh", project: "Trại Chuối", tt: [null, null, 0, 1_800_000] }),
    nl({ date: "26/10/0206", type: "Lấy Hàng", entity: "Lê Văn Huyên", supplier: "Lộc Tài", project: "Xây dựng Dải cây xanh", tt: [null, null, 0, 2_800_000] }),
    nl({ date: excelDate(2026, 1, 1, "dd/mm/yyyy"), type: "Lấy Hàng", entity: "Công Ty Quản Lý", supplier: "Nam Hương", project: "Trại Chuối", item: "Gạch đặc A1", tt: [11_851_851.85, 0.08, 948_148.15, 12_800_000] }),
    nl({ date: excelDate(2026, 1, 20, "dd/mm/yyyy"), type: "Lấy Hàng", entity: "Công Ty Quản Lý", supplier: "Phương Minh", project: "Trại Chuối", item: "Xi măng", hd: [137_666_666.67, 0.08, 11_013_333.33, 148_680_000], invoiceNo: 34, invoiceDate: excelDate(2026, 1, 20, "dd/mm/yyyy") }),
    nl({ date: excelDate(2026, 5, 29, "dd/mm/yyyy"), type: "Lấy Hàng", entity: "Công Ty Quản Lý", supplier: "Bê tông Hải Phòng", project: "Trại Chuối", item: "Thuế hóa đơn", tt: [null, null, 0, 1_380_000] }),
    nl({ date: excelDate(2026, 2, 10, "dd/mm/yyyy"), type: "Trả Nợ", entity: "Lê Văn Huyên", supplier: "MCT Đại Dương", project: "Cống hộp - Tiên lãng", tt: [null, null, 0, 145_513_000], hd: [null, null, 0, 144_422_309] }),
    nl({ date: excelDate(2026, 9, 10, "dd/mm/yyyy"), type: "Trả Nợ", entity: "Công Ty Quản Lý", supplier: "Cty vận tải Gia Bảo", project: "Xây dựng Dải cây xanh" }),
    nl({ date: excelDate(2026, 10, 27, "dd/mm/yyyy"), type: "Lấy Hàng", entity: "Công Ty Quản Lý", supplier: "Bê tông Hải Phòng", project: "Trại Chuối", tt: [null, null, 0, 28_980_000] }),
    GHOST,
    GHOST,
    ...extra,
    GHOST,
  ];
}

function soDu(): FixtureCell[][] {
  return [
    ["SỐ DƯ CÔNG NỢ BAN ĐẦU"],
    ["Nhập số dư công nợ còn lại tại ngày bắt đầu sử dụng hệ thống."],
    ["Ngày bắt đầu sử dụng hệ thống:", null, excelDate(2026, 1, 1, "dd/mm/yyyy")],
    [],
    ["Chủ Thể", "Nhà Cung Cấp", "Dự Án / Công Trình", "Số Dư TT (VNĐ)", "Số Dư HĐ (VNĐ)", "Ngày Xác Nhận", "Ghi Chú"],
    ["Công Ty Quản Lý", "Nam Hương", "CDC", 153_936_700, 27_734_400, excelDate(2026, 1, 1, "dd/mm/yyyy")],
    ["Công Ty Quản Lý", "Nam Hương", "Trại Chuối", 59_868_420, -55_712_852],
    [],
    ["Lưu Minh Xuân", "Quang Minh", "Cống hộp - Tiên lãng", null, -190_000_000],
    ["Công Ty Quản Lý", "Nam Hương", "Trại Chuối", 1_000, 0],
    ["  ∑  TỔNG SỐ DƯ BAN ĐẦU", null, null, 1, 1],
    ["Lê Văn Huyên", "Sau dòng tổng", "Không đọc", 9, 9],
  ];
}

const parse = (rows = nhapLieu()) => parseMainFile(workbookBuffer({ "Nhập Liệu": rows, "Số Dư Ban Đầu": soDu() }), FILE);

describe("parseMainFile — Nhập Liệu", () => {
  it("tiêu đề cột D/E trống vẫn đọc được NCC và dự án", () => {
    const r = parse();
    expect(r.blockingErrors).toEqual([]);
    expect(r.nhapLieu.rows[0]).toMatchObject({ supplierName: "Cty Nhôm Kính HK", projectName: "Mầm non Trại chuối", entityName: "Lê Văn Huyên" });
  });

  it("dừng ở dòng có Loại GD trống, không đọc dòng ma", () => {
    const r = parse();
    expect(r.nhapLieu.readRowCount).toBe(9);
    expect(r.nhapLieu.lastDataRowNumber).toBe(13);
    expect(r.nhapLieu.rows.length + r.nhapLieu.skipped.length).toBe(9);
  });

  it("3 dòng năm lạ (0206) được sửa theo năm chủ đạo, kèm cảnh báo", () => {
    const r = parse();
    const fixed = r.nhapLieu.rows.filter((x) => x.dateYearFixed);
    expect(fixed.map((x) => `${x.sourceKey} ${iso(x.date)}`)).toEqual([
      "NL#5 2026-08-15",
      "NL#6 2026-08-26",
      "NL#7 2026-10-26",
    ]);
    expect(r.warnings.filter((w) => w.code === "nl-year-fixed")).toHaveLength(3);
    expect(r.nhapLieu.dominantYear).toBe(2026);
  });

  it("tách VAT: amount = round(total / 1,08, 2)", () => {
    const row = parse().nhapLieu.rows.find((x) => x.sourceKey === "NL#8");
    expect(row?.tt).toEqual({ total: 12_800_000, amount: 11_851_851.85, vat: 948_148.15, vatRate: 0.08 });
    expect(row?.hd).toBeNull();
    expect(row?.transactionType).toBe("lay_hang");
  });

  it("dòng chỉ HĐ giữ TT = 0 kèm số và ngày HĐ", () => {
    const row = parse().nhapLieu.rows.find((x) => x.sourceKey === "NL#9");
    expect(row?.tt).toBeNull();
    expect(row?.hd?.total).toBe(148_680_000);
    expect(row?.invoiceNo).toBe("34");
    expect(iso(row?.invoiceDate ?? null)).toBe("2026-01-20");
  });

  it('"Thuế hóa đơn" → thue_hd; "Trả Nợ" đôi TT/HĐ → thanh_toan; dòng 0 đồng bị bỏ và liệt kê', () => {
    const r = parse();
    expect(r.nhapLieu.rows.find((x) => x.sourceKey === "NL#10")?.transactionType).toBe("thue_hd");
    const pay = r.nhapLieu.rows.find((x) => x.sourceKey === "NL#11");
    expect(pay).toMatchObject({ transactionType: "thanh_toan", rawType: "Trả Nợ" });
    expect(pay?.tt?.total).toBe(145_513_000);
    expect(pay?.hd?.total).toBe(144_422_309);
    expect(r.nhapLieu.skipped).toEqual([expect.objectContaining({ sourceKey: "NL#12", rawType: "Trả Nợ" })]);
  });

  it("dòng sau 26/10 được gắn cờ", () => {
    const after = parse().nhapLieu.rows.filter((x) => x.afterCutover);
    expect(after.map((x) => x.sourceKey)).toEqual(["NL#13"]);
  });

  it("nhãn tiêu đề lệch là lỗi chặn rõ ràng", () => {
    const header = [...HEADER];
    header[5] = "Vật tư";
    const r = parse(nhapLieu(header));
    expect(r.blockingErrors).toEqual([expect.objectContaining({ code: "nl-header-mismatch", ref: expect.objectContaining({ cell: "F3" }) })]);
    expect(r.nhapLieu.rows).toEqual([]);
  });

  it("dữ liệu nằm sau dòng trống Loại GD là lỗi chặn", () => {
    const late = nl({ date: excelDate(2026, 3, 3, "dd/mm/yyyy"), type: "Lấy Hàng", entity: "A", supplier: "B", project: "C", tt: [null, null, 0, 5] });
    const r = parse(nhapLieu(HEADER, [late]));
    expect(r.blockingErrors.map((e) => e.code)).toEqual(["nl-data-after-gap"]);
  });
});

describe("parseMainFile — Số Dư Ban Đầu", () => {
  it("asOf luôn là 31/12/2025, dòng trùng được cộng lại, dừng ở dòng tổng", () => {
    const r = parse();
    expect(r.openingBalances).toHaveLength(3);
    expect(r.openingBalances.every((o) => iso(o.asOf) === "2025-12-31")).toBe(true);
    const tc = r.openingBalances.find((o) => o.projectName === "Trại Chuối");
    expect(tc).toMatchObject({ balanceTt: 59_869_420, balanceHd: -55_712_852, mergedFrom: ["SD#7", "SD#10"] });
    expect(r.openingBalances.find((o) => o.projectName === "Cống hộp - Tiên lãng")).toMatchObject({ balanceTt: 0, balanceHd: -190_000_000 });
    expect(r.warnings.some((w) => w.code === "opening-duplicate-merged")).toBe(true);
  });
});
