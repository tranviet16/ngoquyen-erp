import { describe, expect, it } from "vitest";
import { buildReports } from "../reports";
import { buildSheet, isExportReport, toWorkbook, type SheetSpec } from "../export-sheets";
import { DT_HD_HEADER } from "../export-sheet-dt-hd";
import { HD_TT_HEADER, HD_TT_MONEY_COLS } from "../export-sheet-hd-tt";
import { fixture } from "./report-fixture";

const data = () => buildReports(fixture());
const rowStarting = (spec: SheetSpec, label: string) => spec.aoa.find((r) => typeof r[0] === "string" && r[0].startsWith(label));
const rowsStarting = (spec: SheetSpec, label: string) => spec.aoa.filter((r) => typeof r[0] === "string" && r[0].startsWith(label));

describe("export sheets — header", () => {
  it("title, project line and the report's column header", () => {
    const spec = buildSheet("dt-hd", data(), "CT01 — Mầm Non", "17/11/2026");
    expect(spec.name).toBe("DT-HĐ");
    expect(spec.aoa[0][0]).toBe("ĐỐI CHIẾU DỰ TOÁN – HÓA ĐƠN");
    expect(spec.aoa[1][0]).toBe("CT01 — Mầm Non — xuất ngày 17/11/2026");
    const headerAt = spec.aoa.findIndex((r) => r[0] === DT_HD_HEADER[0]);
    expect(spec.aoa[headerAt]).toEqual(DT_HD_HEADER);
    expect(spec.bold).toContain(headerAt);
    expect(spec.aoa.every((r) => r.length === DT_HD_HEADER.length)).toBe(true);
  });

  it("warns in the sheet when the project uses default rates", () => {
    const d = data();
    d.settings = { ...d.settings, missing: true };
    expect(rowStarting(buildSheet("hd-tt", d, "CT", "x"), "Công trình chưa cài đặt tỷ lệ")).toBeDefined();
    d.settings = { ...d.settings, missing: false };
    expect(rowStarting(buildSheet("hd-tt", d, "CT", "x"), "Công trình chưa cài đặt tỷ lệ")).toBeUndefined();
  });

  it("accepts only the three report names", () => {
    expect(["dt-hd", "dt-tt", "hd-tt"].every(isExportReport)).toBe(true);
    expect(isExportReport("x")).toBe(false);
    expect(isExportReport(null)).toBe(false);
  });
});

describe("export sheets — totals are numbers equal to the report", () => {
  it("DT-HĐ: each block total and Phần B total", () => {
    const d = data();
    const spec = buildSheet("dt-hd", d, "CT", "x");
    const blockTotals = rowsStarting(spec, "Cộng khối");
    expect(blockTotals.map((r) => r[7])).toEqual(d.dtHd.blocks.map((b) => b.groupsHd));
    expect(blockTotals.map((r) => r[6])).toEqual(d.dtHd.blocks.map((b) => b.valueDt));
    expect(rowStarting(spec, "Cộng Phần B")![7]).toBe(d.dtHd.partBTotal);
  });

  it("DT-TT: A + B, C and Phần III Gxd", () => {
    const d = data();
    const spec = buildSheet("dt-tt", d, "CT", "x");
    expect(rowStarting(spec, "TỔNG A + B")![3]).toBe(d.dtTt.phanII.totalAB);
    expect(rowStarting(spec, "Cộng C")![3]).toBe(d.dtTt.phanII.totalC);
    const gxd = d.phanIII.rows.find((r) => r.key === "total")!;
    expect(rowStarting(spec, gxd.label)![2]).toBe(gxd.estimate);
  });

  it("HĐ-TT: header and every money column of the total row", () => {
    const d = data();
    const spec = buildSheet("hd-tt", d, "CT", "x");
    expect(spec.aoa.find((r) => r[0] === HD_TT_HEADER[0])).toEqual(HD_TT_HEADER);
    const total = rowStarting(spec, "TỔNG CỘNG")!;
    HD_TT_MONEY_COLS.forEach(({ key }, i) => expect(total[2 + i], key).toBe(d.hdTt.totals[key]));
    const headerAt = spec.aoa.findIndex((r) => r[0] === HD_TT_HEADER[0]);
    const totalAt = spec.aoa.indexOf(total);
    expect(spec.aoa.slice(headerAt + 1, totalAt).map((r) => r[0])).toEqual(d.hdTt.rows.map((r) => r.supplierName));
  });
});

describe("export sheets — check rows", () => {
  it("a matching tie-out shows ✓, expected / actual / Δ and Khớp", () => {
    const d = data();
    const spec = buildSheet("dt-hd", d, "CT", "x");
    const grand = rowStarting(spec, `✓ ${d.dtHd.grandCheck.label}`)!;
    expect(grand.slice(6, 10)).toEqual([d.dtHd.grandCheck.expected, d.dtHd.grandCheck.actual, d.dtHd.grandCheck.actual - d.dtHd.grandCheck.expected, "Khớp"]);
  });

  it("a broken tie-out shows ✗, the Δ and Lệch", () => {
    const d = data();
    d.hdTt.checks = [{ label: "Σ E = sổ Hóa Đơn gồm VAT", expected: 1000, actual: 1500, ok: false }];
    const r = rowStarting(buildSheet("hd-tt", d, "CT", "x"), "✗ Σ E = sổ Hóa Đơn gồm VAT")!;
    expect(r.slice(2, 6)).toEqual([1000, 1500, 500, "Lệch"]);
  });
});

describe("toWorkbook", () => {
  it("formats money, quantity and percent cells and keeps totals numeric", () => {
    const spec: SheetSpec = { name: "HĐ-TT", aoa: [["T"], ["a", 1234.4, { v: 2.5, z: "qty" }, { v: 0.5, z: "pct" }, null]], bold: [0], widths: [10, 10, 10, 10, 10] };
    const ws = toWorkbook(spec).Sheets["HĐ-TT"];
    expect(ws.B2).toMatchObject({ t: "n", v: 1234.4, z: "#,##0" });
    expect(ws.C2).toMatchObject({ t: "n", v: 2.5, z: "#,##0.00" });
    expect(ws.D2).toMatchObject({ t: "n", v: 0.5, z: "0.0%" });
    expect(ws["!merges"]).toEqual([{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]);
    expect(ws.A2).toMatchObject({ t: "s", v: "a" });
    expect(ws.A2.z).toBeUndefined();
  });
});
