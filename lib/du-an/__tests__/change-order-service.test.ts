import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getSession: vi.fn(),
  requireReleasedModuleRequest: vi.fn(),
  requireActiveAdmin: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectChangeOrder: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: mocks.requireReleasedModuleRequest,
}));
vi.mock("@/lib/admin/require-active-admin", () => ({ requireActiveAdmin: mocks.requireActiveAdmin }));

import { adminPatchChangeOrder } from "@/lib/du-an/change-order-service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { role: "admin" } });
  mocks.requireReleasedModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mocks.requireActiveAdmin.mockResolvedValue("admin-1");
  mocks.findUnique.mockResolvedValue({ projectId: 7 });
  mocks.update.mockResolvedValue({ id: 10 });
});

describe("adminPatchChangeOrder", () => {
  it("drops forged fields from the Prisma update payload", async () => {
    await adminPatchChangeOrder(
      10,
      { description: "Hợp lệ", projectId: 99, deletedAt: new Date() } as never,
      7,
    );

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 10, projectId: 7 },
      data: { description: "Hợp lệ" },
    });
  });
});
