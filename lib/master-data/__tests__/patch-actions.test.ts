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
  entity: { update: vi.fn() },
  supplier: { update: vi.fn() },
  contractor: { update: vi.fn() },
  item: { update: vi.fn() },
  project: { update: vi.fn() },
  loanContract: { update: vi.fn() },
  rolePermission: { findMany: vi.fn() },
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
} from "@/lib/master-data/project-service";

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
