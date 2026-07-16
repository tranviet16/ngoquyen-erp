/**
 * Unit tests for the State Obligations module.
 *
 * Strategy: mock `prisma` (no real DB) — matches the codebase unit-test pattern
 * in `lib/ledger/__tests__/balance-service.test.ts` and `lib/task/__tests__/`.
 *  - Report: mock `$queryRaw`, assert the opening/closing formula + period bounds.
 *  - JournalEntry sync: drive the internal helpers with a fake interactive `tx`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryRaw = vi.fn();
const mockAssertModuleReleased = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => mockQueryRaw(...args) },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: (...args: unknown[]) => mockAssertModuleReleased(...args),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { getObligationReport } from "@/lib/tai-chinh/state-obligation-report";
import {
  createTxnWithSync,
  updateTxnWithSync,
  deleteTxnWithSync,
  type ObligationTx,
  type ObligationTxnFields,
} from "@/lib/tai-chinh/state-obligation-internal";

// ─── Fake interactive transaction client ──────────────────────────────────────

const mockTx = {
  journalEntry: { create: vi.fn(), update: vi.fn() },
  stateObligationTxn: { create: vi.fn(), update: vi.fn() },
  cashAccount: { findUnique: vi.fn() },
};
const tx = mockTx as unknown as ObligationTx;

function fields(over: Partial<ObligationTxnFields> = {}): ObligationTxnFields {
  return {
    typeId: 1,
    date: new Date("2026-05-10T00:00:00.000Z"),
    kind: "phai_tra",
    amount: new Prisma.Decimal(100),
    cashAccountId: null,
    refNo: null,
    description: null,
    note: null,
    ...over,
  };
}

interface RawReportRow {
  id: number;
  name: string;
  code: string | null;
  category: string;
  sortOrder: number;
  opening_balance: Prisma.Decimal;
  prior_inc: Prisma.Decimal;
  prior_dec: Prisma.Decimal;
  period_inc: Prisma.Decimal;
  period_dec: Prisma.Decimal;
}

function reportRow(over: Partial<RawReportRow> = {}): RawReportRow {
  return {
    id: 1,
    name: "Thuế GTGT",
    code: "3331",
    category: "thue",
    sortOrder: 1,
    opening_balance: new Prisma.Decimal(0),
    prior_inc: new Prisma.Decimal(0),
    prior_dec: new Prisma.Decimal(0),
    period_inc: new Prisma.Decimal(0),
    period_dec: new Prisma.Decimal(0),
    ...over,
  };
}

/** Extract the Date values interpolated into the $queryRaw tagged template. */
function interpolatedDates(): Date[] {
  return (mockQueryRaw.mock.calls[0] ?? [])
    .slice(1)
    .filter((v: unknown): v is Date => v instanceof Date);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertModuleReleased.mockResolvedValue(undefined);
  mockTx.cashAccount.findUnique.mockResolvedValue({ name: "Quỹ tiền mặt" });
  mockTx.journalEntry.create.mockResolvedValue({ id: 99 });
  mockTx.journalEntry.update.mockResolvedValue({});
  mockTx.stateObligationTxn.create.mockResolvedValue({ id: 7 });
  mockTx.stateObligationTxn.update.mockResolvedValue({ id: 7 });
  mockQueryRaw.mockResolvedValue([]);
});

// ─── getObligationReport — balance formula ────────────────────────────────────

describe("getObligationReport — opening/closing formula", () => {
  it("opening = openingBalance + prior_inc − prior_dec; closing = opening + increase − decrease", async () => {
    mockQueryRaw.mockResolvedValue([
      reportRow({
        opening_balance: new Prisma.Decimal(100),
        prior_inc: new Prisma.Decimal(50),
        prior_dec: new Prisma.Decimal(20),
        period_inc: new Prisma.Decimal(30),
        period_dec: new Prisma.Decimal(10),
      }),
    ]);

    const rows = await getObligationReport({ periodKind: "month", year: 2026, periodIndex: 5 });

    expect(rows[0].opening).toBe("130"); // 100 + 50 − 20
    expect(rows[0].increase).toBe("30");
    expect(rows[0].decrease).toBe("10");
    expect(rows[0].closing).toBe("150"); // 130 + 30 − 10
  });

  it("emits numeric fields as strings (Server→Client safe)", async () => {
    mockQueryRaw.mockResolvedValue([
      reportRow({ opening_balance: new Prisma.Decimal("12345.67") }),
    ]);

    const rows = await getObligationReport({ periodKind: "year", year: 2026, periodIndex: 1 });

    expect(typeof rows[0].opening).toBe("string");
    expect(typeof rows[0].closing).toBe("string");
    expect(rows[0].opening).toBe("12345.67");
  });

  it("returns [] when there are no obligation types", async () => {
    mockQueryRaw.mockResolvedValue([]);
    const rows = await getObligationReport({ periodKind: "month", year: 2026, periodIndex: 5 });
    expect(rows).toEqual([]);
  });

  it("excludes soft-deleted rows in the SQL", async () => {
    await getObligationReport({ periodKind: "month", year: 2026, periodIndex: 5 });
    const sql = (mockQueryRaw.mock.calls[0][0] as string[]).join("");
    expect(sql).toContain('"deletedAt" IS NULL');
  });
});

// ─── getObligationReport — period boundaries ──────────────────────────────────

describe("getObligationReport — period boundaries (UTC, end exclusive)", () => {
  it("month 5/2026 → [2026-05-01, 2026-06-01)", async () => {
    await getObligationReport({ periodKind: "month", year: 2026, periodIndex: 5 });
    const times = new Set(interpolatedDates().map((d) => d.getTime()));
    expect(times.has(Date.UTC(2026, 4, 1))).toBe(true);
    expect(times.has(Date.UTC(2026, 5, 1))).toBe(true);
  });

  it("quarter 2/2026 → [2026-04-01, 2026-07-01)", async () => {
    await getObligationReport({ periodKind: "quarter", year: 2026, periodIndex: 2 });
    const times = new Set(interpolatedDates().map((d) => d.getTime()));
    expect(times.has(Date.UTC(2026, 3, 1))).toBe(true);
    expect(times.has(Date.UTC(2026, 6, 1))).toBe(true);
  });

  it("year 2026 → [2026-01-01, 2027-01-01)", async () => {
    await getObligationReport({ periodKind: "year", year: 2026, periodIndex: 1 });
    const times = new Set(interpolatedDates().map((d) => d.getTime()));
    expect(times.has(Date.UTC(2026, 0, 1))).toBe(true);
    expect(times.has(Date.UTC(2027, 0, 1))).toBe(true);
  });
});

// ─── createTxnWithSync — JournalEntry sync ────────────────────────────────────

describe("createTxnWithSync", () => {
  it("phai_tra creates only the txn — no JournalEntry", async () => {
    await createTxnWithSync(tx, fields({ kind: "phai_tra" }), "Thuế GTGT");

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
    expect(mockTx.stateObligationTxn.create).toHaveBeenCalledOnce();
    expect(mockTx.stateObligationTxn.create.mock.calls[0][0].data.journalEntryId).toBeUndefined();
  });

  it("da_nop creates a linked 'chi' JournalEntry and back-links refId", async () => {
    await createTxnWithSync(
      tx,
      fields({ kind: "da_nop", cashAccountId: 3, amount: new Prisma.Decimal(500) }),
      "Thuế GTGT",
    );

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const je = mockTx.journalEntry.create.mock.calls[0][0].data;
    expect(je.entryType).toBe("chi");
    expect(je.refModule).toBe("state_obligation");
    expect(je.fromAccountId).toBe(3);
    expect(je.amountVnd.toString()).toBe("500");

    expect(mockTx.stateObligationTxn.create.mock.calls[0][0].data.journalEntryId).toBe(99);
    expect(mockTx.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { refId: 7 },
    });
  });
});

// ─── updateTxnWithSync — JournalEntry sync ────────────────────────────────────

describe("updateTxnWithSync", () => {
  it("da_nop with an existing JournalEntry updates it in place", async () => {
    await updateTxnWithSync(tx, 7, 55, fields({ kind: "da_nop", cashAccountId: 2 }), "BHXH");

    expect(mockTx.journalEntry.update).toHaveBeenCalledOnce();
    expect(mockTx.journalEntry.update.mock.calls[0][0].where).toEqual({ id: 55 });
    expect(mockTx.journalEntry.update.mock.calls[0][0].data.refId).toBe(7);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it("da_nop with no existing JournalEntry creates and links one", async () => {
    mockTx.journalEntry.create.mockResolvedValue({ id: 60 });

    await updateTxnWithSync(tx, 7, null, fields({ kind: "da_nop", cashAccountId: 2 }), "BHXH");

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    expect(mockTx.stateObligationTxn.update.mock.calls[0][0].data.journalEntryId).toBe(60);
  });

  it("changing kind da_nop → phai_tra soft-deletes the JournalEntry, clears its refId and the link", async () => {
    await updateTxnWithSync(tx, 7, 55, fields({ kind: "phai_tra" }), "BHXH");

    expect(mockTx.journalEntry.update).toHaveBeenCalledOnce();
    expect(mockTx.journalEntry.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    // refId must be cleared so a later phai_tra → da_nop round-trip cannot
    // leave two JournalEntry rows both pointing at the same txn.
    expect(mockTx.journalEntry.update.mock.calls[0][0].data.refId).toBeNull();
    expect(mockTx.stateObligationTxn.update.mock.calls[0][0].data.journalEntryId).toBeNull();
  });
});

// ─── deleteTxnWithSync — JournalEntry sync ────────────────────────────────────

describe("deleteTxnWithSync", () => {
  it("soft-deletes both the txn and its linked JournalEntry", async () => {
    await deleteTxnWithSync(tx, 7, 55);

    expect(mockTx.journalEntry.update).toHaveBeenCalledOnce();
    expect(mockTx.journalEntry.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(mockTx.journalEntry.update.mock.calls[0][0].data.refId).toBeNull();
    expect(mockTx.stateObligationTxn.update).toHaveBeenCalledOnce();
    expect(mockTx.stateObligationTxn.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it("soft-deletes only the txn when there is no linked JournalEntry", async () => {
    await deleteTxnWithSync(tx, 7, null);

    expect(mockTx.journalEntry.update).not.toHaveBeenCalled();
    expect(mockTx.stateObligationTxn.update).toHaveBeenCalledOnce();
  });
});
