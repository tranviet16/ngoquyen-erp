import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  prevMonth,
  nextMonth,
  recomputeLuyKeForRow,
  findFutureMonths,
  cascadeFutureMonths,
} from "@/lib/sl-dt/recompute";

const D = (n: number) => new Prisma.Decimal(n);

describe("prevMonth / nextMonth", () => {
  it("wraps across year boundaries", () => {
    expect(prevMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
  });
  it("steps within a year otherwise", () => {
    expect(prevMonth({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 4 });
    expect(nextMonth({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 6 });
  });
});

describe("recomputeLuyKeForRow", () => {
  it("returns null when the current month row is missing", async () => {
    const tx = {
      slDtMonthlyInput: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    expect(await recomputeLuyKeForRow(tx as never, 1, 2026, 5)).toBeNull();
  });

  it("adds prev-month lũy kế to this-month kỳ and persists", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 10, slThucKyTho: D(30), dtThoKy: D(20), dtTratKy: D(5) })
      .mockResolvedValueOnce({ slLuyKeTho: D(100), dtThoLuyKe: D(200), dtTratLuyKe: D(50) });
    const update = vi.fn().mockResolvedValue({});
    const tx = { slDtMonthlyInput: { findUnique, update } };

    const out = await recomputeLuyKeForRow(tx as never, 1, 2026, 5);
    expect(out).toEqual({ slLuyKeTho: 130, dtThoLuyKe: 220, dtTratLuyKe: 55 });
    expect(update).toHaveBeenCalledOnce();
  });

  it("treats a missing prev month as zero lũy kế", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 11, slThucKyTho: D(30), dtThoKy: D(20), dtTratKy: D(5) })
      .mockResolvedValueOnce(null);
    const tx = { slDtMonthlyInput: { findUnique, update: vi.fn().mockResolvedValue({}) } };
    expect(await recomputeLuyKeForRow(tx as never, 1, 2026, 5)).toEqual({
      slLuyKeTho: 30,
      dtThoLuyKe: 20,
      dtTratLuyKe: 5,
    });
  });
});

describe("findFutureMonths", () => {
  it("maps query rows to MonthRef objects", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
    const tx = { slDtMonthlyInput: { findMany } };
    expect(await findFutureMonths(tx as never, 1, 2026, 5)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });
});

describe("cascadeFutureMonths", () => {
  it("returns the count of future months walked", async () => {
    const tx = {
      slDtMonthlyInput: {
        findMany: vi.fn().mockResolvedValue([{ year: 2026, month: 6 }]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      slDtProgressStatus: { findUnique: vi.fn().mockResolvedValue(null) },
      slDtPaymentPlan: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    expect(await cascadeFutureMonths(tx as never, 1, 2026, 5)).toBe(1);
  });
});
