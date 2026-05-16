import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  coordinationForm: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  department: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  getEscalatedForms,
  countEscalatedInMonth,
  groupByExecutorDept,
} from "@/lib/coordination-form/sla-stats";

beforeEach(() => vi.resetAllMocks());

const RANGE = { from: new Date("2026-05-01"), to: new Date("2026-05-31") };

describe("getEscalatedForms", () => {
  it("flattens the included relations into plain rows", async () => {
    mockDb.coordinationForm.findMany.mockResolvedValue([
      {
        id: 1,
        code: "PCV-202605-001",
        status: "approved",
        escalatedAt: new Date("2026-05-10"),
        closedAt: new Date("2026-05-12"),
        creator: { name: "An" },
        executorDept: { id: 7, name: "Kỹ thuật" },
        escalatedFromUser: { name: "Bình" },
      },
    ]);
    const rows = await getEscalatedForms(RANGE);
    expect(rows).toEqual([
      {
        id: 1,
        code: "PCV-202605-001",
        creatorName: "An",
        executorDeptId: 7,
        executorDeptName: "Kỹ thuật",
        escalatedFromUserName: "Bình",
        escalatedAt: new Date("2026-05-10"),
        finalStatus: "approved",
        finalActionAt: new Date("2026-05-12"),
      },
    ]);
  });

  it("maps a missing escalatedFromUser to null", async () => {
    mockDb.coordinationForm.findMany.mockResolvedValue([
      {
        id: 2,
        code: "PCV-202605-002",
        status: "pending",
        escalatedAt: new Date("2026-05-11"),
        closedAt: null,
        creator: { name: "An" },
        executorDept: { id: 7, name: "Kỹ thuật" },
        escalatedFromUser: null,
      },
    ]);
    const [row] = await getEscalatedForms(RANGE);
    expect(row.escalatedFromUserName).toBeNull();
    expect(row.finalActionAt).toBeNull();
  });

  it("adds an executorDeptId filter only when provided", async () => {
    mockDb.coordinationForm.findMany.mockResolvedValue([]);
    await getEscalatedForms({ ...RANGE, executorDeptId: 7 });
    expect(mockDb.coordinationForm.findMany.mock.calls[0][0].where.executorDeptId).toBe(7);
  });
});

describe("countEscalatedInMonth", () => {
  it("counts within the month's half-open range", async () => {
    mockDb.coordinationForm.count.mockResolvedValue(5);
    expect(await countEscalatedInMonth(2026, 5)).toBe(5);
    expect(mockDb.coordinationForm.count).toHaveBeenCalledWith({
      where: { escalatedAt: { gte: new Date(2026, 4, 1), lt: new Date(2026, 5, 1) } },
    });
  });
});

describe("groupByExecutorDept", () => {
  it("returns an empty list when there are no groups", async () => {
    mockDb.coordinationForm.groupBy.mockResolvedValue([]);
    expect(await groupByExecutorDept(RANGE)).toEqual([]);
    expect(mockDb.department.findMany).not.toHaveBeenCalled();
  });

  it("joins department names and sorts by count desc", async () => {
    mockDb.coordinationForm.groupBy.mockResolvedValue([
      { executorDeptId: 7, _count: { _all: 2 } },
      { executorDeptId: 9, _count: { _all: 5 } },
    ]);
    mockDb.department.findMany.mockResolvedValue([
      { id: 7, name: "Kỹ thuật" },
      { id: 9, name: "Vật tư" },
    ]);
    expect(await groupByExecutorDept(RANGE)).toEqual([
      { deptId: 9, deptName: "Vật tư", count: 5 },
      { deptId: 7, deptName: "Kỹ thuật", count: 2 },
    ]);
  });

  it("falls back to '?' when a department name is missing", async () => {
    mockDb.coordinationForm.groupBy.mockResolvedValue([
      { executorDeptId: 7, _count: { _all: 1 } },
    ]);
    mockDb.department.findMany.mockResolvedValue([]);
    expect(await groupByExecutorDept(RANGE)).toEqual([
      { deptId: 7, deptName: "?", count: 1 },
    ]);
  });
});
