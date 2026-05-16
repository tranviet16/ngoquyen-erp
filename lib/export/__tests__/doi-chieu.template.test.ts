import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  contractor: { findMany: vi.fn() },
  entity: { findMany: vi.fn() },
}));
const mockAgg = vi.hoisted(() => ({ querySummary: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/ledger/ledger-aggregations", () => mockAgg);

import { buildDoiChieuExcel } from "@/lib/export/templates/doi-chieu";

const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => vi.resetAllMocks());

const summaryRow = (over: Record<string, unknown> = {}) => ({
  entityId: 7,
  partyId: 1,
  projectId: null,
  openingTt: D(10),
  openingHd: D(0),
  layHangTt: D(5),
  layHangHd: D(0),
  thanhToanTt: D(3),
  thanhToanHd: D(0),
  dieuChinhTt: D(0),
  dieuChinhHd: D(0),
  balanceTt: D(12),
  balanceHd: D(0),
  ...over,
});

function readSheet(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { names: wb.SheetNames, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

describe("buildDoiChieuExcel", () => {
  it("maps party/entity names for a material ledger", async () => {
    mockAgg.querySummary.mockResolvedValue([summaryRow()]);
    mockDb.supplier.findMany.mockResolvedValue([{ id: 1, name: "NCC A" }]);
    mockDb.contractor.findMany.mockResolvedValue([]);
    mockDb.entity.findMany.mockResolvedValue([{ id: 7, name: "Chủ thể X" }]);

    const { names, aoa } = readSheet(await buildDoiChieuExcel("material"));
    expect(names).toEqual(["Đối chiếu"]);
    expect(String(aoa[0][0])).toContain("Vật tư");
    expect(aoa[2]).toContain("NCC A");
    expect(aoa[2]).toContain("Chủ thể X");
  });

  it("uses contractor names and '#id' fallbacks for a labor ledger", async () => {
    mockAgg.querySummary.mockResolvedValue([summaryRow({ partyId: 2, entityId: 9 })]);
    mockDb.supplier.findMany.mockResolvedValue([]);
    mockDb.contractor.findMany.mockResolvedValue([]);
    mockDb.entity.findMany.mockResolvedValue([]);

    const { aoa } = readSheet(await buildDoiChieuExcel("labor"));
    expect(aoa[2]).toContain("#2");
    expect(aoa[2]).toContain("#9");
  });
});
