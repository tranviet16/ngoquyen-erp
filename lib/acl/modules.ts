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
export const ACCESS_LEVELS = ["read", "comment", "create", "edit"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const LEVEL_RANK: Record<AccessLevel, number> = {
  read: 10,
  comment: 20,
  create: 30,
  edit: 40,
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

// D4: per-module valid level domain. Admin UI dropdown filters by this.
export const MODULE_LEVELS: Record<ModuleKey, readonly AccessLevel[]> = {
  dashboard: ["read"],
  "thong-bao": ["read"],
  "van-hanh.hieu-suat": ["read"],
  "master-data": [],
  "sl-dt": [],
  "tai-chinh": [],
  "admin.import": [],
  "admin.phong-ban": [],
  "admin.nguoi-dung": [],
  "admin.permissions": [],
  // Record modules: create is insert-only; edit permits create/update/delete.
  "du-an": ["read", "comment", "create", "edit"],
  "vat-tu-ncc": ["read", "comment", "create", "edit"],
  "cong-no-vt": ["read", "comment", "create", "edit"],
  "cong-no-nc": ["read", "comment", "create", "edit"],
  "thanh-toan.ke-hoach": ["read", "comment", "create", "edit"],
  "thanh-toan.tong-hop": ["read"],
  "van-hanh.cong-viec": ["read", "comment", "create", "edit"],
  "van-hanh.phieu-phoi-hop": ["read", "comment", "create", "edit"],
};

export function isValidLevelForModule(mk: ModuleKey, level: AccessLevel): boolean {
  return MODULE_LEVELS[mk].includes(level);
}
