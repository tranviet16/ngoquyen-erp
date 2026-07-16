import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActiveAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  bypassAudit: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  assertModuleReleased: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: mocks.requireActiveAdmin,
}));
vi.mock("@/lib/async-context", () => ({ bypassAudit: mocks.bypassAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/acl", () => ({
  assertModuleReleased: mocks.assertModuleReleased,
}));

import { updateModuleAvailability } from "@/app/(app)/admin/permissions/modules/availability-actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActiveAdmin.mockResolvedValue("admin-1");
  mocks.assertModuleReleased.mockResolvedValue(undefined);
  mocks.bypassAudit.mockImplementation(async (callback: () => unknown) => callback());
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      moduleAvailability: { findMany: mocks.findMany, update: mocks.update },
      auditLog: { create: mocks.auditCreate },
    }),
  );
  mocks.update.mockResolvedValue(undefined);
  mocks.auditCreate.mockResolvedValue(undefined);
});

describe("module availability action", () => {
  it("requires an active administrator before validating or writing", async () => {
    mocks.requireActiveAdmin.mockRejectedValue(new Error("Chỉ admin được thao tác"));

    await expect(
      updateModuleAvailability([{ moduleKey: "du-an", status: "development", previousStatus: "ready" }]),
    ).rejects.toThrow("Chỉ admin");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires the protected permissions module to be released", async () => {
    mocks.assertModuleReleased.mockRejectedValue(new Error("Module is in development"));

    await expect(
      updateModuleAvailability([{ moduleKey: "du-an", status: "development", previousStatus: "ready" }]),
    ).rejects.toThrow("development");

    expect(mocks.assertModuleReleased).toHaveBeenCalledWith("admin.permissions");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["dashboard", "admin.permissions"])(
    "rejects protected module %s",
    async (moduleKey) => {
      await expect(
        updateModuleAvailability([{ moduleKey, status: "development", previousStatus: "ready" }]),
      ).rejects.toThrow(/module cốt lõi|module cot loi/);

      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown status and module values", async () => {
    await expect(
      updateModuleAvailability([{ moduleKey: "du-an", status: "hidden", previousStatus: "ready" }]),
    ).rejects.toThrow(/Trạng thái|Trang thai/);
    await expect(
      updateModuleAvailability([{ moduleKey: "unknown", status: "ready", previousStatus: "ready" }]),
    ).rejects.toThrow(/Module/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("reads before-state then updates and audits in one interactive transaction", async () => {
    mocks.findMany.mockResolvedValue([{ moduleKey: "du-an", status: "ready" }]);

    await expect(
      updateModuleAvailability([{ moduleKey: "du-an", status: "development", previousStatus: "ready" }]),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.bypassAudit).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { moduleKey: "du-an" },
      data: { status: "development" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-1",
        tableName: "module_availability",
        recordId: "du-an",
        action: "update",
        beforeJson: { status: "ready" },
        afterJson: { status: "development" },
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/permissions/modules");
  });

  it("does not write or audit an unchanged status", async () => {
    mocks.findMany.mockResolvedValue([{ moduleKey: "du-an", status: "ready" }]);

    await expect(
      updateModuleAvailability([{ moduleKey: "du-an", status: "ready", previousStatus: "ready" }]),
    ).resolves.toEqual({ updated: 0 });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("does not revalidate when the atomic audit write fails", async () => {
    mocks.findMany.mockResolvedValue([{ moduleKey: "du-an", status: "ready" }]);
    mocks.auditCreate.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      updateModuleAvailability([
        { moduleKey: "du-an", status: "development", previousStatus: "ready" },
      ]),
    ).rejects.toThrow("audit unavailable");

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("retries one serialization conflict", async () => {
    mocks.findMany.mockResolvedValue([{ moduleKey: "du-an", status: "ready" }]);
    mocks.transaction.mockRejectedValueOnce({ code: "P2034" });

    await expect(
      updateModuleAvailability([
        { moduleKey: "du-an", status: "development", previousStatus: "ready" },
      ]),
    ).resolves.toEqual({ updated: 1 });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale admin baseline before update or audit", async () => {
    mocks.findMany.mockResolvedValue([{ moduleKey: "du-an", status: "development" }]);

    await expect(
      updateModuleAvailability([
        { moduleKey: "du-an", status: "development", previousStatus: "ready" },
      ]),
    ).rejects.toThrow(/đã thay đổi|da thay doi/);

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
