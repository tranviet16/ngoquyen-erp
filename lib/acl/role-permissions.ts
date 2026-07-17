/**
 * Dynamic-role permission loader + role-based write guards.
 *
 * RolePermission rows define, per role, the access level for each module.
 * Absence of a row = no access (fail-closed). The `admin` role is always
 * allowed regardless of its rows (mirrors the canAccess D1 short-circuit).
 */

import { cache } from "react";
import { prisma } from "../prisma";
import {
  LEVEL_RANK,
  ACCESS_LEVELS,
  type ModuleKey,
  type AccessLevel,
} from "./modules";
import { isModuleReleased } from "./module-availability";

function isAccessLevel(s: string): s is AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(s);
}

/**
 * Loads all RolePermission rows for a role into a Map.
 * Memoized per request via React cache() — one query per role per request.
 * Unknown role id → empty map (fail-closed).
 */
export const getRolePermissionMap = cache(
  async (roleId: string): Promise<Map<ModuleKey, AccessLevel>> => {
    const rows = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { moduleKey: true, level: true },
    });
    const map = new Map<ModuleKey, AccessLevel>();
    for (const row of rows) {
      if (!isAccessLevel(row.level)) continue;
      map.set(row.moduleKey as ModuleKey, row.level);
    }
    return map;
  },
);

/**
 * Effective access level of a role on a module.
 * The admin role has no business-level row; boolean access handles its bypass.
 */
export async function getRoleModuleLevel(
  roleId: string,
  moduleKey: ModuleKey,
): Promise<AccessLevel | null> {
  if (roleId === "admin") return null;
  const map = await getRolePermissionMap(roleId);
  return map.get(moduleKey) ?? null;
}

/**
 * True if `role` has at least `minLevel` access on `moduleKey`.
 * admin → always true. null/undefined/unknown role → false.
 */
export async function hasRoleModuleAccess(
  role: string | null | undefined,
  moduleKey: ModuleKey,
  minLevel: AccessLevel,
): Promise<boolean> {
  if (!role) return false;
  if (!(await isModuleReleased(moduleKey))) return false;
  if (role === "admin") return true;
  const level = await getRoleModuleLevel(role, moduleKey);
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

/**
 * Throws "Forbidden: ..." if `role` lacks `minLevel` access on `moduleKey`.
 * Use as a server-action / service write guard. admin always passes.
 */
export async function requireRoleModuleAccess(
  role: string | null | undefined,
  moduleKey: ModuleKey,
  minLevel: AccessLevel,
): Promise<void> {
  const ok = await hasRoleModuleAccess(role, moduleKey, minLevel);
  if (!ok) {
    throw new Error(`Forbidden: requires ${minLevel} access on ${moduleKey}`);
  }
}
