import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";

const mockReport = vi.hoisted(() => ({
  getSanLuongReport: vi.fn(),
  getDoanhThuReport: vi.fn(),
}));
vi.mock("@/lib/sl-dt/report-service", () => mockReport);

import { buildSlDtExcel } from "@/lib/export/templates/sl-dt";

beforeEach(() => vi.resetAllMocks());

describe("buildSlDtExcel", () => {
  it("emits a Sản lượng and a Doanh thu sheet", async () => {
    mockReport.getSanLuongReport.mockResolvedValue([
      { kind: "lot", lotName: "Lô 1", estimateValue: 100, slLuyKeTho: 40 },
    ]);
    mockReport.getDoanhThuReport.mockResolvedValue([
      { kind: "lot", lotName: "Lô 1", contractValue: 200, dtThoLuyKe: 120 },
    ]);

    const wb = XLSX.read(await buildSlDtExcel({ year: 2026, month: 5 }), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Sản lượng", "Doanh thu"]);

    const sl = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Sản lượng"], { header: 1 });
    expect(String(sl[0][0])).toContain("Tháng 5/2026");
    expect(sl[2]).toContain("Lô 1");
  });

  it("defaults the month to the current month when omitted", async () => {
    mockReport.getSanLuongReport.mockResolvedValue([]);
    mockReport.getDoanhThuReport.mockResolvedValue([]);

    await buildSlDtExcel({ year: 2026 });
    const expected = new Date().getMonth() + 1;
    expect(mockReport.getSanLuongReport).toHaveBeenCalledWith(2026, expected);
  });
});
