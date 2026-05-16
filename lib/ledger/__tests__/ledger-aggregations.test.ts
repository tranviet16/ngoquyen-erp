import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  querySummary,
  queryMonthlyByParty,
  queryCurrentBalance,
  queryDebtMatrix,
} from "@/lib/ledger/ledger-aggregations";

beforeEach(() => vi.resetAllMocks());

describe("querySummary", () => {
  it("maps a raw row into a SummaryRow with Decimal fields", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        entity_id: 1,
        party_id: 2,
        project_id: null,
        opening_tt: 100,
        opening_hd: 90,
        lay_hang_tt: 50,
        lay_hang_hd: 40,
        thanh_toan_tt: 30,
        thanh_toan_hd: 20,
        dieu_chinh_tt: 0,
        dieu_chinh_hd: 0,
        balance_tt: 120,
        balance_hd: 110,
      },
    ]);
    const [row] = await querySummary("material", { entityId: 1 });
    expect(row.entityId).toBe(1);
    expect(row.partyId).toBe(2);
    expect(row.projectId).toBeNull();
    expect(row.balanceTt.toNumber()).toBe(120);
  });
});

describe("queryMonthlyByParty", () => {
  it("derives closing balances from opening + lay - tra", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { party_id: 7, open_tt: 100, open_hd: 100, lay_tt: 60, lay_hd: 60, tra_tt: 25, tra_hd: 25 },
    ]);
    const [row] = await queryMonthlyByParty("material", 2026, 5, 1);
    expect(row.partyId).toBe(7);
    expect(row.closingTt.toNumber()).toBe(135);
    expect(row.closingHd.toNumber()).toBe(135);
  });
});

describe("queryCurrentBalance", () => {
  it("sums opening balance and transaction balance", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ balance_tt: 200, balance_hd: 180 }])
      .mockResolvedValueOnce([{ balance_tt: 50, balance_hd: 40 }]);
    const bal = await queryCurrentBalance("material", 1, 2, null);
    expect(bal.tt.toNumber()).toBe(250);
    expect(bal.hd.toNumber()).toBe(220);
  });

  it("treats a missing opening balance row as zero", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance_tt: 50, balance_hd: 40 }]);
    const bal = await queryCurrentBalance("material", 1, 2, null);
    expect(bal.tt.toNumber()).toBe(50);
  });
});

describe("queryDebtMatrix", () => {
  it("groups rows by party and sums per-entity cells into totals", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        entity_id: 1,
        party_id: 9,
        open_tt: 10, open_hd: 10,
        lay_tt: 5, lay_hd: 5,
        tra_tt: 2, tra_hd: 2,
        close_tt: 13, close_hd: 13,
      },
      {
        entity_id: 2,
        party_id: 9,
        open_tt: 20, open_hd: 20,
        lay_tt: 0, lay_hd: 0,
        tra_tt: 4, tra_hd: 4,
        close_tt: 16, close_hd: 16,
      },
    ]);
    const matrix = await queryDebtMatrix("material", {});
    expect(matrix).toHaveLength(1);
    expect(Object.keys(matrix[0].cells).sort()).toEqual(["1", "2"]);
    expect(matrix[0].totals.openTt).toBe(30);
    expect(matrix[0].totals.closeTt).toBe(29);
  });
});
