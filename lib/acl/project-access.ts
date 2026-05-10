/**
 * Project-level access loader.
 * Uses React cache() for per-request memoization (RSC / Server Actions).
 * Single Prisma query per loader invocation — fetches both perProject rows
 * and grantAll row in one batch.
 */

import { cache } from "react";
import { prisma } from "../prisma";
import { type AccessLevel, ACCESS_LEVELS, LEVEL_RANK } from "./modules";

function isAccessLevel(s: string): s is AccessLevel {
  return (ACCESS_LEVELS as readonly string[]).includes(s);
}

export interface ProjectAccessMap {
  /** Level from ProjectGrantAll row — null if none exists. */
  all: AccessLevel | null;
  /** Explicit per-project overrides keyed by projectId. */
  perProject: Map<number, AccessLevel>;
}

/**
 * Loads the project access map for a user in a single compound query.
 * Returns both grantAll level and per-project override map.
 * Memoized per request via React cache().
 */
export const getProjectAccessMap = cache(
  async (userId: string): Promise<ProjectAccessMap> => {
    // Single round-trip: fetch grantAll + all perProject rows together
    const [grantAllRow, perProjectRows] = await Promise.all([
      prisma.projectGrantAll.findUnique({
        where: { userId },
        select: { level: true },
      }),
      prisma.projectPermission.findMany({
        where: { userId },
        select: { projectId: true, level: true },
      }),
    ]);

    const all: AccessLevel | null =
      grantAllRow && isAccessLevel(grantAllRow.level) ? grantAllRow.level : null;

    const perProject = new Map<number, AccessLevel>();
    for (const row of perProjectRows) {
      if (!isAccessLevel(row.level)) continue;
      perProject.set(row.projectId, row.level);
    }

    return { all, perProject };
  },
);

/**
 * Checks if the project access map grants at least minLevel for a given project.
 * D3 rule: perProject row OVERRIDES grantAll, even if the perProject level is lower.
 */
export function hasProjectAccess(
  map: ProjectAccessMap,
  projectId: number,
  minLevel: AccessLevel,
): boolean {
  const perRow = map.perProject.get(projectId);
  // D3: perProject row overrides grantAll — use perRow if present, else fall back to grantAll
  const effective = perRow !== undefined ? perRow : map.all;
  if (effective === null) return false;
  return LEVEL_RANK[effective] >= LEVEL_RANK[minLevel];
}
