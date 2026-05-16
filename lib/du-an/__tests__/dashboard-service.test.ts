import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  projectSettings: { findUnique: vi.fn() },
  projectSchedule: { groupBy: vi.fn() },
  projectEstimate: { aggregate: vi.fn() },
  projectTransaction: { aggregate: vi.fn() },
  project3WayCashflow: { groupBy: vi.fn() },
  projectContract: { findMany: vi.fn() },
}));
const mockProject = vi.hoisted(() => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/master-data/project-service", () => mockProject);

import { getProjectDashboard } from "@/lib/du-an/dashboard-service";

beforeEach(() => {
  vi.resetAllMocks();
  mockProject.getProjectById.mockResolvedValue({ id: 1, name: "Dự án A" });
});

describe("getProjectDashboard", () => {
  it("rolls up schedule counts, totals and cashflow by direction", async () => {
    mockDb.projectSettings.findUnique.mockResolvedValue({ contractWarningDays: 30 });
    mockDb.projectSchedule.groupBy.mockResolvedValue([
      { status: "done", _count: { id: 3 } },
      { status: "pending", _count: { id: 2 } },
    ]);
    mockDb.projectEstimate.aggregate.mockResolvedValue({ _sum: { totalVnd: 5000 } });
    mockDb.projectTransaction.aggregate.mockResolvedValue({ _sum: { amountTt: 1200 } });
    mockDb.project3WayCashflow.groupBy.mockResolvedValue([
      { flowDirection: "cdt_to_cty", _sum: { amountVnd: 800 } },
    ]);
    mockDb.projectContract.findMany.mockResolvedValue([{ id: 9, docName: "HĐ" }]);

    const d = await getProjectDashboard(1);
    expect(d.warningDays).toBe(30);
    expect(d.schedule).toEqual({ pending: 2, in_progress: 0, done: 3, delayed: 0 });
    expect(d.estimateTotal).toBe(5000);
    expect(d.transactionTotal).toBe(1200);
    expect(d.cashflow).toEqual({ cdt_to_cty: 800 });
    expect(d.contractWarnings).toHaveLength(1);
  });

  it("defaults warningDays to 90 and yields zeros (not NaN) for an empty project", async () => {
    mockDb.projectSettings.findUnique.mockResolvedValue(null);
    mockDb.projectSchedule.groupBy.mockResolvedValue([]);
    mockDb.projectEstimate.aggregate.mockResolvedValue({ _sum: { totalVnd: null } });
    mockDb.projectTransaction.aggregate.mockResolvedValue({ _sum: { amountTt: null } });
    mockDb.project3WayCashflow.groupBy.mockResolvedValue([]);
    mockDb.projectContract.findMany.mockResolvedValue([]);

    const d = await getProjectDashboard(1);
    expect(d.warningDays).toBe(90);
    expect(d.estimateTotal).toBe(0);
    expect(d.transactionTotal).toBe(0);
    expect(Number.isNaN(d.estimateTotal)).toBe(false);
    expect(d.schedule).toEqual({ pending: 0, in_progress: 0, done: 0, delayed: 0 });
    expect(d.cashflow).toEqual({});
  });
});
