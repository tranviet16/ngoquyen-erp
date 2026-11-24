import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireActiveAdmin: vi.fn(),
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
  projectInvoiceLine: { findUnique: vi.fn() },
  projectActualReceipt: { findUnique: vi.fn() },
  projectCashPayment: { findUnique: vi.fn() },
  projectItemAlias: { findUnique: vi.fn() },
  projectGroupCode: { findUnique: vi.fn() },
  projectCounterparty: { findUnique: vi.fn() },
  projectCounterpartySupplier: { findUnique: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: mocks.requireActiveAdmin,
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue(undefined),
  ModuleRequestError: class ModuleRequestError extends Error {
    readonly reason: string;
    constructor(reason: string) {
      super(reason === "forbidden" ? "Forbidden" : reason);
      this.reason = reason;
    }
  },
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
    projectInvoiceLine: mocks.projectInvoiceLine,
    projectActualReceipt: mocks.projectActualReceipt,
    projectCashPayment: mocks.projectCashPayment,
    projectItemAlias: mocks.projectItemAlias,
    projectGroupCode: mocks.projectGroupCode,
    projectCounterparty: mocks.projectCounterparty,
    projectCounterpartySupplier: mocks.projectCounterpartySupplier,
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
import { ModuleRequestError, requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { createInvoiceLine, updateInvoiceLine } from "@/lib/du-an/dt-hd-tt/invoice-service";
import { createReceipt, softDeleteReceipt } from "@/lib/du-an/dt-hd-tt/receipt-service";
import { softDeletePayment } from "@/lib/du-an/dt-hd-tt/payment-service";
import { confirmAliases, createAlias, updateAlias } from "@/lib/du-an/dt-hd-tt/alias-service";
import { createGroupCode, softDeleteGroupCode } from "@/lib/du-an/dt-hd-tt/group-code-service";
import { createCounterpartySupplier, updateCounterparty, updateCounterpartySupplier } from "@/lib/du-an/dt-hd-tt/counterparty-service";

const LEVEL = { read: 10, comment: 20, create: 30, edit: 40 } as const;
const NO_PERMISSION = { ok: false, message: "Bạn không có quyền thao tác này trên công trình." };

/** Người dùng có đúng cấp `granted` trên dự án: yêu cầu cao hơn bị từ chối như guard thật. */
function grantProjectLevel(granted: keyof typeof LEVEL) {
  vi.mocked(requireReleasedModuleRequest).mockImplementation(async (...args) => {
    const access = args[1];
    if (!access || LEVEL[access.minLevel] > LEVEL[granted]) throw new ModuleRequestError("forbidden");
    return { userId: "u-1", role: "viewer" };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "admin-1", role: "admin" },
  });
  mocks.requireActiveAdmin.mockResolvedValue("admin-1");
  mocks.writeAuditLog.mockResolvedValue(undefined);
  mocks.role.findUnique.mockResolvedValue(null);
  mocks.role.create.mockResolvedValue({ id: "ke-toan" });
  mocks.rolePermission.createMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (operations: unknown[]) => operations);
});

describe("P0 role-permission action contract", () => {
  it("denies an unauthenticated role mutation before database access", async () => {
    mocks.requireActiveAdmin.mockRejectedValueOnce(new Error("Session expired"));

    await expect(createRole({
      id: "ke-toan",
      name: "Kế toán",
      permissions: [],
    })).rejects.toThrow("Session expired");

    expect(mocks.role.create).not.toHaveBeenCalled();
  });

  it("enforces active-admin access and writes the permission audit", async () => {
    await createRole({
      id: "ke-toan",
      name: "Kế toán",
      permissions: [{ moduleKey: "du-an", level: "create" }],
    });

    expect(mocks.requireActiveAdmin).toHaveBeenCalled();
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
  it("denies an override when the active-admin guard rejects", async () => {
    mocks.requireActiveAdmin.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(updateFinancePrLineOverride(7, null)).rejects.toThrow("Forbidden");
    expect(mocks.financePrLine.update).not.toHaveBeenCalled();
  });

  it("enforces active admin access and audits destructive row recovery", async () => {
    mocks.payableReceivableAdjustment.updateMany.mockResolvedValue({ count: 1 });

    await expect(deleteFinancePrRows(["manual-7"])).resolves.toEqual({ deleted: 1 });

    expect(mocks.requireActiveAdmin).toHaveBeenCalled();
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

describe("P0 dt-hd-tt entry book action contract", () => {
  const invoice = { projectId: 4, supplierId: 7, invoiceNo: "0001", itemName: "Cát vàng", unit: "m3", qty: 2, unitPrice: 500_000 };
  const receipt = { projectId: 4, itemName: "Cát vàng", unit: "m3", amountVnd: 1_000_000, counterpartyId: 3 };

  it("returns a Vietnamese refusal (not a thrown error) to a read-level user before any write transaction", async () => {
    grantProjectLevel("read");
    await expect(createInvoiceLine(invoice)).resolves.toEqual(NO_PERMISSION);
    await expect(createReceipt(receipt)).resolves.toEqual(NO_PERMISSION);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("asks for create on the URL project to insert a row", async () => {
    grantProjectLevel("read");
    await createInvoiceLine(invoice);
    expect(requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "create", scope: { kind: "project", projectId: 4 } });
  });

  it("refuses edit and delete for a create-only user", async () => {
    grantProjectLevel("create");
    mocks.projectInvoiceLine.findUnique.mockResolvedValue({ projectId: 4, deletedAt: null });
    mocks.projectActualReceipt.findUnique.mockResolvedValue({ projectId: 4, deletedAt: null });
    mocks.projectCashPayment.findUnique.mockResolvedValue({ projectId: 4, deletedAt: null });

    await expect(updateInvoiceLine(11, 4, { qty: 3 })).resolves.toEqual(NO_PERMISSION);
    await expect(softDeleteReceipt(12, 4)).resolves.toEqual(NO_PERMISSION);
    await expect(softDeletePayment(13, 4)).resolves.toEqual(NO_PERMISSION);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "edit", scope: { kind: "project", projectId: 4 } });
  });

  it("binds an edit to the record's own project, not the project the client claims", async () => {
    grantProjectLevel("edit");
    mocks.projectInvoiceLine.findUnique.mockResolvedValue({ projectId: 9, deletedAt: null });

    const result = await updateInvoiceLine(11, 4, { qty: 3 });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/không còn trong công trình này/) });
    expect(requireReleasedModuleRequest).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a patch that touches a non-editable column before reading the row", async () => {
    grantProjectLevel("edit");
    const result = await updateInvoiceLine(11, 4, { projectId: 9 } as never);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/không sửa được/) });
    expect(mocks.projectInvoiceLine.findUnique).not.toHaveBeenCalled();
  });

  it("validates input before any write transaction and returns the reason", async () => {
    grantProjectLevel("edit");
    const missingCounterparty = await createReceipt({ ...receipt, counterpartyId: undefined as unknown as number });
    expect(missingCounterparty.ok).toBe(false);
    await expect(createInvoiceLine({ ...invoice, qty: null })).resolves.toEqual({ ok: false, message: "Nhập thành tiền, hoặc nhập đủ SL và đơn giá" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("P0 dt-hd-tt mapping and register action contract", () => {
  const alias = { projectId: 4, source: "hd" as const, itemKey: "cat vang|m3", status: "de_xuat" as const };
  const live = { projectId: 4, deletedAt: null };

  it("returns a refusal to a read-level user before any write transaction", async () => {
    grantProjectLevel("read");
    await expect(createAlias(alias)).resolves.toEqual(NO_PERMISSION);
    await expect(createGroupCode({ projectId: 4, code: "COC", name: "Cọc" })).resolves.toEqual(NO_PERMISSION);
    await expect(createCounterpartySupplier({ projectId: 4, supplierId: 7 })).resolves.toEqual(NO_PERMISSION);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "create", scope: { kind: "project", projectId: 4 } });
  });

  it("needs edit to change, delete, bulk-confirm or type the HĐ-TT figures", async () => {
    grantProjectLevel("create");
    mocks.projectItemAlias.findUnique.mockResolvedValue(live);
    mocks.projectGroupCode.findUnique.mockResolvedValue(live);
    mocks.projectCounterpartySupplier.findUnique.mockResolvedValue(live);

    await expect(updateAlias(11, 4, { status: "xac_nhan" })).resolves.toEqual(NO_PERMISSION);
    await expect(softDeleteGroupCode(12, 4)).resolves.toEqual(NO_PERMISSION);
    await expect(updateCounterpartySupplier(13, 4, { paidOverrideVnd: 1_000_000 })).resolves.toEqual(NO_PERMISSION);
    await expect(confirmAliases(4, [11])).resolves.toEqual(NO_PERMISSION);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "edit", scope: { kind: "project", projectId: 4 } });
  });

  it("binds an edit to the record's own project", async () => {
    grantProjectLevel("edit");
    mocks.projectCounterparty.findUnique.mockResolvedValue({ projectId: 9, deletedAt: null });

    const result = await updateCounterparty(5, 4, { actualBasis: "receipts" });
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/không còn trong công trình này/) });
    expect(requireReleasedModuleRequest).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a patch on a non-editable field before reading the row", async () => {
    grantProjectLevel("edit");
    await expect(updateAlias(11, 4, { source: "tt" } as never)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/không sửa được/) });
    await expect(updateCounterpartySupplier(13, 4, { supplierId: 8 } as never)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/không sửa được/) });
    expect(mocks.projectItemAlias.findUnique).not.toHaveBeenCalled();
    expect(mocks.projectCounterpartySupplier.findUnique).not.toHaveBeenCalled();
  });

  it("validates input before any write transaction and returns the reason", async () => {
    grantProjectLevel("edit");
    await expect(createGroupCode({ projectId: 4, code: " ", name: "Cọc" })).resolves.toEqual({ ok: false, message: "Mã nhóm không được để trống" });
    await expect(createAlias({ ...alias, status: "ok" as never })).resolves.toEqual({ ok: false, message: "Trạng thái ánh xạ không hợp lệ" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
