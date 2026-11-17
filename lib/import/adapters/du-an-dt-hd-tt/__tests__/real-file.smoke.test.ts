/**
 * Smoke test trên file thật của đội (không có trong repo): đọc workbook, tính lại ba báo cáo trong
 * bộ nhớ, so với số đang hiện trong chính file. Chạy:
 *   DT_HD_TT_WORKBOOK="<đường dẫn tới bản sao Can Doi Vat Tu 2.xlsx>" npx vitest run --project unit lib/import/adapters/du-an-dt-hd-tt
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import { normVtName } from "@/lib/text/norm-vt-name";
import { parseDtHdTtWorkbook } from "../parse-workbook";
import { buildWorkbookInputs, type SupplierIdOf } from "../workbook-inputs";

const file = process.env.DT_HD_TT_WORKBOOK;

/** Id giả cho NCC: theo MST, không có MST thì theo tên chuẩn hóa. */
function fakeSupplierIds(): SupplierIdOf {
  const ids = new Map<string, number>();
  return ({ mst, name }) => {
    const key = mst || `name:${normVtName(name)}`;
    if (!ids.has(key)) ids.set(key, ids.size + 1);
    return ids.get(key)!;
  };
}

// Thân describe vẫn chạy khi bị skip → chỉ đọc file khi có biến môi trường.
const loaded = file
  ? (() => {
      const wb = parseDtHdTtWorkbook(readFileSync(file));
      return { wb, reports: buildReports(buildWorkbookInputs(wb, fakeSupplierIds())) };
    })()
  : null;

describe.skipIf(!loaded)("file thật của đội — tính lại khớp số trong file", () => {
  const { wb, reports } = loaded ?? { wb: undefined as never, reports: undefined as never };
  const g = wb?.goldens;

  it("đọc đủ các sheet", () => {
    expect(wb.dtLines.length).toBeGreaterThan(300);
    expect(wb.invoices.length).toBeGreaterThan(200);
    expect(wb.counterparties.length).toBeGreaterThan(30);
  });

  it("đọc đúng nguồn thực tế từ công thức (không rơi hết về số chốt tay)", () => {
    const count = (basis: string) => wb.counterparties.filter((c) => c.basis === basis).length;
    expect(count("receipts")).toBeGreaterThanOrEqual(6);
    expect(count("invoices")).toBeGreaterThanOrEqual(3);
    expect(count("payments")).toBeGreaterThanOrEqual(2);
    expect(wb.counterparties.filter((c) => c.basis === "receipts").every((c) => c.receiptRows.length > 0)).toBe(true);
  });

  it("Phần II: thực tế từng đầu mối = cột H của file", () => {
    const actual = new Map([...reports.dtTt.phanII.a, ...reports.dtTt.phanII.b, ...reports.dtTt.phanII.c].map((r) => [r.counterpartyId, r.actual]));
    const off = wb.counterparties
      .map((c) => ({ row: c.row, name: c.name, basis: c.basis, file: c.cachedActual ?? 0, ours: actual.get(c.row) ?? 0 }))
      .filter((x) => Math.abs(x.file - x.ours) > 1000);
    expect(off).toEqual([]);
  });

  it("Phần II: tổng A, B, A + B", () => {
    expect(reports.dtTt.phanII.totalA).toBeCloseTo(g.totalA, 0);
    expect(reports.dtTt.phanII.totalB).toBeCloseTo(g.totalB, 0);
    expect(reports.dtTt.phanII.totalAB).toBeCloseTo(g.totalAB, 0);
  });

  it("Phần III: chi phí trực tiếp và tổng dự toán", () => {
    const row = (k: string) => reports.phanIII.rows.find((r) => r.key === k)!;
    expect(row("direct").estimate).toBeCloseTo(g.directCost, 0);
    expect(row("total").estimate).toBeCloseTo(g.estimateTotal, 0);
  });

  it("HĐ-TT: từng dòng NCC và dòng tổng", () => {
    const byName = new Map(reports.hdTt.rows.map((r) => [normVtName(r.supplierName), r]));
    const off = wb.hdTtRows.flatMap((f): { name: string; missing?: boolean; E?: number; I?: number; T?: number; X?: number }[] => {
      const r = byName.get(normVtName(f.supplierName));
      if (!r) return [{ name: f.supplierName, missing: true }];
      const diffs = {
        E: r.invoiceTotal - f.cached.invoiceTotal, I: r.paid - f.cached.paid,
        T: r.actual - f.cached.actual, X: (r.recovered ?? 0) - f.cached.recovered,
      };
      return Object.values(diffs).some((d) => Math.abs(d) > 1000) ? [{ name: f.supplierName, ...diffs }] : [];
    });
    expect(off).toEqual([]);
    expect(reports.hdTt.totals.invoiceTotal).toBeCloseTo(g.hdTt.invoiceTotal, 0);
    expect(reports.hdTt.totals.paid).toBeCloseTo(g.hdTt.paid, 0);
    expect(reports.hdTt.totals.actual).toBeCloseTo(g.hdTt.actual, 0);
    expect(reports.hdTt.totals.recovered).toBeCloseTo(g.hdTt.recovered, 0);
  });

  it("DT-HĐ: mọi dòng hóa đơn đều được cộng", () => {
    expect(reports.dtHd.grandCheck.ok).toBe(true);
  });
});
