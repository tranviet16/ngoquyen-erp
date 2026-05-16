/**
 * Security regression tests for `assertAccess` denial paths across the three
 * Trục-2 axes (admin-only, dept, project). A failure here means a privilege
 * boundary regressed — treat as a production bug, never relax the assertion.
 *
 * Strategy mirrors lib/acl/__tests__/effective.test.ts: prisma is mocked per
 * model so each axis's loader can be driven independently; React cache() is a
 * passthrough.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react", () => ({
  cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
}));

const userFindUnique = vi.fn();
const modulePermFindMany = vi.fn();
const projectPermFindMany = vi.fn();
const grantAllFindUnique = vi.fn();
const deptAccessFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    modulePermission: { findMany: (...a: unknown[]) => modulePermFindMany(...a) },
    projectPermission: { findMany: (...a: unknown[]) => projectPermFindMany(...a) },
    projectGrantAll: { findUnique: (...a: unknown[]) => grantAllFindUnique(...a) },
    userDeptAccess: { findMany: (...a: unknown[]) => deptAccessFindMany(...a) },
  },
}));

import { canAccess, assertAccess } from "@/lib/acl/effective";

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible empty defaults — each test overrides only what it needs.
  modulePermFindMany.mockResolvedValue([]);
  projectPermFindMany.mockResolvedValue([]);
  grantAllFindUnique.mockResolvedValue(null);
  deptAccessFindMany.mockResolvedValue([]);
});

describe("ACL denial — admin-only axis", () => {
  it("viewer is denied an admin-only module (no role fallback)", async () => {
    userFindUnique.mockResolvedValue({
      id: "v1", role: "viewer", isLeader: false, isDirector: false,
    });
    const allowed = await canAccess("v1", "admin.permissions", {
      minLevel: "read", scope: "module",
    });
    expect(allowed).toBe(false);
    await expect(
      assertAccess("v1", "admin.permissions", { minLevel: "read", scope: "module" }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("ACL denial — dept axis", () => {
  it("a user with module access but no dept grant is denied that department", async () => {
    // canbo_vt has an "edit" role fallback on cong-no-vt, so Trục 1 passes;
    // Trục 2 (dept) must still deny — no userDeptAccess row.
    userFindUnique.mockResolvedValue({
      id: "c1", role: "canbo_vt", isLeader: false, isDirector: false,
    });
    const allowed = await canAccess("c1", "cong-no-vt", {
      minLevel: "read", scope: { kind: "dept", deptId: 42 },
    });
    expect(allowed).toBe(false);
  });
});

describe("ACL denial — project axis", () => {
  it("a user without grantAll and without a perProject row is denied an out-of-scope project", async () => {
    // Explicit module row lets Trục 1 pass; project axis must deny.
    userFindUnique.mockResolvedValue({
      id: "p1", role: "viewer", isLeader: false, isDirector: false,
    });
    modulePermFindMany.mockResolvedValue([{ moduleKey: "du-an", level: "edit" }]);
    const allowed = await canAccess("p1", "du-an", {
      minLevel: "read", scope: { kind: "project", projectId: 999 },
    });
    expect(allowed).toBe(false);
  });
});

describe("ACL — unknown user is always denied", () => {
  it("canAccess returns false when the user record does not exist", async () => {
    userFindUnique.mockResolvedValue(null);
    const allowed = await canAccess("ghost", "dashboard", {
      minLevel: "read", scope: "module",
    });
    expect(allowed).toBe(false);
  });
});
