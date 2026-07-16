import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const mockDb = vi.hoisted(() => ({
  projectEstimate: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  listEstimates,
  createEstimate,
  adminPatchEstimate,
  softDeleteEstimate,
} from "@/lib/du-an/estimate-service";
import { rolePermissionFindMany } from "@/lib/acl/__tests__/_role-permission-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  mockAvailability.requireReleasedModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mockAvailability.isModuleReleased.mockResolvedValue(true);
  mockDb.rolePermission.findMany.mockImplementation(rolePermissionFindMany);
  mockDb.projectEstimate.findUnique.mockResolvedValue({ projectId: 1 });
});

describe("listEstimates", () => {
  it("queries non-deleted estimates for the project", async () => {
    mockDb.projectEstimate.findMany.mockResolvedValue([{ id: 1 }]);
    expect(await listEstimates(7)).toEqual([{ id: 1 }]);
    expect(mockDb.projectEstimate.findMany.mock.calls[0][0].where).toEqual({
      projectId: 7,
      deletedAt: null,
    });
  });
});

describe("estimate-service RBAC", () => {
  it("createEstimate rejects a viewer", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "viewer" } });
    await expect(createEstimate({ projectId: 1 } as never)).rejects.toThrow(/Forbidden/);
  });

  it("adminPatchEstimate rejects a non-admin (ketoan)", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "ketoan" } });
    await expect(adminPatchEstimate(1, { qty: 5 }, 1)).rejects.toThrow(/Forbidden/);
  });

  it("softDeleteEstimate rejects a non-admin", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "ketoan" } });
    await expect(softDeleteEstimate(1, 1)).rejects.toThrow(/Forbidden/);
  });
});

describe("adminPatchEstimate", () => {
  it("only writes the provided patch fields", async () => {
    mockAuth.getSession.mockResolvedValue({ user: { role: "admin" } });
    mockDb.projectEstimate.update.mockResolvedValue({ id: 1 });
    await adminPatchEstimate(1, { itemName: "Cát mới", note: "n" }, 1);
    const data = mockDb.projectEstimate.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["itemName", "note"]);
    expect(data.itemName).toBe("Cát mới");
  });
});
