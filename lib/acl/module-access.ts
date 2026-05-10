/**
 * Module-level access loader.
 * Uses React cache() for per-request memoization (RSC / Server Actions).
 * Single Prisma query per loader invocation (no N+1).
 */

import { cache } from "react";
import { prisma } from "../prisma";
import { type AppRole } from "../rbac";
import { type ModuleKey, type AccessLevel, ACCESS_LEVELS } from "./modules";
import { getDefaultModuleLevel } from "./role-defaults";
import { loadUser } from "./_user";

function isAccessLevel(s: string): s is AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(s);
}

/**
 * Loads all explicit ModulePermission rows for a user.
 * Returns Map<ModuleKey, AccessLevel> — only contains validated rows.
 * Memoized per request via React cache().
 */
export const getModuleAccessMap = cache(
  async (userId: string): Promise<Map<ModuleKey, AccessLevel>> => {
    const rows = await prisma.modulePermission.findMany({
      where: { userId },
      select: { moduleKey: true, level: true },
    });

    const map = new Map<ModuleKey, AccessLevel>();
    for (const row of rows) {
      if (!isAccessLevel(row.level)) continue;
      // moduleKey stored as string in DB — cast after runtime validation
      map.set(row.moduleKey as ModuleKey, row.level);
    }
    return map;
  },
);

/**
 * Returns the effective access level for a user on a given module.
 * Priority: explicit ModulePermission row > role fallback > null.
 *
 * Reuses the cache()-memoized loadUser from effective.ts — at most one
 * prisma.user.findUnique per request per userId across all ACL callers.
 */
export async function getEffectiveModuleLevel(
  userId: string,
  moduleKey: ModuleKey,
): Promise<AccessLevel | null> {
  // Shared cache with canAccess — no extra DB round-trip when called together
  const user = await loadUser(userId);
  if (!user) return null;

  // Check explicit permission row first
  const map = await getModuleAccessMap(userId);
  const explicit = map.get(moduleKey);
  if (explicit !== undefined) return explicit;

  // Fall back to role default
  return getDefaultModuleLevel(user.role as AppRole, moduleKey);
}
