import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  userDeptAccess: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  hasDeptAccess,
  assertDeptAccess,
  getDeptAccessMap,
  listViewableDeptIds,
  type DeptAccessMap,
} from "@/lib/dept-access";

beforeEach(() => vi.resetAllMocks());

describe("hasDeptAccess (pure)", () => {
  it("scope 'all' grants every level on every department", () => {
    const map: DeptAccessMap = { scope: "all", grants: new Map() };
    expect(hasDeptAccess(map, 1, "edit")).toBe(true);
    expect(hasDeptAccess(map, 999, "read")).toBe(true);
  });

  it("scoped access compares against the level order read < comment < edit", () => {
    const map: DeptAccessMap = { scope: "scoped", grants: new Map([[7, "comment"]]) };
    expect(hasDeptAccess(map, 7, "read")).toBe(true);
    expect(hasDeptAccess(map, 7, "comment")).toBe(true);
    expect(hasDeptAccess(map, 7, "edit")).toBe(false);
  });

  it("returns false for a department with no grant", () => {
    const map: DeptAccessMap = { scope: "scoped", grants: new Map() };
    expect(hasDeptAccess(map, 7, "read")).toBe(false);
  });
});

describe("assertDeptAccess", () => {
  it("does not throw when access is sufficient", () => {
    const map: DeptAccessMap = { scope: "all", grants: new Map() };
    expect(() => assertDeptAccess(map, 1, "edit")).not.toThrow();
  });
  it("throws a Vietnamese error when access is insufficient", () => {
    const map: DeptAccessMap = { scope: "scoped", grants: new Map() };
    expect(() => assertDeptAccess(map, 1, "edit")).toThrow("chỉnh sửa");
  });
});

describe("getDeptAccessMap", () => {
  it("returns scope 'all' for an admin", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "admin", isDirector: false, departmentId: 3 });
    const map = await getDeptAccessMap("u1");
    expect(map.scope).toBe("all");
  });

  it("returns scope 'all' for a director", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "viewer", isDirector: true, departmentId: 3 });
    expect((await getDeptAccessMap("u1")).scope).toBe("all");
  });

  it("gives edit on the home department and merges the highest explicit grant", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "viewer", isDirector: false, departmentId: 3 });
    mockDb.userDeptAccess.findMany.mockResolvedValue([
      { deptId: 5, level: "read" },
      { deptId: 5, level: "comment" },
      { deptId: 9, level: "bogus" },
    ]);
    const map = await getDeptAccessMap("u1");
    expect(map.scope).toBe("scoped");
    expect(map.grants.get(3)).toBe("edit");
    expect(map.grants.get(5)).toBe("comment");
    expect(map.grants.has(9)).toBe(false);
  });

  it("returns an empty scoped map when the user is missing", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const map = await getDeptAccessMap("ghost");
    expect(map).toEqual({ scope: "scoped", grants: new Map() });
  });
});

describe("listViewableDeptIds", () => {
  it("returns 'all' for an admin", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "admin", isDirector: false, departmentId: null });
    expect(await listViewableDeptIds("u1")).toBe("all");
  });
  it("returns the granted department ids for a scoped user", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "viewer", isDirector: false, departmentId: 2 });
    mockDb.userDeptAccess.findMany.mockResolvedValue([{ deptId: 8, level: "read" }]);
    const ids = await listViewableDeptIds("u1");
    expect(Array.isArray(ids) ? [...ids].sort() : ids).toEqual([2, 8]);
  });
});
