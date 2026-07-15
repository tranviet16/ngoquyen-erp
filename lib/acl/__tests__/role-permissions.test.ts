/**
 * Unit tests for dynamic-role permission loader + write guards
 * (getRolePermissionMap, getRoleModuleLevel, hasRoleModuleAccess,
 * requireRoleModuleAccess).
 *
 * Strategy: mock prisma at module level so tests run without a real DB.
 * React cache() is mocked to be a passthrough (no memoization in tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock react cache() as identity (passthrough) ────────────────────────────
vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

// ─── Mock prisma ──────────────────────────────────────────────────────────────
const mockFindMany = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    rolePermission: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import {
  getRolePermissionMap,
  getRoleModuleLevel,
  hasRoleModuleAccess,
  requireRoleModuleAccess,
} from "../role-permissions";

// ─── Helper ───────────────────────────────────────────────────────────────────
function setupRolePermissions(
  rows: Array<{ moduleKey: string; level: string }>,
) {
  mockFindMany.mockResolvedValue(rows);
}

beforeEach(() => {
  mockFindMany.mockReset();
});

// ─── getRolePermissionMap ─────────────────────────────────────────────────────

describe("getRolePermissionMap", () => {
  it("builds a Map from RolePermission rows", async () => {
    setupRolePermissions([
      { moduleKey: "du-an", level: "edit" },
      { moduleKey: "cong-no-vt", level: "read" },
    ]);
    const map = await getRolePermissionMap("ketoan");
    expect(map.get("du-an")).toBe("edit");
    expect(map.get("cong-no-vt")).toBe("read");
    expect(map.size).toBe(2);
  });

  it("skips rows with an invalid access level (fail-closed)", async () => {
    setupRolePermissions([
      { moduleKey: "du-an", level: "edit" },
      { moduleKey: "cong-no-vt", level: "superuser" },
    ]);
    const map = await getRolePermissionMap("ketoan");
    expect(map.get("du-an")).toBe("edit");
    expect(map.has("cong-no-vt")).toBe(false);
  });

  it("returns an empty Map for an unknown role", async () => {
    setupRolePermissions([]);
    const map = await getRolePermissionMap("does-not-exist");
    expect(map.size).toBe(0);
  });
});

// ─── getRoleModuleLevel ───────────────────────────────────────────────────────

describe("getRoleModuleLevel", () => {
  it("returns 'admin' for the admin role without a DB read", async () => {
    const level = await getRoleModuleLevel("admin", "du-an");
    expect(level).toBe("admin");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns the seeded level for a non-admin role", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    expect(await getRoleModuleLevel("ketoan", "du-an")).toBe("edit");
  });

  it("returns null when the role has no row for the module", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    expect(await getRoleModuleLevel("ketoan", "tai-chinh")).toBeNull();
  });
});

// ─── hasRoleModuleAccess ──────────────────────────────────────────────────────

describe("hasRoleModuleAccess", () => {
  it("admin always passes, every module/level", async () => {
    expect(await hasRoleModuleAccess("admin", "tai-chinh", "admin")).toBe(true);
    expect(await hasRoleModuleAccess("admin", "du-an", "edit")).toBe(true);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns false for null/undefined/empty role", async () => {
    expect(await hasRoleModuleAccess(null, "du-an", "read")).toBe(false);
    expect(await hasRoleModuleAccess(undefined, "du-an", "read")).toBe(false);
    expect(await hasRoleModuleAccess("", "du-an", "read")).toBe(false);
  });

  it("passes when the role's level equals minLevel", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    expect(await hasRoleModuleAccess("ketoan", "du-an", "edit")).toBe(true);
  });

  it("passes when the role's level outranks minLevel", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "admin" }]);
    expect(await hasRoleModuleAccess("ketoan", "du-an", "edit")).toBe(true);
  });

  it("fails when the role's level is below minLevel", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "read" }]);
    expect(await hasRoleModuleAccess("ketoan", "du-an", "edit")).toBe(false);
  });

  it("fails when the role has no row for the module", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    expect(await hasRoleModuleAccess("ketoan", "tai-chinh", "read")).toBe(
      false,
    );
  });
});

// ─── requireRoleModuleAccess ──────────────────────────────────────────────────

describe("requireRoleModuleAccess", () => {
  it("resolves silently when access is granted", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    await expect(
      requireRoleModuleAccess("ketoan", "du-an", "edit"),
    ).resolves.toBeUndefined();
  });

  it("resolves for admin on any module", async () => {
    await expect(
      requireRoleModuleAccess("admin", "tai-chinh", "admin"),
    ).resolves.toBeUndefined();
  });

  it("throws Forbidden when the role lacks the module row", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "edit" }]);
    await expect(
      requireRoleModuleAccess("ketoan", "tai-chinh", "edit"),
    ).rejects.toThrow(/Forbidden/);
  });

  it("throws Forbidden when the role's level is below minLevel", async () => {
    setupRolePermissions([{ moduleKey: "du-an", level: "read" }]);
    await expect(
      requireRoleModuleAccess("ketoan", "du-an", "edit"),
    ).rejects.toThrow(/Forbidden: requires edit access on du-an/);
  });

  it("throws Forbidden for a null role", async () => {
    await expect(
      requireRoleModuleAccess(null, "du-an", "read"),
    ).rejects.toThrow(/Forbidden/);
  });
});
