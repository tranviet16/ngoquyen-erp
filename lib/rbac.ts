export type AppRole =
  | "admin"
  | "ketoan"
  | "canbo_vt"
  | "chihuy_ct"
  | "viewer";

const ROLE_HIERARCHY: Record<AppRole, number> = {
  admin: 100,
  ketoan: 80,
  chihuy_ct: 60,
  canbo_vt: 40,
  viewer: 10,
};

export function hasRole(userRole: string | null | undefined, required: AppRole): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY[userRole as AppRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[required] ?? 0;
  return userLevel >= requiredLevel;
}

export function requireRole(userRole: string | null | undefined, required: AppRole): void {
  if (!hasRole(userRole, required)) {
    throw new Error(`Forbidden: requires role ${required}`);
  }
}

export function isAdmin(userRole: string | null | undefined): boolean {
  return userRole === "admin";
}

export const ALL_ROLES: AppRole[] = [
  "admin",
  "ketoan",
  "canbo_vt",
  "chihuy_ct",
  "viewer",
];
