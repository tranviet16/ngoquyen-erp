import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const mockDb = vi.hoisted(() => ({
  project3WayCashflow: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  rolePermission: { findMany: vi.fn() },
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockAvailability = vi.hoisted(() => ({
  requireReleasedModuleRequest: vi.fn(),
  isModuleReleased: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: mockAuth } }));
vi.mock("@/lib/acl/module-availability", () => ({
  isModuleReleased: mockAvailability.isModuleReleased,
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: mockAvailability.requireReleasedModuleRequest,
}));

import {
  getCashflowSummary,
  createCashflow,
  updateCashflow,
  adminPatchCashflow,
  softDeleteCashflow,
} from "@/lib/du-an/cashflow-service";
import { rolePermissionFindMany } from "@/lib/acl/__tests__/_role-permission-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  mockAvailability.requireReleasedModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mockAvailability.isModuleReleased.mockResolvedValue(true);
  mockDb.rolePermission.findMany.mockImplementation(rolePermissionFindMany);
});

const cashflowInput = {
  projectId: 7,
  date: "2026-07-16",
  flowDirection: "cdt_to_cty" as const,
  category: "tam_ung" as const,
  payerName: "A",
  payeeName: "B",
  amountVnd: 100,
};

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

describe("project-scoped ACL", () => {
  it("passes the requested project and access level to the read guard", async () => {
    mockDb.project3WayCashflow.findMany.mockResolvedValue([]);
    await getCashflowSummary(7);
    expect(mockAvailability.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", {
      minLevel: "read",
      scope: { kind: "project", projectId: 7 },
    });
  });

  it("rejects a forged project id before updating a record from another project", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "admin" } });
    mockDb.project3WayCashflow.findUnique.mockResolvedValue({ projectId: 8 });

    await expect(updateCashflow(10, cashflowInput)).rejects.toThrow("Forbidden");
    expect(mockAvailability.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 7 },
    });
    expect(mockDb.project3WayCashflow.update).not.toHaveBeenCalled();
  });

  it("rejects a forged project id before deleting a record from another project", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "admin" } });
    mockDb.project3WayCashflow.findUnique.mockResolvedValue({ projectId: 8 });

    await expect(softDeleteCashflow(10, 7)).rejects.toThrow("Forbidden");
    expect(mockAvailability.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", {
      minLevel: "admin",
      scope: { kind: "project", projectId: 7 },
    });
    expect(mockDb.project3WayCashflow.update).not.toHaveBeenCalled();
  });

  it("drops forged fields from the admin patch data boundary", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "admin" } });
    mockDb.project3WayCashflow.findUnique.mockResolvedValue({ projectId: 7 });
    mockDb.project3WayCashflow.update.mockResolvedValue({ id: 10 });

    await adminPatchCashflow(
      10,
      { payerName: "Hợp lệ", projectId: 99, deletedAt: new Date() } as never,
      7,
    );

    expect(mockDb.project3WayCashflow.update).toHaveBeenCalledWith({
      where: { id: 10, projectId: 7 },
      data: { payerName: "Hợp lệ" },
    });
  });
});
