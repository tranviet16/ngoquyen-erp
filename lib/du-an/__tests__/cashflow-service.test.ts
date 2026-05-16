import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  project3WayCashflow: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: mockAuth } }));

import {
  getCashflowSummary,
  createCashflow,
  softDeleteCashflow,
} from "@/lib/du-an/cashflow-service";

beforeEach(() => vi.resetAllMocks());

describe("getCashflowSummary", () => {
  it("buckets amounts by flow direction and totals them", async () => {
    mockDb.project3WayCashflow.findMany.mockResolvedValue([
      { flowDirection: "cdt_to_cty", amountVnd: 1000 },
      { flowDirection: "cty_to_doi", amountVnd: 400 },
      { flowDirection: "doi_refund", amountVnd: 100 },
    ]);
    const s = await getCashflowSummary(1);
    expect(s.cdtToCty).toBe(1000);
    expect(s.ctyToDoi).toBe(400);
    expect(s.doiRefund).toBe(100);
    expect(s.total).toBe(1500);
  });

  it("returns all-zero buckets for a project with no cashflows", async () => {
    mockDb.project3WayCashflow.findMany.mockResolvedValue([]);
    expect(await getCashflowSummary(1)).toEqual({
      cdtToCty: 0,
      ctyToDoi: 0,
      doiToCty: 0,
      ctyToCdt: 0,
      doiRefund: 0,
      total: 0,
    });
  });
});

describe("createCashflow RBAC", () => {
  it("rejects a viewer with a Forbidden error", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "viewer" } });
    await expect(
      createCashflow({ projectId: 1 } as never),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("softDeleteCashflow RBAC", () => {
  it("rejects a non-admin (ketoan) role", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "ketoan" } });
    await expect(softDeleteCashflow(5, 1)).rejects.toThrow(/Forbidden/);
  });
});
