import { describe, it, expect } from "vitest";
import {
  classifySheet,
  latestResolvedMonth,
  parseDoanhThu,
  parseSheetMonth,
  resolveSheetMonths,
} from "../sl-dt-sheet-parsers";

// Excel caps sheet names at 31 chars, so the year is truncated off most names.
// The workbook below spans June 2025 → April 2026, wrapping the year boundary.
const SHEETS = [
  "CauHinh",
  "TIẾN ĐỘ NỘP TIỀN",
  "Báo cáo sản lượng Tháng 6 năm ",
  "Báo cáo doanh thu Tháng 6 năm ",
  "Chỉ tiêu SL DT Tháng 6 năm 2025",
  "Báo cáo sản lượng Tháng 12 năm",
  "Báo cáo doanh thu Tháng 12 năm",
  "Chỉ tiêu SL DT Tháng 12 năm 202",
  "Báo cáo sản lượng Tháng 1 năm 2",
  "Báo cáo doanh thu Tháng 1 năm 2",
  "Chỉ tiêu SL DT Tháng 1 năm 2026",
  "Báo cáo sản lượng Tháng 4 năm 2",
  "Báo cáo doanh thu Tháng 4 năm 2",
  "Chỉ tiêu SL DT Tháng 4 năm 2026",
  "TIẾN ĐỘ XÂY DỰNG THÁNG 11",
  "TIẾN ĐỘ XÂY DỰNG",
];

describe("parseSheetMonth", () => {
  it("extracts the month number from a sheet name", () => {
    expect(parseSheetMonth("Báo cáo sản lượng Tháng 6 năm ")).toBe(6);
    expect(parseSheetMonth("Chỉ tiêu SL DT Tháng 12 năm 202")).toBe(12);
    expect(parseSheetMonth("TIẾN ĐỘ XÂY DỰNG THÁNG 11")).toBe(11);
  });

  it("returns null when no month token is present", () => {
    expect(parseSheetMonth("TIẾN ĐỘ XÂY DỰNG")).toBeNull();
    expect(parseSheetMonth("CauHinh")).toBeNull();
  });

  it("rejects out-of-range month numbers", () => {
    expect(parseSheetMonth("Báo cáo sản lượng Tháng 13 năm")).toBeNull();
  });
});

describe("resolveSheetMonths", () => {
  it("bumps the year when the month drops below the previous (Dec → Jan)", () => {
    const map = resolveSheetMonths(SHEETS);
    expect(map.get("Báo cáo sản lượng Tháng 6 năm ")).toEqual({ year: 2025, month: 6 });
    expect(map.get("Báo cáo sản lượng Tháng 12 năm")).toEqual({ year: 2025, month: 12 });
    expect(map.get("Báo cáo sản lượng Tháng 1 năm 2")).toEqual({ year: 2026, month: 1 });
    expect(map.get("Báo cáo sản lượng Tháng 4 năm 2")).toEqual({ year: 2026, month: 4 });
  });

  it("anchors each sheet category independently", () => {
    const map = resolveSheetMonths(SHEETS);
    expect(map.get("Báo cáo doanh thu Tháng 4 năm 2")).toEqual({ year: 2026, month: 4 });
    expect(map.get("Chỉ tiêu SL DT Tháng 4 năm 2026")).toEqual({ year: 2026, month: 4 });
  });

  it("resolves dated tien_do_xd sheets but skips the undated one", () => {
    const map = resolveSheetMonths(SHEETS);
    expect(map.get("TIẾN ĐỘ XÂY DỰNG THÁNG 11")).toEqual({ year: 2025, month: 11 });
    expect(map.has("TIẾN ĐỘ XÂY DỰNG")).toBe(false);
  });

  it("ignores sheets that carry no month", () => {
    const map = resolveSheetMonths(SHEETS);
    expect(map.has("CauHinh")).toBe(false);
    expect(map.has("TIẾN ĐỘ NỘP TIỀN")).toBe(false);
  });
});

describe("latestResolvedMonth", () => {
  it("returns the workbook's last month (April 2026)", () => {
    expect(latestResolvedMonth(resolveSheetMonths(SHEETS))).toEqual({ year: 2026, month: 4 });
  });

  it("returns null for an empty map", () => {
    expect(latestResolvedMonth(new Map())).toBeNull();
  });
});

describe("classifySheet", () => {
  it("maps the undated progress sheet to tien_do_xd", () => {
    expect(classifySheet("TIẾN ĐỘ XÂY DỰNG")).toBe("tien_do_xd");
    expect(classifySheet("TIẾN ĐỘ XÂY DỰNG THÁNG 11")).toBe("tien_do_xd");
  });
});

describe("parseDoanhThu", () => {
  it("imports revenue-only categories that do not start with Lo", () => {
    const rows = parseDoanhThu([
      ["I", "Trại Chuối GĐ I", null, null, null, null, null, null, null, null, null],
      ["A", "Nhóm A", null, null, null, null, null, null, null, null, null],
      [1, "Doanh thu khác", "Doanh thu phát sinh", 100, 20, 10, 50, null, 5, 2, 12],
    ], 2026, 6);

    expect(rows.map((row) => row.kind)).toEqual(["lot_meta", "monthly_input_dt"]);
    expect(rows[0].data.lotName).toBe("Doanh thu phát sinh");
    expect(rows[1].data.dtThoKy).toBe(10);
  });
});
