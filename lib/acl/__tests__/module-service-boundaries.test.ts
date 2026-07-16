import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireReleasedModuleRequest: vi.fn(),
  queryDetailReport: vi.fn(),
  queryProjectById: vi.fn(),
}));

vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: mocks.requireReleasedModuleRequest,
}));
vi.mock("@/lib/cong-no-vt/balance-report-service", () => ({
  queryDetailReport: mocks.queryDetailReport,
}));
vi.mock("@/lib/master-data/project-query", () => ({
  queryProjectById: mocks.queryProjectById,
}));

import { getMaterialDetailReport } from "@/lib/cong-no-vt/material-detail-report-service";
import { getLaborDetailReport } from "@/lib/cong-no-nc/balance-report-service";
import { getProjectById } from "@/lib/master-data/project-service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireReleasedModuleRequest.mockResolvedValue({ userId: "user-1", role: "admin" });
  mocks.queryDetailReport.mockResolvedValue({ rows: [], subtotals: [], periodEnd: null });
  mocks.queryProjectById.mockResolvedValue({ id: 7 });
});

describe("module service trust boundaries", () => {
  it("hard-codes the material module and ledger despite forged runtime input", async () => {
    await getMaterialDetailReport({ showZero: false, ledgerType: "labor" } as never);

    expect(mocks.requireReleasedModuleRequest).toHaveBeenCalledWith("cong-no-vt");
    expect(mocks.queryDetailReport).toHaveBeenCalledWith({
      showZero: false,
      ledgerType: "material",
    });
  });

  it("hard-codes the labor module and ledger despite forged runtime input", async () => {
    await getLaborDetailReport({ showZero: false, ledgerType: "material" } as never);

    expect(mocks.requireReleasedModuleRequest).toHaveBeenCalledWith("cong-no-nc");
    expect(mocks.queryDetailReport).toHaveBeenCalledWith({
      showZero: false,
      ledgerType: "labor",
    });
  });

  it("does not accept a caller-selected master-data authorization module", async () => {
    await (getProjectById as (...args: unknown[]) => Promise<unknown>)(7, "du-an");
    expect(mocks.requireReleasedModuleRequest).toHaveBeenCalledWith("master-data");
    expect(mocks.queryProjectById).toHaveBeenCalledWith(7);
  });
});
