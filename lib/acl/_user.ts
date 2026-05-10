/**
 * Shared, cache()-memoized user loader for the ACL subsystem.
 * Placed in a separate file to break the circular import between
 * effective.ts (imports module-access.ts) and module-access.ts.
 *
 * At most ONE prisma.user.findUnique per request per userId across all
 * ACL callers (canAccess, getEffectiveModuleLevel, getViewableProjectIds).
 */

import { cache } from "react";
import { prisma } from "../prisma";

export interface UserRecord {
  id: string;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
}

export const loadUser = cache(async (userId: string): Promise<UserRecord | null> => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isLeader: true, isDirector: true },
  });
});
