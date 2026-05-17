/**
 * Default module access level by AppRole when no explicit ModulePermission row exists.
 *
 * Fallback table (D-fallback):
 * | AppRole    | non-admin module                                      | admin module |
 * |------------|-------------------------------------------------------|--------------|
 * | admin      | (D1 short-circuit — fallback irrelevant)              | (D1)         |
 * | ketoan     | edit                                                  | null         |
 * | chihuy_ct  | edit                                                  | null         |
 * | canbo_vt   | edit (cong-no-vt, vat-tu-ncc, van-hanh.*, dashboard,  | null         |
 * |            |       thong-bao) else null                            |              |
 * | viewer     | read (dashboard, thong-bao) else null                 | null         |
 *
 * Always prefer explicit ModulePermission row over this fallback.
 */

import type { AppRole } from "../rbac";
import { MODULE_AXIS, type ModuleKey, type AccessLevel } from "./modules";

/** Modules that are "admin-only" axis — no non-admin fallback. */
function isAdminAxisModule(moduleKey: ModuleKey): boolean {
  return MODULE_AXIS[moduleKey] === "admin-only";
}

/** Modules where canbo_vt gets "edit" fallback. */
const CANBO_VT_EDIT_MODULES = new Set<ModuleKey>([
  "cong-no-vt",
  "vat-tu-ncc",
  "van-hanh.cong-viec",
  "van-hanh.phieu-phoi-hop",
  "van-hanh.hieu-suat",
  "thanh-toan.ke-hoach",
  "thanh-toan.tong-hop",
  "dashboard",
  "thong-bao",
]);

/** Modules where viewer gets "read" fallback. */
const VIEWER_READ_MODULES = new Set<ModuleKey>(["dashboard", "thong-bao"]);

/**
 * Returns the fallback AccessLevel for a given role + module when no explicit
 * ModulePermission row exists. Returns null if the role has no default access.
 *
 * Note: admin role is short-circuited at canAccess() level (D1), so this
 * function returns null for admin — it should never be called for admin users.
 */
export function getDefaultModuleLevel(
  role: AppRole,
  moduleKey: ModuleKey,
): AccessLevel | null {
  // admin: D1 handles this — should never reach fallback
  if (role === "admin") return null;

  // All non-admin roles get null for admin-axis modules
  if (isAdminAxisModule(moduleKey)) return null;

  switch (role) {
    case "ketoan":
    case "chihuy_ct":
      return "edit";

    case "canbo_vt":
      return CANBO_VT_EDIT_MODULES.has(moduleKey) ? "edit" : null;

    case "viewer":
      return VIEWER_READ_MODULES.has(moduleKey) ? "read" : null;

    default:
      return null;
  }
}
