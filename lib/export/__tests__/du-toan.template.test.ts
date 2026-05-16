import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

const mockDb = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectCategory: { findMany: vi.fn() },
  projectEstimate: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import { buildDuToanExcel } from "@/lib/export/templates/du-toan";

const D = (n: number) => new Prisma.Decimal(n);

beforeEach(() => vi.resetAllMocks());

function readSheet(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { names: wb.SheetNames, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

describe("buildDuToanExcel", () => {
  it("lists estimate rows under their category and totals the footer", async () => {
    mockDb.project.findUnique.mockResolvedValue({ code: "DA01", name: "Dự án A" });
    mockDb.projectCategory.findMany.mockResolvedValue([{ id: 3, name: "Phần thô" }]);
    mockDb.projectEstimate.findMany.mockResolvedValue([
      {
        categoryId: 3,
        itemCode: "VT01",
        itemName: "Xi măng",
        unit: "bao",
        qty: D(10),
        unitPrice: D(100),
        totalVnd: D(1000),
        note: null,
      },
      {
        categoryId: 3,
        itemCode: "VT02",
        itemName: "Cát",
        unit: "m3",
        qty: D(5),
        unitPrice: D(200),
        totalVnd: D(1000),
        note: "ghi chú",
      },
    ]);

    const { names, aoa } = readSheet(await buildDuToanExcel(1));
    expect(names).toEqual(["Dự toán"]);
    expect(String(aoa[0][0])).toContain("Dự án A");
    expect(aoa[2]).toContain("Xi măng");
    const footer = aoa.find((r) => r.includes("TỔNG CỘNG"))!;
    expect(footer).toContain(2000);
  });

  it("falls back to a generic project label when the project is missing", async () => {
    mockDb.project.findUnique.mockResolvedValue(null);
    mockDb.projectCategory.findMany.mockResolvedValue([]);
    mockDb.projectEstimate.findMany.mockResolvedValue([]);

    const { aoa } = readSheet(await buildDuToanExcel(42));
    expect(String(aoa[0][0])).toContain("Dự án #42");
  });
});
