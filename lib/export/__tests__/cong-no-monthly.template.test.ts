import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  contractor: { findMany: vi.fn() },
  entity: { findUnique: vi.fn() },
}));
const mockAgg = vi.hoisted(() => ({ queryWindowByParty: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/ledger/ledger-aggregations", () => mockAgg);

import { buildCongNoMonthlyExcel } from "@/lib/export/templates/cong-no-monthly";

const D = (n: number) => new Prisma.Decimal(n);
const MAY = {
  from: new Date("2026-05-01T00:00:00.000Z"),
  to: new Date("2026-05-31T00:00:00.000Z"),
  label: "Tháng 5/2026",
};

beforeEach(() => vi.resetAllMocks());

function readSheet(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { names: wb.SheetNames, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

describe("buildCongNoMonthlyExcel", () => {
  it("builds a sheet with title, headers, a data row and a TỔNG row", async () => {
    mockAgg.queryWindowByParty.mockResolvedValue([
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

    const buf = await buildCongNoMonthlyExcel("material", MAY, 7);
    const { names, aoa } = readSheet(buf);

    expect(names).toEqual(["Báo cáo tháng"]);
    expect(String(aoa[0][0])).toContain("Tháng 5/2026");
    expect(aoa[1]).toContain("Danh Mục");
    expect(aoa[2]).toContain("NCC A");
    expect(mockAgg.queryWindowByParty).toHaveBeenCalledWith("material", { from: MAY.from, to: MAY.to, entityId: 7 });
    const totalRow = aoa.find((r) => r.includes("TỔNG"))!;
    expect(totalRow).toContain(100); // summed openingTt
  });

  it("Loại NCC (sổ vật tư): keeps only that kind's suppliers and names the kind in the title", async () => {
    const zero = { openingHd: D(0), layHangHd: D(0), thanhToanHd: D(0), closingHd: D(0) };
    mockAgg.queryWindowByParty.mockResolvedValue([
      { partyId: 1, openingTt: D(100), layHangTt: D(0), thanhToanTt: D(0), closingTt: D(100), ...zero },
      { partyId: 2, openingTt: D(5), layHangTt: D(0), thanhToanTt: D(0), closingTt: D(5), ...zero },
    ]);
    mockDb.supplier.findMany.mockImplementation(async (args: { where: { kind?: string } }) =>
      args.where.kind === "nhan_cong" ? [{ id: 2 }] : [{ id: 2, name: "NCC B" }],
    );
    mockDb.entity.findUnique.mockResolvedValue({ name: "Chủ thể X" });

    const { aoa } = readSheet(await buildCongNoMonthlyExcel("material", MAY, 7, { supplierKind: "nhan_cong" }));
    expect(String(aoa[0][0])).toContain("Loại NCC: Nhân công");
    expect(aoa.some((r) => r.includes("NCC B"))).toBe(true);
    expect(aoa.some((r) => r.includes("NCC #1"))).toBe(false);
    expect(aoa.find((r) => r.includes("TỔNG"))).toContain(5);
  });

  it("Loại NCC with no supplier yet gives an empty table, not every supplier", async () => {
    mockAgg.queryWindowByParty.mockResolvedValue([
      {
        partyId: 1,
        openingTt: D(100), layHangTt: D(0), thanhToanTt: D(0), closingTt: D(100),
        openingHd: D(0), layHangHd: D(0), thanhToanHd: D(0), closingHd: D(0),
      },
    ]);
    mockDb.supplier.findMany.mockResolvedValue([]);
    mockDb.entity.findUnique.mockResolvedValue({ name: "Chủ thể X" });

    const { aoa } = readSheet(await buildCongNoMonthlyExcel("material", MAY, 7, { supplierKind: "nhan_cong" }));
    expect(aoa.find((r) => r.includes("TỔNG"))).not.toContain(100);
    expect(aoa.some((r) => r.includes("NCC #1"))).toBe(false);
  });

  it("ignores Loại NCC on the labor ledger (parties are crews, not suppliers)", async () => {
    mockAgg.queryWindowByParty.mockResolvedValue([]);
    mockDb.contractor.findMany.mockResolvedValue([]);
    mockDb.entity.findUnique.mockResolvedValue(null);
    const { aoa } = readSheet(await buildCongNoMonthlyExcel("labor", MAY, 7, { supplierKind: "nhan_cong" }));
    expect(mockDb.supplier.findMany).not.toHaveBeenCalled();
    expect(String(aoa[0][0])).not.toContain("Loại NCC");
  });

  it("falls back to a '#id' label when the party is missing", async () => {
    mockAgg.queryWindowByParty.mockResolvedValue([
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

    const buf = await buildCongNoMonthlyExcel("labor", MAY, 7);
    const { aoa } = readSheet(buf);
    expect(aoa[2]).toContain("Đội #9");
  });
});
