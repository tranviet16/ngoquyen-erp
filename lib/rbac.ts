/**
 * `admin` is the one role with a hardcoded meaning: it short-circuits every
 * access check (canAccess D1, requireRoleModuleAccess). All other roles are
 * dynamic — defined in the `roles` table and resolved via lib/acl/role-permissions.
 */
export function isAdmin(userRole: string | null | undefined): boolean {
  return userRole === "admin";
}
