import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  contractor: { findMany: vi.fn() },
  entity: { findUnique: vi.fn() },
}));
const mockAgg = vi.hoisted(() => ({ queryMonthlyByParty: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/ledger/ledger-aggregations", () => mockAgg);

import { buildCongNoMonthlyExcel } from "@/lib/export/templates/cong-no-monthly";

const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => vi.resetAllMocks());

function readSheet(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { names: wb.SheetNames, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

describe("buildCongNoMonthlyExcel", () => {
  it("builds a sheet with title, headers, a data row and a TỔNG row", async () => {
    mockAgg.queryMonthlyByParty.mockResolvedValue([
      {
        partyId: 1,
        openingTt: D(100),
        openingHd: D(0),
        layHangTt: D(50),
        layHangHd: D(0),
        thanhToanTt: D(30),
        thanhToanHd: D(0),
        closingTt: D(120),
        closingHd: D(0),
      },
    ]);
    mockDb.supplier.findMany.mockResolvedValue([{ id: 1, name: "NCC A" }]);
    mockDb.entity.findUnique.mockResolvedValue({ name: "Chủ thể X" });

    const buf = await buildCongNoMonthlyExcel("material", 2026, 5, 7);
    const { names, aoa } = readSheet(buf);

    expect(names).toEqual(["Báo cáo tháng"]);
    expect(String(aoa[0][0])).toContain("Tháng 5/2026");
    expect(aoa[1]).toContain("Danh Mục");
    expect(aoa[2]).toContain("NCC A");
    const totalRow = aoa.find((r) => r.includes("TỔNG"))!;
    expect(totalRow).toContain(100); // summed openingTt
  });

  it("falls back to a '#id' label when the party is missing", async () => {
    mockAgg.queryMonthlyByParty.mockResolvedValue([
      {
        partyId: 9,
        openingTt: D(0),
        openingHd: D(0),
        layHangTt: D(0),
        layHangHd: D(0),
        thanhToanTt: D(0),
        thanhToanHd: D(0),
        closingTt: D(0),
        closingHd: D(0),
      },
    ]);
    mockDb.contractor.findMany.mockResolvedValue([]);
    mockDb.entity.findUnique.mockResolvedValue(null);

    const buf = await buildCongNoMonthlyExcel("labor", 2026, 5, 7);
    const { aoa } = readSheet(buf);
    expect(aoa[2]).toContain("Đội #9");
  });
});
