/**
 * Unified ACL entry point.
 * Implements the locked check flow (D1 admin short-circuit → Trục 1 → Trục 2).
 * All async loaders are React cache()-memoized for per-request dedup.
 */

import { LEVEL_RANK, MODULE_AXIS, type AccessLevel, type ModuleKey } from "./modules";
import { getEffectiveModuleLevel } from "./module-access";
import {
  getProjectAccessMap,
  hasProjectAccess,
  type ProjectAccessMap,
} from "./project-access";
import { getDeptAccessMap, hasDeptAccess } from "../dept-access";
import { loadUser, type UserRecord } from "./_user";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanAccessOpts =
  | { minLevel: AccessLevel; scope: "module" }
  | { minLevel: AccessLevel; scope: "any" }
  | { minLevel: AccessLevel; scope: { kind: "dept"; deptId: number } }
  | { minLevel: AccessLevel; scope: { kind: "project"; projectId: number } }
  | { minLevel: AccessLevel; scope: { kind: "role"; roleScope?: "self" | "dept" | "all" } };

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Re-export for consumers that only need the user loader
export { loadUser };

/**
 * D5 role-axis check.
 * - self: any authenticated user (always true here — Trục 1 already validated module access)
 * - dept: leaders or directors (admin already short-circuited)
 * - all: directors only (admin already short-circuited)
 */
export function checkRoleAxis(
  user: UserRecord,
  scope: "self" | "dept" | "all",
): boolean {
  if (scope === "self") return true;
  if (scope === "dept") return user.isLeader || user.isDirector;
  if (scope === "all") return user.isDirector;
  return false;
}

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Checks whether userId has access to moduleKey at the given opts.
 *
 * Flow:
 *   1. D1: admin role → always true (hard short-circuit)
 *   2. Trục 1: effective module level check (explicit row || role fallback)
 *   3. Trục 2: axis-specific check based on scope
 */
export async function canAccess(
  userId: string,
  moduleKey: ModuleKey,
  opts: CanAccessOpts,
): Promise<boolean> {
  const user = await loadUser(userId);

  // D1: admin short-circuit — must be before null check to avoid false negatives
  if (user?.role === "admin") return true;
  if (!user) return false;

  // Trục 1: module-level gate
  const moduleLevel = await getEffectiveModuleLevel(userId, moduleKey);
  if (moduleLevel === null) return false;
  if (LEVEL_RANK[moduleLevel] < LEVEL_RANK[opts.minLevel]) return false;

  // Scope === "module": Trục 1 only (sidebar rendering, module visibility)
  if (opts.scope === "module") return true;

  // Scope === "any": Trục 1 already passed; caller asserts they handle resource
  // filtering (Trục 2) separately. Return true unconditionally for all axis types —
  // the comment "caller filters resources elsewhere" means this scope is valid for
  // dept/project axes too (e.g. listing pages that filter by access map post-query).
  if (opts.scope === "any") return true;

  // Trục 2: axis-specific check
  const axis = MODULE_AXIS[moduleKey];
  const scope = opts.scope;

  switch (axis) {
    case "open":
      return true;

    case "admin-only":
      // Already handled by D1 admin short-circuit; non-admin cannot reach here with access
      return false;

    case "dept": {
      if (typeof scope !== "object" || scope.kind !== "dept") return false;
      const deptMap = await getDeptAccessMap(userId);
      return hasDeptAccess(deptMap, scope.deptId, opts.minLevel as "read" | "comment" | "edit");
    }

    case "project": {
      if (typeof scope !== "object" || scope.kind !== "project") return false;
      const projMap: ProjectAccessMap = await getProjectAccessMap(userId);
      return hasProjectAccess(projMap, scope.projectId, opts.minLevel);
    }

    case "role": {
      if (typeof scope !== "object" || scope.kind !== "role") return false;
      const roleScope = scope.roleScope ?? "self";
      return checkRoleAxis(user, roleScope);
    }

    default:
      return false;
  }
}

/**
 * Throws an error if canAccess returns false.
 */
export async function assertAccess(
  userId: string,
  moduleKey: ModuleKey,
  opts: CanAccessOpts,
  msg?: string,
): Promise<void> {
  const allowed = await canAccess(userId, moduleKey, opts);
  if (!allowed) {
    throw new Error(msg ?? `Forbidden: insufficient access to module "${moduleKey}"`);
  }
}

// ─── Project list helper ──────────────────────────────────────────────────────

export type ViewableProjectIds =
  | { kind: "all" }
  | { kind: "subset"; ids: number[] }
  | { kind: "none" };

/**
 * Returns the set of project IDs a user can view, used for du-an list filtering.
 * Caller pattern:
 *   const v = await getViewableProjectIds(userId);
 *   if (v.kind === "none") return [];
 *   const projects = await prisma.project.findMany({
 *     where: v.kind === "subset" ? { id: { in: v.ids } } : {},
 *   });
 */
export async function getViewableProjectIds(
  userId: string,
): Promise<ViewableProjectIds> {
  const user = await loadUser(userId);
  if (!user) return { kind: "none" };

  // D1: admin sees all projects
  if (user.role === "admin") return { kind: "all" };

  // Trục 1: user must have module-level access to "du-an"
  const moduleLevel = await getEffectiveModuleLevel(userId, "du-an");
  if (moduleLevel === null) return { kind: "none" };

  const projMap = await getProjectAccessMap(userId);

  // grantAll with no per-project overrides = truly all projects
  if (projMap.all !== null && projMap.perProject.size === 0) {
    return { kind: "all" };
  }

  // grantAll present but with per-project overrides:
  // D3: perProject rows can shadow grantAll (any level). For list filtering, return "all"
  // since per-project access level checks happen at row-click (canAccess with project scope).
  if (projMap.all !== null) {
    return { kind: "all" };
  }

  // No grantAll — only explicit perProject rows grant access
  const ids = Array.from(projMap.perProject.keys());
  if (ids.length === 0) return { kind: "none" };
  return { kind: "subset", ids };
}
