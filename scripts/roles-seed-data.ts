/**
 * roles-seed-data.ts
 *
 * Single source of truth for the 5 built-in roles + their RolePermission matrix.
 * The matrix reproduces the legacy getDefaultModuleLevel() behaviour so the 14
 * existing users keep identical permissions after the dynamic-RBAC cutover.
 *
 * Pure data — no side effects. Imported by both `scripts/seed-roles.ts` (DB seed)
 * and `e2e/global-setup.ts` (test-DB bootstrap).
 *
 * Absence of a RolePermission row = no access to that module (fail-closed).
 */

export type RoleSeed = {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, "read" | "comment" | "edit" | "admin">;
};

// Module level legend: read | comment | edit | admin. No entry = no access.
export const ROLES: RoleSeed[] = [
  {
    id: "admin",
    name: "Quản trị viên",
    description: "Toàn quyền hệ thống. Ma trận chỉ để hiển thị — admin luôn được phép.",
    permissions: {
      dashboard: "read",
      "thong-bao": "read",
      "van-hanh.hieu-suat": "read",
      "du-an": "edit",
      "vat-tu-ncc": "edit",
      "cong-no-vt": "edit",
      "cong-no-nc": "edit",
      "thanh-toan.ke-hoach": "edit",
      "thanh-toan.tong-hop": "edit",
      "van-hanh.cong-viec": "edit",
      "van-hanh.phieu-phoi-hop": "edit",
      "master-data": "admin",
      "sl-dt": "admin",
      "tai-chinh": "admin",
      "admin.import": "admin",
      "admin.phong-ban": "admin",
      "admin.nguoi-dung": "admin",
      "admin.permissions": "admin",
    },
  },
  {
    id: "ketoan",
    name: "Kế toán",
    description: "Quyền ghi nghiệp vụ dự án, công nợ, vật tư, thanh toán, vận hành.",
    permissions: {
      dashboard: "read",
      "thong-bao": "read",
      "van-hanh.hieu-suat": "read",
      "du-an": "edit",
      "vat-tu-ncc": "edit",
      "cong-no-vt": "edit",
      "cong-no-nc": "edit",
      "thanh-toan.ke-hoach": "edit",
      "thanh-toan.tong-hop": "edit",
      "van-hanh.cong-viec": "edit",
      "van-hanh.phieu-phoi-hop": "edit",
    },
  },
  {
    id: "chihuy_ct",
    name: "Cán bộ kỹ thuật",
    description: "Quyền ghi nghiệp vụ dự án, công nợ, vật tư, thanh toán, vận hành.",
    permissions: {
      dashboard: "read",
      "thong-bao": "read",
      "van-hanh.hieu-suat": "read",
      "du-an": "edit",
      "vat-tu-ncc": "edit",
      "cong-no-vt": "edit",
      "cong-no-nc": "edit",
      "thanh-toan.ke-hoach": "edit",
      "thanh-toan.tong-hop": "edit",
      "van-hanh.cong-viec": "edit",
      "van-hanh.phieu-phoi-hop": "edit",
    },
  },
  {
    id: "canbo_vt",
    name: "Cán bộ vật tư",
    description: "Quyền ghi vật tư, công nợ vật tư, thanh toán, vận hành công việc.",
    permissions: {
      dashboard: "read",
      "thong-bao": "read",
      "van-hanh.hieu-suat": "read",
      "vat-tu-ncc": "edit",
      "cong-no-vt": "edit",
      "thanh-toan.ke-hoach": "edit",
      "thanh-toan.tong-hop": "edit",
      "van-hanh.cong-viec": "edit",
      "van-hanh.phieu-phoi-hop": "edit",
    },
  },
  {
    id: "viewer",
    name: "Người xem",
    description: "Chỉ xem dashboard và thông báo.",
    permissions: {
      dashboard: "read",
      "thong-bao": "read",
    },
  },
];
