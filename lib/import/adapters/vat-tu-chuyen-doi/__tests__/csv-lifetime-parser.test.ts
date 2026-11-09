import { describe, expect, it } from "vitest";
import { parseCsvLifetime } from "../csv-lifetime-parser";

const FILE = "Tong Cong No - Tổng công nợ đến 26.7.26.csv";

function csvLine(cells: (string | null)[]): string {
  const padded = [...cells, ...Array(Math.max(0, 24 - cells.length)).fill(null)];
  return padded.map((c) => (c === null ? "" : /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

/** Bố cục như CSV thật: 2 dòng tiêu đề, khối NCC kết thúc bằng "Cộng", bảng phụ sau "Tổng cộng". */
const LINES: (string | null)[][] = [
  ["BẢNG THEO DÕI TỔNG HỢP CÔNG NỢ  CÁC NHÀ CUNG CẤP"],
  [],
  ["TT", "Tên công ty", "Hợp đồng", null, null, "Tên vật tư", "Hàng hóa", null, null, null, "Hóa đơn", null, "Giá thành", null, null, null, "Ghi chú        ( tên công trình)"],
  [null, null, "Số ", "Ngày", "Giá trị ", null, "Tổng phát sinh", "Đã tạm ứng", null, "Còn nợ", "Số", "Ngày tháng", "Tổng giá trị", "Đã chuyển khoản", "Ngày chuyển khoản", "Còn phải CK ", null, null, "310,603,499"],
  ["  1 ", " Công ty TNHH Nam Hương        ", "9/1/2023", "9/1/2023", "  1,292,409,000 ", "Gạch xây", "  1,039,650,000 ", null, "  930,313,300 ", "  109,336,700 ", null, null, "  1,380,713,400 ", "  1,380,713,400 ", null, " xong ", " Tân lộc CDC ", null, "310,605,120", null, "#REF!"],
  [null, null, "20.6/HĐNT", "20/6/2023", "HĐNT", null, "  44,600,000 ", null, "  -   ", "  44,600,000 ", null, null, "  27,734,400 ", "  -   ", null, "  27,734,400 ", " ĐVP -CDC ", null, "1,621"],
  [null, null, null, null, null, null, "  262,684,400 ", null, "  200,000,000 ", "  62,684,400 ", null, "  254,670,000 ", "  254,670,000 ", "  200,000,000 ", null, "  54,670,000 ", " MN trại chuối "],
  [null, " Cộng ", null, null, null, null, "  1,346,934,400 ", "  5,001,251,300 ", "  1,130,313,300 ", "  216,621,100 "],
  [null, null, null, null, null, null, null, " 25/10/23 ", "200000000", null, null, null, null, "  130,313,300 ", " 1/2/2024 ", null, "#REF!"],
  ["  2 ", " Công ty Đại Ngàn       ", "02.01/HĐNT", "2/1/2023", " HĐNT ", " Thép  ", "#REF!", null, "  6,885,387,420 ", "#REF!", null, null, "  6,730,368,370 ", "  6,700,000,000 ", null, "  30,368,370 ", " Ngô quyền Trại chuối "],
  [null, null, "Phí khác ( chênh lệch hóa đơn)", null, null, null, null, null, "  -   ", null, null, null, null, null, null, null, null, "  454,234,867 "],
  ["  3 ", " Công ty Đá Việt Hà ", null, null, null, "Đá xây dựng", "  153,998,700 ", null, "153,998,700", "  -   ", null, null, "188,309,000", "  188,309,000 ", null, "  -   ", " MN Trại Chuối "],
  [null, null, null, null, null, null, "  153,998,700 ", null, "153,998,700", "  -   ", null, null, "188,309,000", "  188,309,000 ", null, "  -   "],
  ["  4 ", " Cty Quang Minh (Ô Hoà) ", null, null, null, null, "  411,000,000 ", null, "  190,000,000 ", "  221,000,000 ", null, null, null, "  190,000,000 ", null, "  (190,000,000)", " Tiên Lãng\n( Việt Úc ) "],
  [null, " Tổng cộng ", null, null, null, null, "  57,999,004,955 "],
  [],
  ["  1 ", " Công ty TNHH Nam Hương        ", null, null, null, null, "  999 ", null, null, "  999 ", null, null, null, null, null, null, " Bảng phụ "],
];

const CSV = LINES.map(csvLine).join("\n");

describe("parseCsvLifetime", () => {
  const r = parseCsvLifetime(new TextEncoder().encode(`﻿${CSV}`), FILE);
  const byProject = (name: string) => r.rows.find((x) => x.projectName === name);

  it("Nam Hương × Tân lộc CDC: G, I, J, M, N đúng số", () => {
    expect(byProject("Tân lộc CDC")).toMatchObject({
      supplierName: "Công ty TNHH Nam Hương",
      lhTt: 1_039_650_000,
      paidTt: 930_313_300,
      paidTotalTt: 930_313_300,
      debtTt: 109_336_700,
      lhHd: 1_380_713_400,
      paidHd: 1_380_713_400,
      debtHd: 0,
    });
  });

  it("Nam Hương × ĐVP-CDC: J 44.600.000, P 27.734.400; tổng J hai dòng CDC = Số Dư CDC TT", () => {
    const dvp = byProject("ĐVP -CDC");
    expect(dvp).toMatchObject({ supplierName: "Công ty TNHH Nam Hương", debtTt: 44_600_000, debtHd: 27_734_400 });
    expect((byProject("Tân lộc CDC")?.debtTt ?? 0) + (dvp?.debtTt ?? 0)).toBe(153_936_700);
  });

  it('bỏ dòng "Cộng", dòng mồ côi, dòng tổng không nhãn và bảng phụ sau "Tổng cộng"', () => {
    expect(r.rows.map((x) => x.projectName)).toEqual([
      "Tân lộc CDC",
      "ĐVP -CDC",
      "MN trại chuối",
      "Ngô quyền Trại chuối",
      null,
      "MN Trại Chuối",
      "Tiên Lãng ( Việt Úc )",
    ]);
    expect(r.skipped.map((s) => s.reason)).toEqual(['Dòng "Cộng"', "Dòng không thuộc NCC", "Dòng tổng không nhãn"]);
    expect(r.rows.some((x) => x.projectName === "Bảng phụ")).toBe(false);
  });

  it("#REF! và ô số lệch cột được gắn cờ; chữ trong cột tiền tính 0 kèm cờ", () => {
    expect(byProject("Ngô quyền Trại chuối")?.flags).toEqual(expect.arrayContaining(["ref-error"]));
    expect(byProject("MN trại chuối")?.flags).toEqual(expect.arrayContaining(["shifted-number"]));
    expect(byProject("Tân lộc CDC")?.flags).toEqual(["text-in-amount"]);
    expect(r.warnings.find((w) => w.code === "csv-shifted-number")?.ref.cell).toBe("L7");
  });

  it('dòng thiếu Q gắn cờ "không xác định cặp"; J lệch G − (H + I) thì cảnh báo', () => {
    const noProject = r.rows.find((x) => x.projectName === null);
    expect(noProject?.flags).toContain("no-project");
    expect(noProject?.supplierName).toBe("Công ty Đại Ngàn");
    expect(byProject("Tiên Lãng ( Việt Úc )")).toMatchObject({ lhTt: 411_000_000, debtTt: 221_000_000, debtHd: -190_000_000 });
    expect(r.blockingErrors).toEqual([]);
  });

  it("CSV không đúng tiêu đề là lỗi chặn", () => {
    const bad = parseCsvLifetime("a,b,c\n1,2,3", FILE);
    expect(bad.blockingErrors[0].code).toBe("csv-header-missing");
  });
});
