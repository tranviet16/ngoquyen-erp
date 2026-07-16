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
  isValidLevelForModule,
} from "./modules";
export type {
  ModuleKey,
  AccessLevel,
  AxisType,
} from "./modules";

// Global module rollout status
export {
  MODULE_AVAILABILITY_STATUSES,
  loadModuleAvailabilityMap,
  getModuleAvailability,
  isModuleReleased,
  isModuleInDevelopment,
  assertModuleReleased,
} from "./module-availability";
export type {
  ModuleAvailabilityMap,
  ModuleAvailabilityStatus,
} from "./module-availability";
export {
  ModuleRequestError,
  moduleRequestStatus,
  requireReleasedModuleRequest,
} from "./released-module-request";
export type { ModuleRequestDenial } from "./released-module-request";

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
  canAccessEntitlement,
  assertAccess,
  checkRoleAxis,
  getViewableProjectIds,
} from "./effective";
export type { CanAccessOpts, ViewableProjectIds } from "./effective";
