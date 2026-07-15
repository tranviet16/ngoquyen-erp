/**
 * Default module access level for a role, resolved from the dynamic
 * RolePermission table (DB-driven, no hardcoded matrix).
 *
 * Always prefer an explicit per-user ModulePermission row over this fallback.
 *
 * Note: the `admin` role is short-circuited at canAccess() (D1), so this
 * returns null for admin — it should never be relied on for admin users.
 */

import { type ModuleKey, type AccessLevel } from "./modules";
import { getRolePermissionMap } from "./role-permissions";

/**
 * Returns the role's seeded AccessLevel for a module, or null if the role
 * has no permission row for that module.
 */
export async function getDefaultModuleLevel(
  role: string,
  moduleKey: ModuleKey,
): Promise<AccessLevel | null> {
  if (role === "admin") return null; // D1 short-circuit at canAccess handles admin
  const map = await getRolePermissionMap(role);
  return map.get(moduleKey) ?? null;
}
