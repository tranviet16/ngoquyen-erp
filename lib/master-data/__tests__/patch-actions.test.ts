/**
 * Unit tests for inline-edit patch actions across all master-data resources.
 * Covers: whitelist rejection, Zod validation, RBAC, and happy-path update.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

// ─── Hoisted mocks ─────────────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  entity: { update: vi.fn(), findFirst: vi.fn() },
  supplier: { update: vi.fn() },
  contractor: { update: vi.fn() },
  item: { update: vi.fn() },
  project: { update: vi.fn(), findFirst: vi.fn() },
  // Đổi Chủ thể chạy trong transaction: khoá dòng công trình bằng SELECT … FOR UPDATE ($queryRaw).
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  loanContract: { update: vi.fn() },
  rolePermission: { findMany: vi.fn() },
  // Dữ liệu công nợ vật tư của công trình — quyết định có được đổi Chủ thể hay không.
  ledgerTransaction: { count: vi.fn() },
  supplierDeliveryDaily: { count: vi.fn() },
  ledgerOpeningBalance: { count: vi.fn() },
  supplierReconciliation: { count: vi.fn() },
}));
const mockAuth = vi.hoisted(() => ({ getSession: vi.fn() }));
const mockAvailability = vi.hoisted(() => ({
  requireReleasedModuleRequest: vi.fn(),
  isModuleReleased: vi.fn(),
}));
const mockRequireActiveAdmin = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: () => mockRequireActiveAdmin(),
}));

import {
  patchEntity,
} from "@/lib/master-data/entity-service";
import {
  patchSupplier,
} from "@/lib/master-data/supplier-service";
import {
  patchContractor,
} from "@/lib/master-data/contractor-service";
import {
  patchItem,
} from "@/lib/master-data/item-service";
import {
  patchProject,
  patchDuAn,
  patchProjectEntity,
  patchProjectAction,
  updateProjectAction,
  createProjectAction,
} from "@/lib/master-data/project-service";
import { Prisma } from "@prisma/client";

// loan-service has a slightly different getRole() name — same pattern
import {
  patchLoan,
} from "@/lib/tai-chinh/loan-service";
import { rolePermissionFindMany } from "@/lib/acl/__tests__/_role-permission-fixture";

beforeEach(() => {
  vi.resetAllMocks();
  mockAvailability.requireReleasedModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mockAvailability.isModuleReleased.mockResolvedValue(true);
  mockDb.rolePermission.findMany.mockImplementation(rolePermissionFindMany);
  mockRequireActiveAdmin.mockResolvedValue("admin-1");
  // Default: admin session — master-data/tai-chinh are admin-only modules,
  // so happy-path/whitelist/Zod tests need a role that clears the RBAC gate.
  // The explicit "rejects viewer role" tests override this per-test.
  mockAuth.getSession.mockResolvedValue({ user: { role: "admin" } });
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  // Dự án đang sửa còn tồn tại; không dự án nào khác giữ mã mới (lookup có `id: { not }`).
  mockDb.project.findFirst.mockImplementation(async ({ where }: { where: { id?: unknown } }) =>
    typeof where.id === "number" ? { id: where.id } : null,
  );
});

// ─── patchEntity ────────────────────────────────────────────────────────────
describe("patchEntity", () => {
  it("rejects a field outside whitelist", async () => {
    await expect(patchEntity(1, { type: "person" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects empty name (Zod)", async () => {
    await expect(patchEntity(1, { name: "" })).rejects.toThrow();
  });

  it("rejects inactive admin", async () => {
    mockRequireActiveAdmin.mockRejectedValue(new Error("inactive admin"));
    await expect(patchEntity(1, { name: "Công ty A" })).rejects.toThrow(/inactive admin/);
  });

  it("happy path: updates and returns row", async () => {
    const row = { id: 1, name: "Công ty A", note: null };
    mockDb.entity.update.mockResolvedValue(row);
    const result = await patchEntity(1, { name: "Công ty A" });
    expect(result).toEqual(row);
    expect(mockDb.entity.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: "Công ty A" },
    });
  });

  it("allows patching note to null", async () => {
    mockDb.entity.update.mockResolvedValue({ id: 1, name: "X", note: null });
    await patchEntity(1, { note: null });
    expect(mockDb.entity.update.mock.calls[0][0].data).toEqual({ note: null });
  });
});

// ─── patchSupplier ──────────────────────────────────────────────────────────
describe("patchSupplier", () => {
  it("rejects field outside whitelist", async () => {
    await expect(patchSupplier(1, { deletedAt: new Date() })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects empty name", async () => {
    await expect(patchSupplier(1, { name: "" })).rejects.toThrow();
  });

  it("happy path: updates name + taxCode", async () => {
    const row = { id: 1, name: "NCC A", taxCode: "123" };
    mockDb.supplier.update.mockResolvedValue(row);
    const result = await patchSupplier(1, { name: "NCC A", taxCode: "123" });
    expect(result).toEqual(row);
  });
});

// ─── patchContractor ────────────────────────────────────────────────────────
describe("patchContractor", () => {
  it("rejects field outside whitelist", async () => {
    await expect(patchContractor(1, { createdAt: new Date() })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects empty name", async () => {
    await expect(patchContractor(1, { name: "" })).rejects.toThrow();
  });

  it("happy path: updates leader", async () => {
    const row = { id: 1, name: "Đội A", leader: "Nguyễn Văn A" };
    mockDb.contractor.update.mockResolvedValue(row);
    const result = await patchContractor(1, { leader: "Nguyễn Văn A" });
    expect(result).toEqual(row);
  });
});

// ─── patchItem ──────────────────────────────────────────────────────────────
describe("patchItem", () => {
  it("rejects field outside whitelist", async () => {
    await expect(patchItem(1, { type: "machine" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects empty code", async () => {
    await expect(patchItem(1, { code: "" })).rejects.toThrow();
  });

  it("rejects empty unit", async () => {
    await expect(patchItem(1, { unit: "" })).rejects.toThrow();
  });

  it("happy path: updates name and unit", async () => {
    const row = { id: 1, code: "M01", name: "Thép", unit: "kg" };
    mockDb.item.update.mockResolvedValue(row);
    const result = await patchItem(1, { name: "Thép", unit: "kg" });
    expect(result).toEqual(row);
  });
});

// ─── patchProject ───────────────────────────────────────────────────────────
describe("patchProject", () => {
  it("rejects field outside whitelist (contractValue)", async () => {
    await expect(patchProject(1, { contractValue: "500000" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects startDate (business date, not in whitelist)", async () => {
    await expect(patchProject(1, { startDate: "2024-01-01" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects empty code", async () => {
    await expect(patchProject(1, { code: "" })).rejects.toThrow();
  });

  it("rejects invalid status enum", async () => {
    await expect(patchProject(1, { status: "archived" })).rejects.toThrow();
  });

  it("happy path: updates status", async () => {
    const row = { id: 1, code: "DA01", name: "Dự án A", status: "completed" };
    mockDb.project.update.mockResolvedValue(row);
    const result = await patchProject(1, { status: "completed" });
    expect(result).toEqual(row);
  });

  it("happy path: updates name and code", async () => {
    const row = { id: 2, code: "DA02", name: "Dự án mới", status: "active" };
    mockDb.project.update.mockResolvedValue(row);
    const result = await patchProject(2, { code: "DA02", name: "Dự án mới" });
    expect(result).toEqual(row);
  });

  it("trims code and name and checks the new code against other active projects", async () => {
    mockDb.project.update.mockResolvedValue({ id: 2 });
    await patchProject(2, { code: "  DA02 ", name: " Dự án mới  " });
    expect(mockDb.project.findFirst).toHaveBeenCalledWith({
      where: { code: "DA02", deletedAt: null, id: { not: 2 } },
      select: { name: true },
    });
    expect(mockDb.project.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { code: "DA02", name: "Dự án mới" } });
  });

  it("rejects a code already used by another active project, naming that project", async () => {
    mockDb.project.findFirst.mockImplementation(async ({ where }: { where: { id?: unknown } }) =>
      typeof where.id === "number" ? { id: where.id } : { name: "Trại Chuối" },
    );
    await expect(patchProject(2, { code: "TC" })).rejects.toThrow(/Mã dự án "TC" đã được dùng cho dự án "Trại Chuối"/);
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("rejects editing a soft-deleted project", async () => {
    mockDb.project.findFirst.mockResolvedValue(null);
    await expect(patchProject(2, { name: "X" })).rejects.toThrow(/Dự án #2 không tồn tại hoặc đã bị xoá/);
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });
});

// ─── Kết quả trả về thay vì ném (form Sửa / Thêm dự án, sửa nhanh ô) ────────────
describe("project edit result actions", () => {
  const formInput = {
    code: "TC", name: "Trại Chuối", ownerInvestor: "", contractValue: "1500000",
    startDate: "2026-01-05", endDate: "", status: "active" as const,
  };

  it("updateProjectAction keeps the fields the form sends (contract value, dates)", async () => {
    mockDb.project.update.mockResolvedValue({ id: 1 });
    await expect(updateProjectAction(1, formInput)).resolves.toEqual({ ok: true });
    const { data } = mockDb.project.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.contractValue).toBe("1500000");
    expect(data.startDate).toEqual(new Date("2026-01-05"));
    expect(data.endDate).toBeNull();
    expect(data.ownerInvestor).toBeNull();
  });

  it("returns the duplicate-code reason instead of throwing", async () => {
    mockDb.project.findFirst.mockImplementation(async ({ where }: { where: { id?: unknown } }) =>
      typeof where.id === "number" ? { id: where.id } : { name: "Tân Lộc CDC" },
    );
    const result = await updateProjectAction(1, formInput);
    expect(result).toEqual({ ok: false, message: 'Mã dự án "TC" đã được dùng cho dự án "Tân Lộc CDC"' });
    const created = await createProjectAction(formInput);
    expect(created.ok).toBe(false);
  });

  it("maps a unique-index race (P2002) to a readable message and rethrows other DB errors", async () => {
    mockDb.project.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    await expect(patchProjectAction(1, { code: "TC" })).resolves.toEqual({
      ok: false,
      message: "Mã dự án đã được dùng cho dự án khác",
    });

    class DbError extends Error {}
    mockDb.project.update.mockRejectedValue(new DbError("connection reset"));
    await expect(patchProjectAction(1, { name: "X" })).rejects.toThrow(/connection reset/);
  });

  it("returns validation messages (empty name) as a result", async () => {
    const result = await patchProjectAction(1, { name: "   " });
    expect(result).toEqual({ ok: false, message: "Tên không được để trống" });
  });
});

// ─── patchProject: Chủ thể (entityId) ───────────────────────────────────────
describe("patchProject entityId", () => {
  function materialUsage(counts: { ledger?: number; deliveries?: number; openings?: number; recons?: number }) {
    mockDb.ledgerTransaction.count.mockResolvedValue(counts.ledger ?? 0);
    mockDb.supplierDeliveryDaily.count.mockResolvedValue(counts.deliveries ?? 0);
    mockDb.ledgerOpeningBalance.count.mockResolvedValue(counts.openings ?? 0);
    mockDb.supplierReconciliation.count.mockResolvedValue(counts.recons ?? 0);
  }

  /** Dòng công trình đọc dưới khoá FOR UPDATE (null = không tồn tại / đã xoá). */
  function lockedProject(row: { entityId: number | null } | null) {
    mockDb.$queryRaw.mockResolvedValue(row ? [row] : []);
  }

  beforeEach(() => {
    mockDb.entity.findFirst.mockResolvedValue({ id: 3 });
  });

  it("locks the project row FOR UPDATE inside the transaction before checking and updating", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({});
    mockDb.project.update.mockResolvedValue({ id: 1, entityId: 3 });

    await patchProject(1, { entityId: 3 });

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockDb.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/FROM projects WHERE id = \? AND "deletedAt" IS NULL FOR UPDATE/);
    expect(values).toEqual([1]);
    expect(mockDb.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockDb.project.update.mock.invocationCallOrder[0],
    );
  });

  it("patching other fields does not open a transaction", async () => {
    mockDb.project.update.mockResolvedValue({ id: 1, status: "paused" });
    await patchProject(1, { status: "paused" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("first assignment from NULL is allowed when existing material rows carry the same entity (or none)", async () => {
    lockedProject({ entityId: null });
    materialUsage({ deliveries: 5 }); // phiếu không mang Chủ thể; sổ / số dư mang Chủ thể khác = 0
    mockDb.project.update.mockResolvedValue({ id: 1, entityId: 3 });

    await patchProject(1, { entityId: 3 });

    expect(mockDb.project.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { entityId: 3 } });
    // Chỉ đếm dòng sổ / số dư vật tư của công trình mang Chủ thể KHÁC Chủ thể sẽ gán.
    expect(mockDb.ledgerTransaction.count).toHaveBeenCalledWith({
      where: { ledgerType: "material", projectId: 1, entityId: { not: 3 }, deletedAt: null },
    });
    expect(mockDb.ledgerOpeningBalance.count).toHaveBeenCalledWith({
      where: { ledgerType: "material", projectId: 1, entityId: { not: 3 } },
    });
    expect(mockDb.supplierDeliveryDaily.count).not.toHaveBeenCalled();
  });

  it("rejects the first assignment when material rows of the project carry a different entity", async () => {
    lockedProject({ entityId: null });
    materialUsage({ ledger: 2, openings: 1 });

    await expect(patchProject(1, { entityId: 3 })).rejects.toThrow(
      /Không thể gán Chủ thể #3.*2 dòng sổ vật tư, 1 số dư ban đầu vật tư mang Chủ thể khác/,
    );
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown or deleted project", async () => {
    lockedProject(null);
    await expect(patchProject(1, { entityId: 3 })).rejects.toThrow(/Dự án #1 không tồn tại/);
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("keeping the same entity is a no-op that skips the usage check", async () => {
    lockedProject({ entityId: 3 });
    mockDb.project.update.mockResolvedValue({ id: 1, entityId: 3 });

    await patchProject(1, { entityId: 3 });

    expect(mockDb.ledgerTransaction.count).not.toHaveBeenCalled();
    expect(mockDb.project.update).toHaveBeenCalled();
  });

  it("rejects changing the entity when the project has deliveries / reconciliations", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({ deliveries: 4, recons: 1 });

    await expect(patchProject(1, { entityId: 3 })).rejects.toThrow(/Không thể đổi Chủ thể.*4 phiếu.*1 kỳ đối chiếu/);
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("rejects changing the entity when only material ledger rows or opening balances exist", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({ openings: 1 });
    await expect(patchProject(1, { entityId: 3 })).rejects.toThrow(/số dư ban đầu vật tư/);

    materialUsage({ ledger: 7 });
    await expect(patchProject(1, { entityId: 3 })).rejects.toThrow(/7 dòng sổ vật tư/);
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("rejects clearing the entity (→ null) when material data exists", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({ ledger: 1 });
    await expect(patchProject(1, { entityId: null })).rejects.toThrow(/Không thể đổi Chủ thể/);
  });

  it("allows changing the entity while the project has no material data", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({});
    mockDb.project.update.mockResolvedValue({ id: 1, entityId: 3 });

    await patchProject(1, { entityId: 3 });

    expect(mockDb.project.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { entityId: 3 } });
    // Chỉ đếm dữ liệu vật tư chưa xoá của đúng công trình.
    expect(mockDb.supplierDeliveryDaily.count).toHaveBeenCalledWith({ where: { projectId: 1, deletedAt: null } });
    expect(mockDb.ledgerTransaction.count).toHaveBeenCalledWith({
      where: { ledgerType: "material", projectId: 1, deletedAt: null },
    });
  });

  it("rejects an unknown or deleted entity", async () => {
    lockedProject({ entityId: null });
    mockDb.entity.findFirst.mockResolvedValue(null);
    await expect(patchProject(1, { entityId: 9 })).rejects.toThrow(/Chủ thể #9 không tồn tại/);
  });

  it("rejects a non-integer entityId (Zod)", async () => {
    await expect(patchProject(1, { entityId: "abc" })).rejects.toThrow();
    await expect(patchProject(1, { entityId: 0 })).rejects.toThrow();
    expect(mockDb.project.update).not.toHaveBeenCalled();
  });

  it("patchProjectEntity returns the refusal reason instead of throwing", async () => {
    lockedProject({ entityId: 2 });
    materialUsage({ deliveries: 1 });

    const result = await patchProjectEntity(1, 3);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/Không thể đổi Chủ thể/);
  });

  it("patchProjectEntity returns ok on success and rethrows non-business errors", async () => {
    lockedProject({ entityId: null });
    materialUsage({});
    mockDb.project.update.mockResolvedValue({ id: 1, entityId: 3 });
    await expect(patchProjectEntity(1, 3)).resolves.toEqual({ ok: true });

    class DbError extends Error {}
    mockDb.project.update.mockRejectedValue(new DbError("connection reset"));
    await expect(patchProjectEntity(1, 3)).rejects.toThrow(/connection reset/);
  });
});

// ─── patchDuAn (alias of patchProject) ─────────────────────────────────────
describe("patchDuAn", () => {
  it("delegates to patchProject correctly", async () => {
    const row = { id: 5, code: "DA05", name: "Dự án 5", status: "paused" };
    mockDb.project.update.mockResolvedValue(row);
    const result = await patchDuAn(5, { status: "paused" });
    expect(result).toEqual(row);
    expect(mockDb.project.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { status: "paused" },
    });
  });

  it("rejects disallowed fields just like patchProject", async () => {
    await expect(patchDuAn(5, { endDate: "2025-12-31" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });
});

// ─── patchLoan ──────────────────────────────────────────────────────────────
describe("patchLoan", () => {
  it("rejects principalVnd (Decimal amount — form only)", async () => {
    await expect(patchLoan(1, { principalVnd: "1000000" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects interestRatePct", async () => {
    await expect(patchLoan(1, { interestRatePct: "0.08" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects startDate", async () => {
    await expect(patchLoan(1, { startDate: "2024-01-01" })).rejects.toThrow(
      /không được phép inline edit/,
    );
  });

  it("rejects invalid status enum", async () => {
    await expect(patchLoan(1, { status: "overdue" })).rejects.toThrow();
  });

  it("rejects empty lenderName", async () => {
    await expect(patchLoan(1, { lenderName: "" })).rejects.toThrow();
  });

  it("happy path: updates status to paid_off", async () => {
    const row = { id: 1, lenderName: "Ngân hàng A", status: "paid_off" };
    mockDb.loanContract.update.mockResolvedValue(row);
    const result = await patchLoan(1, { status: "paid_off" });
    expect(result).toEqual(row);
    expect(mockDb.loanContract.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "paid_off" },
    });
  });

  it("happy path: updates note", async () => {
    const row = { id: 2, lenderName: "NH B", note: "Ghi chú mới", status: "active" };
    mockDb.loanContract.update.mockResolvedValue(row);
    const result = await patchLoan(2, { note: "Ghi chú mới" });
    expect(result).toEqual(row);
  });

  it("rejects inactive admin", async () => {
    mockRequireActiveAdmin.mockRejectedValue(new Error("inactive admin"));
    await expect(patchLoan(1, { status: "active" })).rejects.toThrow(/inactive admin/);
  });
});
