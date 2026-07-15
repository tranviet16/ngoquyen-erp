export const MODULE_KEYS = [
  "dashboard",
  "master-data",
  "du-an",
  "vat-tu-ncc",
  "sl-dt",
  "cong-no-vt",
  "cong-no-nc",
  "tai-chinh",
  "thanh-toan.ke-hoach",
  "thanh-toan.tong-hop",
  "van-hanh.cong-viec",
  "van-hanh.phieu-phoi-hop",
  "van-hanh.hieu-suat",
  "thong-bao",
  "admin.import",
  "admin.phong-ban",
  "admin.nguoi-dung",
  "admin.permissions",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// D2: no "none" — revoke = delete row.
export const ACCESS_LEVELS = ["read", "comment", "edit", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const LEVEL_RANK: Record<AccessLevel, number> = {
  read: 10,
  comment: 20,
  edit: 30,
  admin: 40,
};

// Per-module axis config — drives Phase 2 effective resolver
export type AxisType = "dept" | "project" | "role" | "admin-only" | "open";

export const MODULE_AXIS: Record<ModuleKey, AxisType> = {
  dashboard: "open",
  "master-data": "admin-only",
  "du-an": "project",
  "vat-tu-ncc": "dept",
  "sl-dt": "admin-only",
  "cong-no-vt": "dept",
  "cong-no-nc": "dept",
  "tai-chinh": "admin-only",
  "thanh-toan.ke-hoach": "dept",
  "thanh-toan.tong-hop": "dept",
  "van-hanh.cong-viec": "dept",
  "van-hanh.phieu-phoi-hop": "dept",
  "van-hanh.hieu-suat": "role",
  "thong-bao": "open",
  "admin.import": "admin-only",
  "admin.phong-ban": "admin-only",
  "admin.nguoi-dung": "admin-only",
  "admin.permissions": "admin-only",
};

export type ModuleAvailabilityStatus = "ready" | "development";

export type ModuleAvailabilityConfig = {
  /**
   * False blocks direct URL/API access through canAccess()/requireModuleAccess().
   * Admin users are blocked too; this is a product rollout switch, not RBAC.
   */
  enabled: boolean;
  /**
   * Keep true for disabled modules that should still appear in the sidebar as
   * a preview with a status badge. Set false to hide the module entirely.
   */
  showInMenu: boolean;
  status: ModuleAvailabilityStatus;
};

export const MODULE_AVAILABILITY: Record<ModuleKey, ModuleAvailabilityConfig> = {
  dashboard: { enabled: true, showInMenu: true, status: "ready" },
  "master-data": { enabled: true, showInMenu: true, status: "ready" },
  "du-an": { enabled: true, showInMenu: true, status: "ready" },
  "vat-tu-ncc": { enabled: true, showInMenu: true, status: "ready" },
  "sl-dt": { enabled: true, showInMenu: true, status: "ready" },
  "cong-no-vt": { enabled: true, showInMenu: true, status: "ready" },
  "cong-no-nc": { enabled: true, showInMenu: true, status: "ready" },
  "tai-chinh": { enabled: true, showInMenu: true, status: "ready" },
  "thanh-toan.ke-hoach": { enabled: true, showInMenu: true, status: "ready" },
  "thanh-toan.tong-hop": { enabled: true, showInMenu: true, status: "ready" },
  "van-hanh.cong-viec": { enabled: true, showInMenu: true, status: "ready" },
  "van-hanh.phieu-phoi-hop": { enabled: true, showInMenu: true, status: "ready" },
  "van-hanh.hieu-suat": { enabled: true, showInMenu: true, status: "ready" },
  "thong-bao": { enabled: true, showInMenu: true, status: "ready" },
  "admin.import": { enabled: true, showInMenu: true, status: "ready" },
  "admin.phong-ban": { enabled: true, showInMenu: true, status: "ready" },
  "admin.nguoi-dung": { enabled: true, showInMenu: true, status: "ready" },
  "admin.permissions": { enabled: true, showInMenu: true, status: "ready" },
};

export function getModuleAvailability(moduleKey: ModuleKey): ModuleAvailabilityConfig {
  return MODULE_AVAILABILITY[moduleKey];
}

export function isModuleEnabled(moduleKey: ModuleKey): boolean {
  return getModuleAvailability(moduleKey).enabled;
}

export function shouldShowModuleInMenu(moduleKey: ModuleKey): boolean {
  return getModuleAvailability(moduleKey).showInMenu;
}

export function isModuleInDevelopment(moduleKey: ModuleKey): boolean {
  const availability = getModuleAvailability(moduleKey);
  return !availability.enabled && availability.status === "development";
}
// D4: per-module valid level domain. Admin UI dropdown filters by this.
export const MODULE_LEVELS: Record<ModuleKey, readonly AccessLevel[]> = {
  dashboard: ["read"],
  "thong-bao": ["read"],
  "van-hanh.hieu-suat": ["read"],
  "master-data": ["admin"],
  "sl-dt": ["admin"],
  "tai-chinh": ["admin"],
  "admin.import": ["admin"],
  "admin.phong-ban": ["admin"],
  "admin.nguoi-dung": ["admin"],
  "admin.permissions": ["admin"],
  // dept + project axis modules: full RWE set
  "du-an": ["read", "comment", "edit"],
  "vat-tu-ncc": ["read", "comment", "edit"],
  "cong-no-vt": ["read", "comment", "edit"],
  "cong-no-nc": ["read", "comment", "edit"],
  "thanh-toan.ke-hoach": ["read", "comment", "edit"],
  "thanh-toan.tong-hop": ["read", "comment", "edit"],
  "van-hanh.cong-viec": ["read", "comment", "edit"],
  "van-hanh.phieu-phoi-hop": ["read", "comment", "edit"],
};

export function isValidLevelForModule(mk: ModuleKey, level: AccessLevel): boolean {
  return MODULE_LEVELS[mk].includes(level);
}
