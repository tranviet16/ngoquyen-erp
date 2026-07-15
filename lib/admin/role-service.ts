import { prisma } from "@/lib/prisma";
import type { ModuleKey, AccessLevel } from "@/lib/acl/modules";

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  moduleCount: number;
  userCount: number;
}

export interface RolePermissionEntry {
  moduleKey: ModuleKey;
  level: AccessLevel;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  permissions: RolePermissionEntry[];
}

/**
 * List all roles with their module-permission count and the number of users
 * currently assigned to each role.
 */
export async function listRoles(): Promise<RoleSummary[]> {
  const [roles, userGroups] = await Promise.all([
    prisma.role.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { permissions: true } },
      },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);

  const userCountByRole = new Map<string, number>();
  for (const g of userGroups) {
    if (g.role) userCountByRole.set(g.role, g._count._all);
  }

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    moduleCount: r._count.permissions,
    userCount: userCountByRole.get(r.id) ?? 0,
  }));
}

/** Fetch a single role together with its full module-permission list. */
export async function getRoleWithPermissions(
  id: string,
): Promise<RoleWithPermissions | null> {
  const role = await prisma.role.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      permissions: { select: { moduleKey: true, level: true } },
    },
  });
  if (!role) return null;
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions.map((p) => ({
      moduleKey: p.moduleKey as ModuleKey,
      level: p.level as AccessLevel,
    })),
  };
}
