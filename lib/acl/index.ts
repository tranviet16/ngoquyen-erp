/**
 * ACL public API — re-exports from all sub-modules.
 * Import from "@/lib/acl" in application code.
 */

// Core type vocabulary
export {
  MODULE_KEYS,
  ACCESS_LEVELS,
  LEVEL_RANK,
  MODULE_AXIS,
  MODULE_LEVELS,
  getModuleAvailability,
  isModuleEnabled,
  isModuleInDevelopment,
  isValidLevelForModule,
  shouldShowModuleInMenu,
} from "./modules";
export type {
  ModuleKey,
  AccessLevel,
  AxisType,
  ModuleAvailabilityConfig,
  ModuleAvailabilityStatus,
} from "./modules";

// Role defaults (used by admin UI + seed scripts)
export { getDefaultModuleLevel } from "./role-defaults";

// Dynamic-role permissions + write guards
export {
  getRolePermissionMap,
  getRoleModuleLevel,
  hasRoleModuleAccess,
  requireRoleModuleAccess,
} from "./role-permissions";

// Loaders
export { getModuleAccessMap, getEffectiveModuleLevel } from "./module-access";
export { getProjectAccessMap, hasProjectAccess } from "./project-access";
export type { ProjectAccessMap } from "./project-access";

// Effective resolver (primary entry point)
export {
  canAccess,
  assertAccess,
  checkRoleAxis,
  getViewableProjectIds,
} from "./effective";
export type { CanAccessOpts, ViewableProjectIds } from "./effective";
