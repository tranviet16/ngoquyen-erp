export const MODULE_KEYS = [
  "dashboard",
  "master-data",
  "du-an",
  "vat-tu-ncc",
  "sl-dt",
  "cong-no-vt",
  "cong-no-nc",
  "tai-chinh",
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
  "van-hanh.cong-viec": "dept",
  "van-hanh.phieu-phoi-hop": "dept",
  "van-hanh.hieu-suat": "role",
  "thong-bao": "open",
  "admin.import": "admin-only",
  "admin.phong-ban": "admin-only",
  "admin.nguoi-dung": "admin-only",
  "admin.permissions": "admin-only",
};

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
  "van-hanh.cong-viec": ["read", "comment", "edit"],
  "van-hanh.phieu-phoi-hop": ["read", "comment", "edit"],
};

export function isValidLevelForModule(mk: ModuleKey, level: AccessLevel): boolean {
  return MODULE_LEVELS[mk].includes(level);
}
