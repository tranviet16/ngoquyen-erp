import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireAccess: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  role: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  rolePermission: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: { count: vi.fn() },
  financePrLine: {
    update: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  financePrSyncBatch: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  financeSyncExclusion: { create: vi.fn() },
  payableReceivableAdjustment: { updateMany: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl/role-permissions", () => ({
  requireRoleModuleAccess: mocks.requireAccess,
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/async-context", () => ({
  bypassAudit: vi.fn(async (callback: () => unknown) => callback()),
}));
vi.mock("@/lib/sl-dt/report-service", () => ({ getChiTieuReport: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    role: mocks.role,
    rolePermission: mocks.rolePermission,
    user: mocks.user,
    financePrLine: mocks.financePrLine,
    financePrSyncBatch: mocks.financePrSyncBatch,
    financeSyncExclusion: mocks.financeSyncExclusion,
    payableReceivableAdjustment: mocks.payableReceivableAdjustment,
    $transaction: mocks.transaction,
  },
}));

import {
  createRole,
  deleteRole,
} from "@/app/(app)/admin/permissions/roles/actions";
import {
  deleteFinancePrRows,
  undoLatestFinancePrSync,
  updateFinancePrLineOverride,
} from "@/lib/tai-chinh/pr-sync-service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "admin-1", role: "admin" },
  });
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.writeAuditLog.mockResolvedValue(undefined);
  mocks.role.findUnique.mockResolvedValue(null);
  mocks.role.create.mockResolvedValue({ id: "ke-toan" });
  mocks.rolePermission.createMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (operations: unknown[]) => operations);
});

describe("P0 role-permission action contract", () => {
  it("denies an unauthenticated role mutation before database access", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(createRole({
      id: "ke-toan",
      name: "Kế toán",
      permissions: [],
    })).rejects.toThrow(/Phiên đăng nhập/);

    expect(mocks.role.create).not.toHaveBeenCalled();
  });

  it("enforces the admin.permissions scope and writes the permission audit", async () => {
    await createRole({
      id: "ke-toan",
      name: "Kế toán",
      permissions: [{ moduleKey: "tai-chinh", level: "admin" }],
    });

    expect(mocks.requireAccess).toHaveBeenCalledWith(
      "admin",
      "admin.permissions",
      "admin",
    );
    expect(mocks.role.create).toHaveBeenCalled();
    expect(mocks.rolePermission.createMany).toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      tableName: "role_permissions",
      recordId: "ke-toan",
      action: "create",
      userId: "admin-1",
    }));
  });

  it("keeps an assigned role recoverable by blocking deletion", async () => {
    mocks.role.findUnique.mockResolvedValue({ id: "ke-toan" });
    mocks.user.count.mockResolvedValue(2);

    await expect(deleteRole("ke-toan")).rejects.toThrow(/2 người dùng/);
    expect(mocks.role.delete).not.toHaveBeenCalled();
  });
});

describe("P0 finance payable/receivable action contract", () => {
  it("denies an override when the finance edit guard rejects", async () => {
    mocks.requireAccess.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(updateFinancePrLineOverride(7, null)).rejects.toThrow("Forbidden");
    expect(mocks.financePrLine.update).not.toHaveBeenCalled();
  });

  it("enforces finance admin scope and audits destructive row recovery", async () => {
    mocks.payableReceivableAdjustment.updateMany.mockResolvedValue({ count: 1 });

    await expect(deleteFinancePrRows(["manual-7"])).resolves.toEqual({ deleted: 1 });

    expect(mocks.requireAccess).toHaveBeenCalledWith("admin", "tai-chinh", "admin");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      tableName: "finance_pr_lines",
      action: "delete_pr_rows",
      userId: "admin-1",
    }));
  });

  it("fails closed when no completed sync batch is available to undo", async () => {
    mocks.financePrSyncBatch.findFirst.mockResolvedValue(null);

    await expect(undoLatestFinancePrSync("receivable")).rejects.toThrow(
      /Không có batch sync/,
    );
    expect(mocks.financePrLine.deleteMany).not.toHaveBeenCalled();
  });
});
