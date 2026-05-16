/**
 * Unit tests for lib/ledger/balance-service.ts
 *
 * Strategy: mock prisma.$queryRaw so tests run without a real DB.
 * The mock captures the SQL template tag call and returns controlled rows.
 *
 * Tests A–I per phase-01-balance-service.md spec.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mock prisma ──────────────────────────────────────────────────────────────

const mockQueryRaw = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  keyOf,
  getBalancesBulk,
  getOutstandingDebt,
  getCumulativePaid,
} from "../balance-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a BulkRawRow as the DB would return it. */
function makeRow(opts: {
  entityId: number | null;
  partyId: number;
  projectId: number | null;
  opening: number | string;
  layHang: number | string;
  thanhToan: number | string;
}) {
  return {
    entity_id: opts.entityId,
    party_id: opts.partyId,
    project_id: opts.projectId,
    opening: new Prisma.Decimal(opts.opening),
    lay_hang: new Prisma.Decimal(opts.layHang),
    thanh_toan: new Prisma.Decimal(opts.thanhToan),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── Test A — dieu_chinh ignored ─────────────────────────────────────────────

describe("Test A — dieu_chinh rows are ignored", () => {
  it("outstanding is unchanged when only dieu_chinh row exists (not in DB result)", async () => {
    /**
     * The SQL FILTER predicates only aggregate 'lay_hang' and 'thanh_toan'.
     * A dieu_chinh-only scenario returns opening=0, layHang=0, thanhToan=0.
     * We verify this by returning a row with those zeros.
     */
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 0, layHang: 0, thanhToan: 0 }),
    ]);

    const result = await getOutstandingDebt({
      ledgerType: "material",
      entityId: 1,
      partyId: 10,
    });

    // outstanding = 0 + 0 − 0 = 0 (dieu_chinh not counted)
    expect(result.toNumber()).toBe(0);
  });
});

// ─── Test B — opening included ────────────────────────────────────────────────

describe("Test B — opening balance is included in outstanding", () => {
  it("opening=500, layHang=300, thanhToan=100 → outstanding=700", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 500, layHang: 300, thanhToan: 100 }),
    ]);

    const result = await getOutstandingDebt({
      ledgerType: "material",
      entityId: 1,
      partyId: 10,
    });

    expect(result.toNumber()).toBe(700); // 500 + 300 − 100
  });
});

// ─── Test C — asOf cutoff ─────────────────────────────────────────────────────

describe("Test C — asOf cutoff excludes future transactions", () => {
  it("future-dated layHang returns only opening in outstanding", async () => {
    /**
     * The SQL WHERE uses "date" <= asOf so future rows never reach the aggregator.
     * Our mock simulates what the DB returns AFTER applying the date filter:
     * only opening remains, layHang=0.
     */
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 200, layHang: 0, thanhToan: 0 }),
    ]);

    const cutoff = new Date("2024-01-01");
    const result = await getOutstandingDebt({
      ledgerType: "material",
      entityId: 1,
      partyId: 10,
      asOf: cutoff,
    });

    expect(result.toNumber()).toBe(200); // only opening; future layHang excluded
  });
});

// ─── Test D — ledgerType isolation ───────────────────────────────────────────

describe("Test D — ledgerType isolation: material never returns labor rows", () => {
  it("material call with only labor data returns zero (empty DB result → present-with-zeros)", async () => {
    /**
     * DB returns no rows for this pair under 'material' ledgerType.
     * The function guarantees present-with-zeros for all requested pairs.
     */
    mockQueryRaw.mockResolvedValue([]); // no material rows

    const result = await getOutstandingDebt({
      ledgerType: "material",
      entityId: 1,
      partyId: 10,
    });

    expect(result.toNumber()).toBe(0);
  });

  it("'labor' call with material data returns zero (type isolation)", async () => {
    mockQueryRaw.mockResolvedValue([]); // no labor rows

    const result = await getOutstandingDebt({
      ledgerType: "labor",
      entityId: 1,
      partyId: 10,
    });

    expect(result.toNumber()).toBe(0);
  });
});

// ─── Test E — single query ────────────────────────────────────────────────────

describe("Test E — getBalancesBulk issues exactly 1 $queryRaw call", () => {
  it("100 distinct pairs → single DB round-trip", async () => {
    const pairs = Array.from({ length: 100 }, (_, i) => ({
      entityId: 1,
      partyId: i + 1,
      projectId: null,
    }));

    // Return empty rows — we only care about call count
    mockQueryRaw.mockResolvedValue([]);

    await getBalancesBulk({ ledgerType: "material", pairs });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

// ─── Test F — empty pairs ─────────────────────────────────────────────────────

describe("Test F — empty pairs returns empty Map with zero DB hits", () => {
  it("getBalancesBulk([]) returns empty Map and does not call $queryRaw", async () => {
    const result = await getBalancesBulk({ ledgerType: "material", pairs: [] });

    expect(result.size).toBe(0);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});

// ─── Test G — missing pair: present-with-zeros ────────────────────────────────

describe("Test G — missing pair returns present-with-zeros (not absent)", () => {
  it("pair with no opening + no tx returns entry with all-zero Decimals", async () => {
    /**
     * Design choice: present-with-zeros rather than absent.
     * This prevents undefined checks at every call site.
     * DB returns no row for the pair; we seed zeros in the Map first.
     */
    mockQueryRaw.mockResolvedValue([]); // no DB data for any pair

    const result = await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 99, projectId: null }],
    });

    const key = keyOf(1, 99, null);
    expect(result.has(key)).toBe(true);

    const entry = result.get(key)!;
    expect(entry.outstanding.toNumber()).toBe(0);
    expect(entry.paid.toNumber()).toBe(0);
    expect(entry.opening.toNumber()).toBe(0);
    expect(entry.layHang.toNumber()).toBe(0);
    expect(entry.thanhToan.toNumber()).toBe(0);
  });
});

// ─── Test H — getCumulativePaid excludes opening ──────────────────────────────

describe("Test H — getCumulativePaid excludes opening balance", () => {
  it("opening=500, thanhToan=200 → paid=200 (opening not counted)", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 500, layHang: 0, thanhToan: 200 }),
    ]);

    const result = await getCumulativePaid({
      ledgerType: "material",
      entityId: 1,
      partyId: 10,
    });

    expect(result.toNumber()).toBe(200); // only thanh_toan, not opening
  });
});

// ─── Test I — IS NOT DISTINCT FROM: NULL projectId semantics ─────────────────

describe("Test I — IS NOT DISTINCT FROM for projectId NULL handling", () => {
  it("pair with projectId=null matches opening row with projectId=null", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 300, layHang: 0, thanhToan: 0 }),
    ]);

    const result = await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 10, projectId: null }],
    });

    const key = keyOf(1, 10, null);
    expect(result.get(key)?.opening.toNumber()).toBe(300);
  });

  it("pair with projectId=5 does NOT match a row with projectId=null", async () => {
    /**
     * IS NOT DISTINCT FROM: null IS NOT DISTINCT FROM null = true,
     * but 5 IS NOT DISTINCT FROM null = false.
     * The DB returns no row for projectId=5 when only projectId=null exists.
     */
    mockQueryRaw.mockResolvedValue([]); // DB: no row for projectId=5

    const result = await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 10, projectId: 5 }],
    });

    const key = keyOf(1, 10, 5);
    // Present-with-zeros (Test G guarantee), not the null-projectId row
    expect(result.get(key)?.opening.toNumber()).toBe(0);
  });

  it("keyOf distinguishes null-projectId from numeric-projectId", () => {
    expect(keyOf(1, 10, null)).not.toBe(keyOf(1, 10, 5));
    expect(keyOf(1, 10, null)).toBe(keyOf(1, 10, undefined));
  });
});

// ─── Additional: getBalancesBulk map structure ────────────────────────────────

describe("getBalancesBulk — map structure and multiple pairs", () => {
  it("returns correct entries for 2 distinct pairs", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 100, layHang: 50, thanhToan: 30 }),
      makeRow({ entityId: 1, partyId: 20, projectId: 5, opening: 0, layHang: 200, thanhToan: 80 }),
    ]);

    const result = await getBalancesBulk({
      ledgerType: "material",
      pairs: [
        { entityId: 1, partyId: 10, projectId: null },
        { entityId: 1, partyId: 20, projectId: 5 },
      ],
    });

    expect(result.size).toBe(2);

    const e1 = result.get(keyOf(1, 10, null))!;
    expect(e1.outstanding.toNumber()).toBe(120); // 100 + 50 − 30
    expect(e1.paid.toNumber()).toBe(30);

    const e2 = result.get(keyOf(1, 20, 5))!;
    expect(e2.outstanding.toNumber()).toBe(120); // 0 + 200 − 80
    expect(e2.paid.toNumber()).toBe(80);
  });

  it("all Decimal fields are Prisma.Decimal instances", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 100, layHang: 50, thanhToan: 30 }),
    ]);

    const result = await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 10, projectId: null }],
    });

    const entry = result.get(keyOf(1, 10, null))!;
    expect(entry.outstanding).toBeInstanceOf(Prisma.Decimal);
    expect(entry.paid).toBeInstanceOf(Prisma.Decimal);
    expect(entry.opening).toBeInstanceOf(Prisma.Decimal);
    expect(entry.layHang).toBeInstanceOf(Prisma.Decimal);
    expect(entry.thanhToan).toBeInstanceOf(Prisma.Decimal);
  });
});

// ─── Decimal precision — no float drift ───────────────────────────────────────

describe("Decimal precision", () => {
  it("opening 0.1 + layHang 0.2 → outstanding exactly 0.3 (no float drift)", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: "0.1", layHang: "0.2", thanhToan: 0 }),
    ]);

    const result = await getOutstandingDebt({ ledgerType: "material", entityId: 1, partyId: 10 });

    // JS `0.1 + 0.2 === 0.30000000000000004` — Prisma.Decimal must not drift.
    expect(result.equals(new Prisma.Decimal("0.3"))).toBe(true);
    expect(result.toString()).toBe("0.3");
  });

  it("preserves 2-decimal cents through plus/minus", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: "1000.55", layHang: "0.45", thanhToan: "0.99" }),
    ]);

    const result = await getOutstandingDebt({ ledgerType: "material", entityId: 1, partyId: 10 });

    expect(result.toString()).toBe("1000.01"); // 1000.55 + 0.45 − 0.99
  });
});

// ─── Negative balances ────────────────────────────────────────────────────────

describe("Negative balances", () => {
  it("thanhToan exceeding opening + layHang yields a negative outstanding", async () => {
    mockQueryRaw.mockResolvedValue([
      makeRow({ entityId: 1, partyId: 10, projectId: null, opening: 0, layHang: 100, thanhToan: 300 }),
    ]);

    const result = await getOutstandingDebt({ ledgerType: "material", entityId: 1, partyId: 10 });

    expect(result.toNumber()).toBe(-200); // 0 + 100 − 300
    expect(result.isNegative()).toBe(true);
  });
});

// ─── asOf boundary ────────────────────────────────────────────────────────────

describe("asOf boundary", () => {
  it("forwards the supplied asOf Date into the SQL query (used by the <= cutoff)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const asOf = new Date("2026-05-16T00:00:00.000Z");

    await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 10, projectId: null }],
      asOf,
    });

    // $queryRaw tagged-template: call args = [stringsArray, ...interpolatedValues].
    // The boundary date must appear among the interpolated values so the DB
    // `"date" <= asOf` filter is anchored to exactly the caller-supplied instant.
    const callArgs = mockQueryRaw.mock.calls[0];
    const passedAsOf = callArgs.find(
      (v: unknown) => v instanceof Date && v.getTime() === asOf.getTime(),
    );
    expect(passedAsOf).toBeInstanceOf(Date);
  });

  it("defaults asOf to ~now when omitted", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const before = Date.now();

    await getBalancesBulk({
      ledgerType: "material",
      pairs: [{ entityId: 1, partyId: 10, projectId: null }],
    });

    const after = Date.now();
    const callArgs = mockQueryRaw.mock.calls[0];
    const passedAsOf = callArgs.find((v: unknown) => v instanceof Date) as Date | undefined;
    expect(passedAsOf).toBeInstanceOf(Date);
    expect(passedAsOf!.getTime()).toBeGreaterThanOrEqual(before);
    expect(passedAsOf!.getTime()).toBeLessThanOrEqual(after);
  });
});
