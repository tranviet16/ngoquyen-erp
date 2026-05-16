/**
 * Unit tests for ACL effective resolver (canAccess, assertAccess,
 * getViewableProjectIds, checkRoleAxis).
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
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();

vi.mock("../../prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    modulePermission: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    projectPermission: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    projectGrantAll: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    userDeptAccess: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import {
  canAccess,
  assertAccess,
  checkRoleAxis,
  getViewableProjectIds,
} from "../effective";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockUser = {
  id: string;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
  departmentId?: number | null;
};

function setupUser(user: MockUser) {
  mockFindUnique.mockImplementation((args: { where: { id?: string; userId?: string } }) => {
    if ("id" in args.where && args.where.id === user.id) {
      return Promise.resolve(user);
    }
    // For projectGrantAll — by default return null
    return Promise.resolve(null);
  });
}

function setupModulePermissions(rows: Array<{ moduleKey: string; level: string }>) {
  // modulePermission.findMany
  mockFindMany.mockImplementation(
    (args: { where: { userId?: string; deptId?: number } }) => {
      if (args.where?.userId !== undefined && !("deptId" in args.where)) {
        // Check if it's a project permission query or module permission query
        // We differentiate by checking what fields are in the mock call
        return Promise.resolve(rows);
      }
      return Promise.resolve([]);
    },
  );
}

function setupProjectPermissions(
  grantAll: { level: string } | null,
  perProject: Array<{ projectId: number; level: string }>,
  modulePermRows: Array<{ moduleKey: string; level: string }> = [],
) {
  mockFindUnique.mockImplementation(
    (args: { where: { id?: string; userId?: string } }) => {
      if ("userId" in args.where) {
        // projectGrantAll lookup
        return Promise.resolve(grantAll);
      }
      // user lookup — return null (caller should set up user separately)
      return Promise.resolve(null);
    },
  );
  mockFindMany.mockImplementation(
    (args: { where: { userId?: string } }) => {
      if (args.where?.userId) {
        // Could be projectPermission or modulePermission or userDeptAccess
        // Return perProject rows for projectPermission, modulePermRows for others
        if (perProject.length > 0) {
          // Heuristic: if the rows have projectId field, assume project
          return Promise.resolve([...perProject, ...modulePermRows]);
        }
        return Promise.resolve(modulePermRows);
      }
      return Promise.resolve([]);
    },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkRoleAxis", () => {
  const baseUser = { id: "u1", role: "viewer", isLeader: false, isDirector: false };

  it("scope=self always returns true", () => {
    expect(checkRoleAxis(baseUser, "self")).toBe(true);
  });

  it("scope=dept returns true when isLeader=true", () => {
    expect(checkRoleAxis({ ...baseUser, isLeader: true }, "dept")).toBe(true);
  });

  it("scope=dept returns true when isDirector=true", () => {
    expect(checkRoleAxis({ ...baseUser, isDirector: true }, "dept")).toBe(true);
  });

  it("scope=dept returns false when neither leader nor director", () => {
    expect(checkRoleAxis(baseUser, "dept")).toBe(false);
  });

  it("scope=all returns true when isDirector=true", () => {
    expect(checkRoleAxis({ ...baseUser, isDirector: true }, "all")).toBe(true);
  });

  it("scope=all returns false when only isLeader=true", () => {
    expect(checkRoleAxis({ ...baseUser, isLeader: true }, "all")).toBe(false);
  });

  it("scope=all returns false for plain viewer", () => {
    expect(checkRoleAxis(baseUser, "all")).toBe(false);
  });
});

// ─── D1: Admin short-circuit ──────────────────────────────────────────────────

describe("canAccess — admin short-circuit (D1)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindUnique.mockResolvedValue({
      id: "admin1",
      role: "admin",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]);
  });

  it("admin can access any module at any level — module scope", async () => {
    const result = await canAccess("admin1", "admin.permissions", {
      minLevel: "admin",
      scope: "module",
    });
    expect(result).toBe(true);
  });

  it("admin can access du-an at edit with project scope", async () => {
    const result = await canAccess("admin1", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 99 },
    });
    expect(result).toBe(true);
  });

  it("admin can access dashboard at read with module scope", async () => {
    const result = await canAccess("admin1", "dashboard", {
      minLevel: "read",
      scope: "module",
    });
    expect(result).toBe(true);
  });
});

// ─── Trục 1 + project axis ────────────────────────────────────────────────────

describe("canAccess — project axis (Trục 1 + Trục 2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("user with ModulePermission(du-an, edit) + ProjectPermission(P1, edit) can access P1 at edit", async () => {
    // Set up user
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u1",
            role: "viewer",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        // projectGrantAll — none
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockImplementation(
      (args: { where: { userId?: string } }) => {
        const uid = args.where?.userId;
        if (!uid) return Promise.resolve([]);
        // Return both module permission and project permission rows
        // The loaders call findMany with where: { userId }
        // modulePermission returns moduleKey/level, projectPermission returns projectId/level
        return Promise.resolve([
          { moduleKey: "du-an", level: "edit" },
          { projectId: 1, level: "edit" },
        ]);
      },
    );

    const result = await canAccess("u1", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 1 },
    });
    expect(result).toBe(true);
  });

  it("user with du-an access + ProjectPermission(P1, edit) cannot access P2 (no row)", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u1",
            role: "viewer",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        return Promise.resolve(null); // no grantAll
      },
    );
    mockFindMany.mockResolvedValue([
      { moduleKey: "du-an", level: "edit" },
      { projectId: 1, level: "edit" },
    ]);

    const result = await canAccess("u1", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 2 },
    });
    expect(result).toBe(false);
  });

  it("ProjectGrantAll(read) + no perProject → can read any project", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u2",
            role: "ketoan",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        // projectGrantAll
        return Promise.resolve({ level: "read" });
      },
    );
    mockFindMany.mockResolvedValue([]); // no module perms, no per-project perms

    const result = await canAccess("u2", "du-an", {
      minLevel: "read",
      scope: { kind: "project", projectId: 999 },
    });
    expect(result).toBe(true);
  });

  it("ProjectGrantAll(read) — cannot access at edit level", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u2",
            role: "ketoan",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        return Promise.resolve({ level: "read" });
      },
    );
    mockFindMany.mockResolvedValue([]);

    const result = await canAccess("u2", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 999 },
    });
    expect(result).toBe(false);
  });
});

// ─── D3: perProject overrides grantAll ────────────────────────────────────────

describe("canAccess — D3 perProject overrides grantAll", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Setup: ketoan user, du-an module fallback edit, grantAll=edit, P5=read override.
   */
  function setupD3User() {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u3",
            role: "ketoan",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        // projectGrantAll = edit
        return Promise.resolve({ level: "edit" });
      },
    );
    mockFindMany.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (!args.where?.userId) return Promise.resolve([]);
        // projectPermission: P5=read override
        return Promise.resolve([{ projectId: 5, level: "read" }]);
      },
    );
  }

  it("D3: ProjectGrantAll(edit) + ProjectPermission(P5, read) → canAccess(P5, edit) = false", async () => {
    setupD3User();
    const result = await canAccess("u3", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 5 },
    });
    expect(result).toBe(false);
  });

  it("D3: same user → canAccess(P5, read) = true (perRow read satisfies read)", async () => {
    setupD3User();
    const result = await canAccess("u3", "du-an", {
      minLevel: "read",
      scope: { kind: "project", projectId: 5 },
    });
    expect(result).toBe(true);
  });

  it("D3: same user → canAccess(P6, edit) = true (no override on P6, grantAll edit wins)", async () => {
    setupD3User();
    const result = await canAccess("u3", "du-an", {
      minLevel: "edit",
      scope: { kind: "project", projectId: 6 },
    });
    expect(result).toBe(true);
  });
});

// ─── Fallback defaults ────────────────────────────────────────────────────────

describe("canAccess — role fallback defaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("viewer without explicit row → canAccess(dashboard, read, module) = true", async () => {
    mockFindUnique.mockResolvedValue({
      id: "v1",
      role: "viewer",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]); // no explicit rows

    const result = await canAccess("v1", "dashboard", {
      minLevel: "read",
      scope: "module",
    });
    expect(result).toBe(true);
  });

  it("viewer without explicit row → canAccess(admin.nguoi-dung, read, module) = false", async () => {
    mockFindUnique.mockResolvedValue({
      id: "v1",
      role: "viewer",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]);

    const result = await canAccess("v1", "admin.nguoi-dung", {
      minLevel: "read",
      scope: "module",
    });
    expect(result).toBe(false);
  });

  it("viewer with scope=module on du-an — Trục 1 only (viewer has no du-an fallback → false)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "v1",
      role: "viewer",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]);

    // viewer has no fallback for du-an, so Trục 1 fails → false
    const result = await canAccess("v1", "du-an", {
      minLevel: "read",
      scope: "module",
    });
    expect(result).toBe(false);
  });
});

// ─── Dept axis ────────────────────────────────────────────────────────────────

describe("canAccess — dept axis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("UserDeptAccess(D1, comment) → canAccess(cong-no-vt, comment, dept:D1) = true", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u4",
            role: "canbo_vt",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (!args.where?.userId) return Promise.resolve([]);
        // Return both module permission (canbo_vt fallback covers cong-no-vt)
        // and dept access row
        return Promise.resolve([{ deptId: 1, level: "comment" }]);
      },
    );

    const result = await canAccess("u4", "cong-no-vt", {
      minLevel: "comment",
      scope: { kind: "dept", deptId: 1 },
    });
    expect(result).toBe(true);
  });

  it("UserDeptAccess(D1, comment) → canAccess(cong-no-vt, edit, dept:D1) = false", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u4",
            role: "canbo_vt",
            isLeader: false,
            isDirector: false,
            departmentId: null,
          });
        }
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockImplementation(
      (args: { where: { userId?: string } }) => {
        if (!args.where?.userId) return Promise.resolve([]);
        return Promise.resolve([{ deptId: 1, level: "comment" }]);
      },
    );

    const result = await canAccess("u4", "cong-no-vt", {
      minLevel: "edit",
      scope: { kind: "dept", deptId: 1 },
    });
    expect(result).toBe(false);
  });
});

// ─── Role axis ────────────────────────────────────────────────────────────────

describe("canAccess — role axis (van-hanh.hieu-suat)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function setupRoleAxisUser(isLeader: boolean, isDirector: boolean) {
    mockFindUnique.mockResolvedValue({
      id: "u5",
      role: "viewer",
      isLeader,
      isDirector,
      departmentId: null,
    });
    mockFindMany.mockResolvedValue([
      { moduleKey: "van-hanh.hieu-suat", level: "read" },
    ]);
  }

  it("viewer isLeader=true → checkRoleAxis(dept) = true", () => {
    const user = { id: "u5", role: "viewer", isLeader: true, isDirector: false };
    expect(checkRoleAxis(user, "dept")).toBe(true);
  });

  it("viewer isLeader=false → checkRoleAxis(dept) = false", () => {
    const user = { id: "u5", role: "viewer", isLeader: false, isDirector: false };
    expect(checkRoleAxis(user, "dept")).toBe(false);
  });

  it("viewer isDirector=true → checkRoleAxis(all) = true", () => {
    const user = { id: "u5", role: "viewer", isLeader: false, isDirector: true };
    expect(checkRoleAxis(user, "all")).toBe(true);
  });

  it("viewer isLeader=true only → checkRoleAxis(all) = false", () => {
    const user = { id: "u5", role: "viewer", isLeader: true, isDirector: false };
    expect(checkRoleAxis(user, "all")).toBe(false);
  });

  it("canAccess(van-hanh.hieu-suat, role:self) = true for any user with module access", async () => {
    setupRoleAxisUser(false, false);
    const result = await canAccess("u5", "van-hanh.hieu-suat", {
      minLevel: "read",
      scope: { kind: "role", roleScope: "self" },
    });
    expect(result).toBe(true);
  });

  it("canAccess(van-hanh.hieu-suat, role:dept) = true for leader", async () => {
    setupRoleAxisUser(true, false);
    const result = await canAccess("u5", "van-hanh.hieu-suat", {
      minLevel: "read",
      scope: { kind: "role", roleScope: "dept" },
    });
    expect(result).toBe(true);
  });

  it("canAccess(van-hanh.hieu-suat, role:dept) = false for non-leader", async () => {
    setupRoleAxisUser(false, false);
    const result = await canAccess("u5", "van-hanh.hieu-suat", {
      minLevel: "read",
      scope: { kind: "role", roleScope: "dept" },
    });
    expect(result).toBe(false);
  });
});

// ─── getViewableProjectIds ────────────────────────────────────────────────────

describe("getViewableProjectIds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("admin → { kind: 'all' }", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin1",
      role: "admin",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]);

    const result = await getViewableProjectIds("admin1");
    expect(result).toEqual({ kind: "all" });
  });

  it("user with ProjectGrantAll → { kind: 'all' }", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u2",
            role: "ketoan",
            isLeader: false,
            isDirector: false,
          });
        }
        return Promise.resolve({ level: "edit" }); // grantAll
      },
    );
    mockFindMany.mockResolvedValue([]); // no per-project rows

    const result = await getViewableProjectIds("u2");
    expect(result).toEqual({ kind: "all" });
  });

  it("user with only perProject rows → { kind: 'subset', ids: [...] }", async () => {
    // Tracks which findMany call this is (1st = modulePermission, 2nd = projectPermission)
    let findManyCallCount = 0;
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u3",
            role: "canbo_vt",
            isLeader: false,
            isDirector: false,
          });
        }
        return Promise.resolve(null); // no grantAll
      },
    );
    mockFindMany.mockImplementation(
      (_args: { where: { userId?: string } }) => {
        findManyCallCount++;
        if (findManyCallCount === 1) {
          // modulePermission.findMany (called by getModuleAccessMap)
          return Promise.resolve([{ moduleKey: "du-an", level: "edit" }]);
        }
        // projectPermission.findMany (called by getProjectAccessMap)
        return Promise.resolve([
          { projectId: 10, level: "edit" },
          { projectId: 20, level: "read" },
        ]);
      },
    );

    const result = await getViewableProjectIds("u3");
    expect(result.kind).toBe("subset");
    if (result.kind === "subset") {
      expect(result.ids.sort((a, b) => a - b)).toEqual([10, 20]);
    }
  });

  it("user with no module access to du-an → { kind: 'none' }", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "v1",
            role: "viewer",
            isLeader: false,
            isDirector: false,
          });
        }
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockResolvedValue([]); // viewer has no du-an fallback

    const result = await getViewableProjectIds("v1");
    expect(result).toEqual({ kind: "none" });
  });
});

// ─── assertAccess ─────────────────────────────────────────────────────────────

describe("assertAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindUnique.mockResolvedValue({
      id: "v1",
      role: "viewer",
      isLeader: false,
      isDirector: false,
    });
    mockFindMany.mockResolvedValue([]);
  });

  it("throws when access is denied", async () => {
    await expect(
      assertAccess("v1", "admin.permissions", { minLevel: "admin", scope: "module" }),
    ).rejects.toThrow("Forbidden");
  });

  it("throws with custom message", async () => {
    await expect(
      assertAccess(
        "v1",
        "admin.permissions",
        { minLevel: "admin", scope: "module" },
        "Custom error",
      ),
    ).rejects.toThrow("Custom error");
  });

  it("does not throw when access is granted (viewer → dashboard read)", async () => {
    await expect(
      assertAccess("v1", "dashboard", { minLevel: "read", scope: "module" }),
    ).resolves.toBeUndefined();
  });
});

// ─── scope: "any" semantics ───────────────────────────────────────────────────

describe("canAccess — scope: any", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * scope="any" means "Trục 1 passed; caller handles Trục 2 filtering separately."
   * canAccess must return true for ALL axis types once Trục 1 passes — including
   * dept and project axes. This was previously broken: dept/project returned false.
   */

  it("scope=any on open-axis module (dashboard) → true when Trục 1 passes", async () => {
    mockFindUnique.mockResolvedValue({
      id: "v1", role: "viewer", isLeader: false, isDirector: false,
    });
    mockFindMany.mockResolvedValue([]); // viewer has dashboard read fallback

    const result = await canAccess("v1", "dashboard", { minLevel: "read", scope: "any" });
    expect(result).toBe(true);
  });

  it("scope=any on project-axis module (du-an) → true when Trục 1 passes", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string; userId?: string } }) => {
        if ("id" in args.where) {
          return Promise.resolve({
            id: "u1", role: "viewer", isLeader: false, isDirector: false,
          });
        }
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockResolvedValue([{ moduleKey: "du-an", level: "read" }]);

    // Trục 1 passes (explicit du-an read row); scope=any → true regardless of project axis
    const result = await canAccess("u1", "du-an", { minLevel: "read", scope: "any" });
    expect(result).toBe(true);
  });

  it("scope=any on dept-axis module (cong-no-vt) → true when Trục 1 passes", async () => {
    mockFindUnique.mockResolvedValue({
      id: "u4", role: "canbo_vt", isLeader: false, isDirector: false,
    });
    // canbo_vt has role fallback for cong-no-vt; no explicit row needed
    mockFindMany.mockResolvedValue([]);

    const result = await canAccess("u4", "cong-no-vt", { minLevel: "read", scope: "any" });
    expect(result).toBe(true);
  });

  it("scope=any → false when Trục 1 fails (no module access)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "v1", role: "viewer", isLeader: false, isDirector: false,
    });
    mockFindMany.mockResolvedValue([]); // viewer has no du-an fallback

    const result = await canAccess("v1", "du-an", { minLevel: "read", scope: "any" });
    expect(result).toBe(false);
  });
});

// ─── D3 concurrency — no cross-request state leak ─────────────────────────────

describe("canAccess — D3 concurrency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Two interleaved canAccess calls with conflicting per-user mock data must
   * resolve independently. canAccess takes the userId as a parameter and the
   * resolver carries no module-level mutable state — proving no cross-talk.
   */
  it("interleaved canAccess for an admin and a viewer return independent results", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string } }) => {
        if (args.where.id === "concurrent-admin") {
          return Promise.resolve({
            id: "concurrent-admin", role: "admin", isLeader: false, isDirector: false,
          });
        }
        if (args.where.id === "concurrent-viewer") {
          return Promise.resolve({
            id: "concurrent-viewer", role: "viewer", isLeader: false, isDirector: false,
          });
        }
        return Promise.resolve(null); // grantAll lookups → none
      },
    );
    mockFindMany.mockResolvedValue([]);

    const [adminResult, viewerResult] = await Promise.all([
      canAccess("concurrent-admin", "admin.permissions", { minLevel: "admin", scope: "module" }),
      canAccess("concurrent-viewer", "admin.permissions", { minLevel: "admin", scope: "module" }),
    ]);

    expect(adminResult).toBe(true);
    expect(viewerResult).toBe(false);
  });

  it("100 interleaved calls alternating admin/viewer keep per-call correctness", async () => {
    mockFindUnique.mockImplementation(
      (args: { where: { id?: string } }) => {
        if (args.where.id === "ca") {
          return Promise.resolve({ id: "ca", role: "admin", isLeader: false, isDirector: false });
        }
        if (args.where.id === "cv") {
          return Promise.resolve({ id: "cv", role: "viewer", isLeader: false, isDirector: false });
        }
        return Promise.resolve(null);
      },
    );
    mockFindMany.mockResolvedValue([]);

    const calls = Array.from({ length: 100 }, (_, i) =>
      canAccess(i % 2 === 0 ? "ca" : "cv", "admin.permissions", {
        minLevel: "admin",
        scope: "module",
      }),
    );
    const results = await Promise.all(calls);

    results.forEach((r, i) => expect(r).toBe(i % 2 === 0));
  });
});

// ─── Axis interaction — dept axis without dept access ─────────────────────────

describe("canAccess — axis interaction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("dept-axis module: Trục 1 passes but no UserDeptAccess row → false", async () => {
    // canbo_vt has a role fallback for cong-no-vt (Trục 1 passes), but the user
    // has no dept-access grant for D7 → the dept axis must veto.
    mockFindUnique.mockResolvedValue({
      id: "u-axis", role: "canbo_vt", isLeader: false, isDirector: false, departmentId: null,
    });
    mockFindMany.mockResolvedValue([]); // no UserDeptAccess rows

    const result = await canAccess("u-axis", "cong-no-vt", {
      minLevel: "read",
      scope: { kind: "dept", deptId: 7 },
    });
    expect(result).toBe(false);
  });

  it("dept-axis module: dept access on D1 does not leak to D2", async () => {
    mockFindUnique.mockResolvedValue({
      id: "u-axis2", role: "canbo_vt", isLeader: false, isDirector: false, departmentId: null,
    });
    mockFindMany.mockImplementation((args: { where: { userId?: string } }) => {
      if (!args.where?.userId) return Promise.resolve([]);
      return Promise.resolve([{ deptId: 1, level: "edit" }]);
    });

    const onD1 = await canAccess("u-axis2", "cong-no-vt", {
      minLevel: "read",
      scope: { kind: "dept", deptId: 1 },
    });
    const onD2 = await canAccess("u-axis2", "cong-no-vt", {
      minLevel: "read",
      scope: { kind: "dept", deptId: 2 },
    });
    expect(onD1).toBe(true);
    expect(onD2).toBe(false);
  });
});
