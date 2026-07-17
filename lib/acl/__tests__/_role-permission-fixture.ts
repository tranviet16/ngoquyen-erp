/** Test fixture mirroring the built-in role module-permission matrix. */

type PermRow = { moduleKey: string; level: string };

export const ROLE_PERMISSION_SEED: Record<string, PermRow[]> = {
  admin: [],
  ketoan: [
    { moduleKey: "dashboard", level: "read" },
    { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" },
    { moduleKey: "du-an", level: "edit" }, { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" }, { moduleKey: "cong-no-nc", level: "edit" },
    { moduleKey: "thanh-toan.ke-hoach", level: "edit" }, { moduleKey: "thanh-toan.tong-hop", level: "read" },
    { moduleKey: "van-hanh.cong-viec", level: "edit" }, { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  chihuy_ct: [
    { moduleKey: "dashboard", level: "read" }, { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" }, { moduleKey: "du-an", level: "edit" },
    { moduleKey: "vat-tu-ncc", level: "edit" }, { moduleKey: "cong-no-vt", level: "edit" },
    { moduleKey: "cong-no-nc", level: "edit" }, { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "read" }, { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  canbo_vt: [
    { moduleKey: "dashboard", level: "read" }, { moduleKey: "thong-bao", level: "read" },
    { moduleKey: "van-hanh.hieu-suat", level: "read" }, { moduleKey: "vat-tu-ncc", level: "edit" },
    { moduleKey: "cong-no-vt", level: "edit" }, { moduleKey: "thanh-toan.ke-hoach", level: "edit" },
    { moduleKey: "thanh-toan.tong-hop", level: "read" }, { moduleKey: "van-hanh.cong-viec", level: "edit" },
    { moduleKey: "van-hanh.phieu-phoi-hop", level: "edit" },
  ],
  viewer: [
    { moduleKey: "dashboard", level: "read" }, { moduleKey: "thong-bao", level: "read" },
  ],
};

export function rolePermissionFindMany(args?: {
  where?: { roleId?: string };
}): Promise<PermRow[]> {
  const roleId = args?.where?.roleId ?? "";
  return Promise.resolve(ROLE_PERMISSION_SEED[roleId] ?? []);
}
