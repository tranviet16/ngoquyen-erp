import { describe, it, expect, beforeEach, vi } from "vitest";
import * as XLSX from "xlsx";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn() },
  entity: { findMany: vi.fn() },
}));
const mockAgg = vi.hoisted(() => ({ queryDebtMatrix: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/ledger/ledger-aggregations", () => mockAgg);

import { buildCongNoTongHopExcel } from "@/lib/export/templates/cong-no-tong-hop";

type TestCell = {
  openTt: number; layTt: number; traTt: number; closeTt: number;
  openHd: number; layHd: number; traHd: number; closeHd: number;
};
const cell = (open: number, lay: number, tra: number, close: number): TestCell => ({
  openTt: open, layTt: lay, traTt: tra, closeTt: close,
  openHd: 0, layHd: 0, traHd: 0, closeHd: 0,
});
const sum = (a: TestCell, b: TestCell): TestCell => ({
  openTt: a.openTt + b.openTt, layTt: a.layTt + b.layTt, traTt: a.traTt + b.traTt, closeTt: a.closeTt + b.closeTt,
  openHd: 0, layHd: 0, traHd: 0, closeHd: 0,
});

// 2 NCC x 3 Chủ thể (Alpha=1, Beta=2, Gamma=3)
const a1 = cell(310_605_120, 44_400_000, 100_000_000, 255_005_120);
const a2 = cell(0, 1_000_000, 0, 1_000_000);
const b1 = cell(500, 100, 50, 550);
const b3 = cell(10, 0, 10, 0);

beforeEach(() => {
  vi.resetAllMocks();
  mockAgg.queryDebtMatrix.mockResolvedValue([
    { partyId: 20, partyName: "", cells: { "3": b3, "1": b1 }, totals: sum(b1, b3) },
    { partyId: 10, partyName: "", cells: { "1": a1, "2": a2 }, totals: sum(a1, a2) },
  ]);
  mockDb.supplier.findMany.mockResolvedValue([
    { id: 10, name: "Nam Hương" },
    { id: 20, name: "Bê tông HP" },
  ]);
  mockDb.entity.findMany.mockResolvedValue([
    { id: 3, name: "Gamma" },
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beta" },
  ]);
});

async function load(params: Parameters<typeof buildCongNoTongHopExcel>[0]) {
  const wb = XLSX.read(await buildCongNoTongHopExcel(params), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { wb, ws, aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) };
}

describe("buildCongNoTongHopExcel", () => {
  it("names the sheet Công Nợ and puts the first entity at B2", async () => {
    const { wb, ws } = await load({ from: "2026-04-27", to: "2026-05-26" });
    expect(wb.SheetNames).toEqual(["Công Nợ"]);
    expect(ws["B2"].v).toBe("Alpha");
    expect(ws["A2"].v).toBe("Nhà cung cấp");
  });

  it("merges 6 columns per group, with the last group TỔNG CÔNG TY", async () => {
    const { ws } = await load({ from: null, to: null });
    const merges = ws["!merges"]!;
    // 3 entities + TỔNG CÔNG TY = 4 horizontal group merges on row index 1
    const groupMerges = merges.filter((m) => m.s.r === 1 && m.e.r === 1);
    expect(groupMerges).toHaveLength(4);
    for (const m of groupMerges) expect(m.e.c - m.s.c).toBe(5);
    expect(ws[XLSX.utils.encode_cell({ r: 1, c: 19 })].v).toBe("TỔNG CÔNG TY");
    // vertical merge of the supplier header
    expect(merges.some((m) => m.s.r === 1 && m.e.r === 2 && m.s.c === 0 && m.e.c === 0)).toBe(true);
  });

  it("sorts suppliers by name and maps LH / Trả / Nợ", async () => {
    const { aoa } = await load({ from: "2026-04-27", to: "2026-05-26" });
    expect(aoa[2].slice(0, 7)).toEqual(["", "LH TT", "Trả TT", "Nợ TT", "LH HĐ", "Trả HĐ", "Nợ HĐ"]);
    expect(aoa[3][0]).toBe("Bê tông HP");
    const nh = aoa[4];
    expect(nh[0]).toBe("Nam Hương");
    expect(nh.slice(1, 4)).toEqual([44_400_000, 100_000_000, 255_005_120]);
  });

  it("writes the TỔNG row as column sums", async () => {
    const { aoa } = await load({ from: null, to: null });
    const total = aoa[aoa.length - 1];
    expect(total[0]).toBe("TỔNG");
    // Alpha group LH TT: lấy hàng trong kỳ only, without the opening balances: 44.400.000 + 100
    expect(total[1]).toBe(44_400_000 + 100);
    // TỔNG CÔNG TY Nợ TT = every row's closeTt summed
    expect(total[1 + 3 * 6 + 2]).toBe(255_005_120 + 1_000_000 + 550 + 0);
  });

  it("queries the window and restricts to selected entities", async () => {
    const { aoa } = await load({ from: "2026-04-27", to: null, entityIds: [2] });
    expect(mockAgg.queryDebtMatrix).toHaveBeenCalledWith(
      "material",
      expect.objectContaining({ entityIds: [2], to: null })
    );
    expect(aoa[1][1]).toBe("Beta");
    expect(String(aoa[0][0])).toContain("Từ 27/04/2026");
  });

  it("rejects an invalid window instead of exporting", async () => {
    await expect(buildCongNoTongHopExcel({ from: "2026-06-01", to: "2026-05-01" })).rejects.toThrow();
  });
});
