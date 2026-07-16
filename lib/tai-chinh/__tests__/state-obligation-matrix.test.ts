import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mockQueryRaw = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockRequireAccess = vi.fn();
const mockBulkUpsert = vi.fn();
const mockSoftDelete = vi.fn();
const mockAssertModuleReleased = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    stateObligationTxn: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/acl/role-permissions", () => ({
  requireRoleModuleAccess: (...args: unknown[]) => mockRequireAccess(...args),
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: (...args: unknown[]) => mockAssertModuleReleased(...args),
}));

vi.mock("@/lib/tai-chinh/state-obligation-internal", () => ({
  getRole: vi.fn(async () => "ke-toan"),
}));

vi.mock("@/lib/tai-chinh/state-obligation-service", () => ({
  bulkUpsertObligationTxns: (...args: unknown[]) => mockBulkUpsert(...args),
  softDeleteObligationTxns: (...args: unknown[]) => mockSoftDelete(...args),
}));

import {
  getObligationMatrix,
  saveObligationMatrix,
} from "@/lib/tai-chinh/state-obligation-matrix";
import { endOfPeriodDate } from "@/lib/tai-chinh/state-obligation-matrix-period";

interface RawMatrixRow {
  id: number;
  name: string;
  category: string;
  sortOrder: number;
  opening_balance: Prisma.Decimal;
  prior_inc: Prisma.Decimal;
  prior_dec: Prisma.Decimal;
  phai_tra_sum: Prisma.Decimal;
  phai_tra_count: bigint | number;
  phai_tra_first_id: number | null;
  da_nop_sum: Prisma.Decimal;
  da_nop_count: bigint | number;
  da_nop_first_id: number | null;
  da_nop_cash_account_id: number | null;
}

function rawRow(over: Partial<RawMatrixRow> = {}): RawMatrixRow {
  return {
    id: 1,
    name: "Thuế GTGT",
    category: "thue",
    sortOrder: 1,
    opening_balance: new Prisma.Decimal(0),
    prior_inc: new Prisma.Decimal(0),
    prior_dec: new Prisma.Decimal(0),
    phai_tra_sum: new Prisma.Decimal(0),
    phai_tra_count: 0,
    phai_tra_first_id: null,
    da_nop_sum: new Prisma.Decimal(0),
    da_nop_count: 0,
    da_nop_first_id: null,
    da_nop_cash_account_id: null,
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertModuleReleased.mockResolvedValue(undefined);
  mockQueryRaw.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue(null);
  mockFindMany.mockResolvedValue([]);
});

describe("getObligationMatrix", () => {
  it("maps an obligation type with no txn as zero editable cells", async () => {
    mockQueryRaw.mockResolvedValue([rawRow()]);

    const rows = await getObligationMatrix({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0]).toMatchObject({
      typeId: 1,
      phaiTraAmount: "0",
      phaiTraTxnId: null,
      phaiTraMultiRow: false,
      daNopAmount: "0",
      daNopTxnId: null,
      daNopMultiRow: false,
      daNopCashAccountId: null,
      closing: "0",
    });
  });

  it("keeps the txn id for a single canonical phai_tra row", async () => {
    mockQueryRaw.mockResolvedValue([
      rawRow({
        phai_tra_sum: new Prisma.Decimal(120),
        phai_tra_count: 1,
        phai_tra_first_id: 10,
      }),
    ]);

    const rows = await getObligationMatrix({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0].phaiTraAmount).toBe("120");
    expect(rows[0].phaiTraTxnId).toBe(10);
    expect(rows[0].phaiTraMultiRow).toBe(false);
  });

  it("marks a kind as multi-row and hides its canonical txn id when count is 2+", async () => {
    mockQueryRaw.mockResolvedValue([
      rawRow({
        da_nop_sum: new Prisma.Decimal(75),
        da_nop_count: 2,
        da_nop_first_id: 20,
        da_nop_cash_account_id: null,
      }),
    ]);

    const rows = await getObligationMatrix({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0].daNopAmount).toBe("75");
    expect(rows[0].daNopTxnId).toBeNull();
    expect(rows[0].daNopMultiRow).toBe(true);
    expect(rows[0].daNopCashAccountId).toBeNull();
  });

  it("computes opening and closing from carry-in plus period movement", async () => {
    mockQueryRaw.mockResolvedValue([
      rawRow({
        opening_balance: new Prisma.Decimal(100),
        prior_inc: new Prisma.Decimal(50),
        prior_dec: new Prisma.Decimal(20),
        phai_tra_sum: new Prisma.Decimal(30),
        da_nop_sum: new Prisma.Decimal(10),
      }),
    ]);

    const rows = await getObligationMatrix({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0].opening).toBe("130");
    expect(rows[0].closing).toBe("150");
  });

  it("keeps da_nop cash account only for a single row", async () => {
    mockQueryRaw.mockResolvedValue([
      rawRow({ da_nop_count: 1, da_nop_first_id: 22, da_nop_cash_account_id: 3 }),
      rawRow({ id: 2, da_nop_count: 2, da_nop_cash_account_id: null }),
    ]);

    const rows = await getObligationMatrix({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0].daNopCashAccountId).toBe(3);
    expect(rows[1].daNopCashAccountId).toBeNull();
  });
});

describe("saveObligationMatrix", () => {
  it("validates payment cash account before querying or writing", async () => {
    await expect(
      saveObligationMatrix(
        { periodKind: "month", year: 2026, periodIndex: 5 },
        [{ typeId: 1, daNopAmount: 100, daNopCashAccountId: null }],
      ),
    ).rejects.toThrow("Phải chọn TK tiền");

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockBulkUpsert).not.toHaveBeenCalled();
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("creates a new canonical phai_tra txn on the period end date", async () => {
    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraAmount: 100 }],
    );

    expect(mockBulkUpsert).toHaveBeenCalledWith([
      {
        typeId: 1,
        kind: "phai_tra",
        amount: "100",
        date: new Date(Date.UTC(2026, 4, 31)),
      },
    ]);
  });

  it("updates an existing phai_tra txn when a canonical id is present", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 10 });

    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraTxnId: 10, phaiTraAmount: 125 }],
    );

    expect(mockBulkUpsert).toHaveBeenCalledWith([
      { id: 10, amount: "125", date: new Date(Date.UTC(2026, 4, 31)) },
    ]);
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 10,
        typeId: 1,
        kind: "phai_tra",
        deletedAt: null,
        date: {
          gte: new Date(Date.UTC(2026, 4, 1)),
          lt: new Date(Date.UTC(2026, 5, 1)),
        },
      },
      select: { id: true },
    });
  });

  it("soft-deletes an existing txn when amount is set to zero", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 10 });

    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraTxnId: 10, phaiTraAmount: 0 }],
    );

    expect(mockSoftDelete).toHaveBeenCalledWith([10]);
    expect(mockBulkUpsert).not.toHaveBeenCalled();
  });

  it("creates da_nop with cash account", async () => {
    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, daNopAmount: 50, daNopCashAccountId: 3 }],
    );

    expect(mockBulkUpsert).toHaveBeenCalledWith([
      {
        typeId: 1,
        kind: "da_nop",
        amount: "50",
        cashAccountId: 3,
        date: new Date(Date.UTC(2026, 4, 31)),
      },
    ]);
  });

  it("skips cells flagged as multi-row", async () => {
    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraAmount: 100, phaiTraMultiRow: true }],
    );

    expect(mockBulkUpsert).not.toHaveBeenCalled();
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("resolves a stale no-id patch to the existing canonical txn before upsert", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 99 }]);

    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraAmount: 100 }],
    );

    expect(mockBulkUpsert).toHaveBeenCalledWith([
      { id: 99, amount: "100", date: new Date(Date.UTC(2026, 4, 31)) },
    ]);
  });

  it("does not trust a hinted txn id outside the requested canonical cell", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    mockFindMany.mockResolvedValueOnce([{ id: 99 }]);

    await saveObligationMatrix(
      { periodKind: "month", year: 2026, periodIndex: 5 },
      [{ typeId: 1, phaiTraTxnId: 10, phaiTraAmount: 100 }],
    );

    expect(mockBulkUpsert).toHaveBeenCalledWith([
      { id: 99, amount: "100", date: new Date(Date.UTC(2026, 4, 31)) },
    ]);
  });
});

describe("endOfPeriodDate", () => {
  it.each([
    [{ periodKind: "month" as const, year: 2026, periodIndex: 5 }, Date.UTC(2026, 4, 31)],
    [{ periodKind: "month" as const, year: 2024, periodIndex: 2 }, Date.UTC(2024, 1, 29)],
    [{ periodKind: "month" as const, year: 2026, periodIndex: 2 }, Date.UTC(2026, 1, 28)],
    [{ periodKind: "quarter" as const, year: 2026, periodIndex: 2 }, Date.UTC(2026, 5, 30)],
    [{ periodKind: "year" as const, year: 2026, periodIndex: 1 }, Date.UTC(2026, 11, 31)],
  ])("returns the last UTC day for %o", (period, expected) => {
    expect(endOfPeriodDate(period).getTime()).toBe(expected);
  });
});
